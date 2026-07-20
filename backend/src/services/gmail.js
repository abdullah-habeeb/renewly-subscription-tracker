const { google } = require('googleapis');
const crypto = require('crypto');
const tokenStore = require('./tokenStore');
const ai = require('./ai');
const { extractAmount, detectRecurring } = require('./detector');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback';
const STATE_SECRET = process.env.STATE_SECRET || CLIENT_SECRET || 'dev-state-secret';

const isConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

function oauthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

// OAuth `state` carries the uid across the redirect, signed so it can't be forged.
function signState(uid) {
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(uid).digest('hex').slice(0, 32);
  return Buffer.from(`${uid}.${sig}`).toString('base64url');
}

function verifyState(state) {
  try {
    const [uid, sig] = Buffer.from(state, 'base64url').toString().split('.');
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(uid).digest('hex').slice(0, 32);
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? uid : null;
  } catch {
    return null;
  }
}

function getAuthUrl(uid) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    // `consent` guarantees Google mints a refresh token on every connect;
    // `select_account` shows the account chooser, so a user linking their
    // second (or third) inbox isn't silently reconnected to the first one.
    prompt: 'consent select_account',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'email'],
    state: signState(uid),
  });
}

async function handleCallback(code, state) {
  const uid = verifyState(state);
  if (!uid) throw new Error('Invalid OAuth state');

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Which Gmail address did we just connect? Keys the account record, so
  // reconnecting the same address overwrites instead of duplicating.
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  if (!profile.email) throw new Error('Google did not return the account email');

  const record = {
    address: profile.email,
    connectedAt: new Date().toISOString(),
    needsReauth: false,
  };
  if (tokens.refresh_token) record.refreshToken = tokens.refresh_token;
  await tokenStore.setAccount(uid, profile.email, record);

  return uid;
}

async function getStatus(uid) {
  const accounts = await tokenStore.listAccounts(uid);
  const sanitized = accounts
    .map(({ address, connectedAt, lastScanAt, needsReauth }) => ({
      address,
      connectedAt: connectedAt || undefined,
      lastScanAt: lastScanAt || undefined,
      needsReauth: Boolean(needsReauth),
    }))
    .sort((a, b) => (a.connectedAt || '').localeCompare(b.connectedAt || ''));
  return {
    configured: isConfigured,
    connected: sanitized.length > 0,
    accounts: sanitized,
    // Kept for any client still on the single-account shape.
    address: sanitized[0] ? sanitized[0].address : undefined,
    lastScanAt: sanitized[0] ? sanitized[0].lastScanAt : undefined,
    demo: !isConfigured,
  };
}

// Disconnects one linked address, or every one when no address is given.
async function disconnect(uid, address) {
  const accounts = await tokenStore.listAccounts(uid);
  const targets = address ? accounts.filter((a) => a.address === address) : accounts;
  for (const account of targets) {
    if (account.refreshToken) {
      try {
        await oauthClient().revokeToken(account.refreshToken);
      } catch {
        // Token already expired or revoked — removing our record is enough.
      }
    }
    await tokenStore.removeAccount(uid, account.address);
  }
}

// How far back a scan reaches. First scans read the full window; re-scans
// shrink it to (days since the last scan + margin) — but never below
// MIN_LOOKBACK_DAYS, so monthly-interval detection still sees at least two
// charges of anything that bills inside the window. Yearly detection never
// relied on the 180-day window anyway (two charges a year apart can't both
// fit); it comes from known-merchant single charges.
const FULL_LOOKBACK_DAYS = 180;
const MIN_LOOKBACK_DAYS = 40;

function scanLookbackDays(lastScanAt, now = new Date()) {
  if (!lastScanAt) return FULL_LOOKBACK_DAYS;
  const last = new Date(lastScanAt).getTime();
  if (Number.isNaN(last)) return FULL_LOOKBACK_DAYS;
  const daysSince = Math.ceil((now.getTime() - last) / 86_400_000);
  return Math.min(FULL_LOOKBACK_DAYS, Math.max(MIN_LOOKBACK_DAYS, daysSince + 5));
}

