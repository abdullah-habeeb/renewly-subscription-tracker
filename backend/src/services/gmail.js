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
    prompt: 'consent',
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

  // Which Gmail address did we just connect?
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  await tokenStore.set(uid, {
    refreshToken: tokens.refresh_token,
    address: profile.email,
    connectedAt: new Date().toISOString(),
  });

  return uid;
}

async function getStatus(uid) {
  const record = await tokenStore.get(uid);
  return {
    configured: isConfigured,
    connected: Boolean(record && record.refreshToken),
    address: record ? record.address : undefined,
    lastScanAt: record ? record.lastScanAt : undefined,
    demo: !isConfigured,
  };
}

async function disconnect(uid) {
  await tokenStore.remove(uid);
}

// Gmail search queries that surface bank debit alerts and subscription receipts.
const SEARCH_QUERIES = [
  'newer_than:180d (subject:(debited OR "payment successful" OR receipt OR renewal OR invoice OR "auto pay" OR autopay) (₹ OR INR OR Rs))',
  'newer_than:180d from:(netflix.com OR spotify.com OR google.com OR apple.com OR amazon.in OR openai.com OR adobe.com OR hotstar.com)',
];

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

async function scanInbox(uid) {
  const record = await tokenStore.get(uid);
  if (!record || !record.refreshToken) {
    throw new Error('Gmail is not connected');
  }

  const client = oauthClient();
  client.setCredentials({ refresh_token: record.refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: client });

  // Collect unique message ids across queries (bounded to keep scans fast).
  const ids = new Set();
  for (const q of SEARCH_QUERIES) {
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

      const date = new Date(Number(msg.internalDate)).toISOString().split('T')[0];
      transactions.push({ merchantText: text, amount, date, subject, from, snippet });
    } catch (err) {
      console.warn(`Skipping message ${id}: ${err.message}`);
    }
  }

  await tokenStore.set(uid, { lastScanAt: new Date().toISOString() });

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

  return candidates;
}

module.exports = {
  isConfigured, getAuthUrl, handleCallback, getStatus, disconnect, scanInbox, extractBodyText, isBulkMail,
};