// Gmail search queries that surface bank debit alerts and subscription receipts.
function searchQueries(lookbackDays) {
  return [
    `newer_than:${lookbackDays}d (subject:(debited OR "payment successful" OR receipt OR renewal OR invoice OR "auto pay" OR autopay) (₹ OR INR OR Rs))`,
    `newer_than:${lookbackDays}d from:(netflix.com OR spotify.com OR google.com OR apple.com OR amazon.in OR openai.com OR adobe.com OR hotstar.com)`,
  ];
}

// Decodes and flattens the readable text out of a Gmail message payload
// (walking multipart MIME), stripping HTML tags. Capped — we only need
// enough text to find a price, not the whole receipt.
const MAX_BODY_CHARS = 4000;

function extractBodyText(payload) {
  let text = '';
  function walk(part) {
    if (!part || text.length >= MAX_BODY_CHARS) return;
    if (part.body && part.body.data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')) {
      try {
        text += Buffer.from(part.body.data, 'base64').toString('utf8') + ' ';
      } catch {
        // Malformed part encoding — skip it rather than fail the whole scan.
      }
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return text
    .replace(/<[^>]+>/g, ' ')
    // Strip raw URLs — plain-text fallback parts print tracking links as
    // visible text, and their encoded query strings can coincidentally
    // contain "Rs123"-shaped substrings that look like a real amount.
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BODY_CHARS);
}

// List-Unsubscribe / Precedence: bulk (RFC 2369 / RFC 2076) are markers
// required on mass mail, essentially never present on real transactional
// receipts. Verified against a real inbox: promo/newsletter mail always
// carried these headers, real billing/account notices never did. Bulk mail
// frequently advertises prices for products the user doesn't own ("Get X
// at ₹399/mo!"), which would otherwise masquerade as a real charge.
function isBulkMail(headers) {
  return Boolean(headers['list-unsubscribe']) || /bulk/i.test(headers.precedence || '');
}

// Distinguishes an actual completed charge from mail that merely *mentions*
// an amount — trial-ending reminders, declined-payment alerts, and
// suspension notices all cite what you'd be charged without a charge ever
// happening. Verified against a real inbox: a Google One "subscription
// suspended due to payment issue" email and two "your trial will end"
// reminders all quoted the plan's ₹1,950 price, none of them a real charge —
// while the genuine ₹59 receipt for a *different*, newly purchased plan said
// none of these things. Left unfiltered, the phantom entries corrupt a
// merchant's charge history: their scattered dates wreck the interval-
// average calculation, and one can even get picked as "the last charge"
// over the real receipt. "cancel"/"trial" alone are too common in ordinary
// receipt footers ("Learn how to cancel") to use as bare signals — every
// phrase here specifically describes a failed, pending, or expiring state.
function isNonChargeNotice(text) {
  return /payment (?:was |is )?declined|subscription (?:suspended|will be cancell?ed|cancell?ed)|trial (?:for [^.]*)?will end|your trial (?:has|will) end(?:ed)?|update (?:your )?payment(?:\s?method)?|payment (?:failed|issue|unsuccessful)|reactivate your subscription/i.test(
    text,
  );
}

// Pulls candidate billing transactions out of one linked inbox.
async function scanAccountTransactions(account) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: account.refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: client });

  // Collect unique message ids across queries (bounded to keep scans fast).
  const ids = new Set();
  for (const q of searchQueries(scanLookbackDays(account.lastScanAt))) {
    const { data } = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100 });
    for (const m of data.messages || []) ids.add(m.id);
    if (ids.size >= 200) break;
  }

  const transactions = [];
  for (const id of ids) {
    try {
      // Fast path: headers + snippet only. Cheap, and enough for receipts
      // that put the price right up front.
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date', 'List-Unsubscribe', 'Precedence'],
      });

      const headers = Object.fromEntries(
        (msg.payload.headers || []).map((h) => [h.name.toLowerCase(), h.value]),
      );

      if (isBulkMail(headers)) continue;

      const subject = headers.subject || '';
      const from = headers.from || '';
      const snippet = msg.snippet || '';
      let text = `${subject} ${from} ${snippet}`;
      let amount = extractAmount(text);

      // Slow path: many real receipts (Google Play, App Store, etc.) only
      // put the amount inside the HTML body, never in the snippet — refetch
      // the full message and search that instead of giving up.
      if (!amount) {
        const { data: full } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        const bodyText = extractBodyText(full.payload);
        text = `${text} ${bodyText}`;
        amount = extractAmount(text);
      }

      if (!amount) continue;
      if (isNonChargeNotice(text)) continue;

      const date = new Date(Number(msg.internalDate)).toISOString().split('T')[0];
      transactions.push({ merchantText: text, amount, date, subject, from, snippet });
    } catch (err) {
      console.warn(`Skipping message ${id}: ${err.message}`);
    }
  }

  return transactions;
}

// The same service charged in two linked inboxes (family plans, forwarded
// receipts) is one subscription, not two: merge by name, keep the higher-
// confidence candidate, and remember every inbox it appeared in.
function mergeAccountCandidates(candidates) {
  const byName = new Map();
  for (const cand of candidates) {
    const key = cand.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { ...cand, sourceAccounts: [...(cand.sourceAccounts || [])] });
      continue;
    }
    const candWins = (cand.confidence || 0) > (prev.confidence || 0);
    const keep = candWins ? { ...cand, sourceAccounts: [...(cand.sourceAccounts || [])] } : prev;
    const other = candWins ? prev : cand;
    for (const addr of other.sourceAccounts || []) {
      if (!keep.sourceAccounts.includes(addr)) keep.sourceAccounts.push(addr);
    }
    byName.set(key, keep);
  }
  return [...byName.values()];
}

// Google reports an expired/revoked refresh token as invalid_grant. With the
// OAuth app in testing mode this happens naturally every ~7 days.
const TOKEN_EXPIRED = /invalid_grant|invalid_rapt/i;

async function scanAccount(uid, account) {
  try {
    const transactions = await scanAccountTransactions(account);
    const candidates = detectRecurring(transactions);

    // Second pass: Claude fits emails the regex heuristics couldn't — unknown
    // merchants, single charges, unusual phrasing. Best-effort: any AI failure
    // leaves the heuristic results intact.
    if (ai.isConfigured && transactions.length > 0) {
      try {
        const aiCandidates = await ai.extractSubscriptions(transactions);
        const known = new Set(candidates.map((c) => c.name.toLowerCase()));
        for (const item of aiCandidates) {
          if (known.has(item.name.toLowerCase())) continue;
          known.add(item.name.toLowerCase());
          candidates.push(item);
        }
      } catch (err) {
        console.warn('AI extraction failed (continuing with heuristic results):', err.message);
      }
    }

    await tokenStore.setAccount(uid, account.address, {
      lastScanAt: new Date().toISOString(),
      needsReauth: false,
    });
    return {
      address: account.address,
      ok: true,
      candidates: candidates.map((c) => ({ ...c, sourceAccounts: [account.address] })),
    };
  } catch (err) {
    const needsReauth = TOKEN_EXPIRED.test(err.message || '');
    if (needsReauth) {
      await tokenStore.setAccount(uid, account.address, { needsReauth: true });
    }
    console.warn(`Gmail scan failed for ${account.address}: ${err.message}`);
    return {
      address: account.address,
      ok: false,
      error: needsReauth
        ? 'Access expired — reconnect this account'
        : err.message || 'Scan failed',
      candidates: [],
    };
  }
}

// Scans every linked inbox (in parallel — Gmail quotas are per Google
// account) and merges the findings. One account failing, e.g. an expired
// test-mode token, never blocks the others.
async function scanInbox(uid) {
  const accounts = (await tokenStore.listAccounts(uid)).filter((a) => a.refreshToken);
  if (accounts.length === 0) {
    throw new Error('Gmail is not connected');
  }

  const results = await Promise.all(accounts.map((account) => scanAccount(uid, account)));

  if (results.every((r) => !r.ok)) {
    // Nothing scanned at all — surface the failure instead of a silent empty result.
    throw new Error(results[0].error || 'Scan failed');
  }

  return {
    items: mergeAccountCandidates(results.flatMap((r) => r.candidates)),
    accounts: results.map(({ address, ok, error, candidates }) => ({
      address,
      ok,
      error,
      found: candidates.length,
    })),
  };
}

module.exports = {
  isConfigured, getAuthUrl, handleCallback, getStatus, disconnect, scanInbox,
  extractBodyText, isBulkMail, isNonChargeNotice, mergeAccountCandidates, scanLookbackDays,
};
