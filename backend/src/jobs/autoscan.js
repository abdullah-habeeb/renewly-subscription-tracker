const { db, hasFirestore } = require('../firebase');
const gmail = require('../services/gmail');
const detectedStore = require('../services/detectedStore');
const mailer = require('../services/mailer');
const tokenStore = require('../services/tokenStore');

// Background re-scan cadence. Runs inside the daily job, but each user is
// only re-scanned once their newest scan is at least this stale — so the
// weekly rhythm self-heals no matter which days the free-tier cron actually
// fires on.
const RESCAN_EVERY_DAYS = 7;

function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86_400_000;
}

/**
 * Turns detection from pull into push: re-scan every opted-in user's linked
 * inboxes in the background and email a digest of anything new. Incremental
 * lookback (see gmail.scanLookbackDays) keeps these scans cheap.
 */
async function runAutoRescans() {
  if (!hasFirestore) {
    return { ok: false, error: 'Auto-rescan needs Firebase service credentials.' };
  }
  if (!gmail.isConfigured) {
    return { ok: false, error: 'Auto-rescan needs Google OAuth credentials.' };
  }

  const usersSnap = await db.collection('users').get();
  let usersScanned = 0;
  let found = 0;
  let digestsSent = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const user = userDoc.data();
    // Opt-out model: on unless the user switched it off in Settings.
    if (user.autoScan === false) continue;

    const accounts = (await tokenStore.listAccounts(uid)).filter(
      (a) => a.refreshToken && !a.needsReauth,
    );
    if (accounts.length === 0) continue;
    const freshest = Math.min(...accounts.map((a) => daysSince(a.lastScanAt)));
    if (freshest < RESCAN_EVERY_DAYS) continue;

    try {
      const { items } = await gmail.scanInbox(uid);
      usersScanned++;
      const { stored, storedItems } = await detectedStore.storeCandidates(uid, items, 'gmail');
      found += stored;

      if (stored > 0 && user.email && mailer.isConfigured) {
        try {
          await mailer.sendDigestEmail(user.email, storedItems);
          digestsSent++;
          console.log(`🔎 Auto-scan digest sent to ${user.email} (${stored} new)`);
        } catch (err) {
          console.warn(`Digest email failed for ${user.email}:`, err.message);
        }
      }
    } catch (err) {
      // One user's expired tokens or API hiccup never blocks the rest.
      console.warn(`Auto-rescan failed for ${uid}:`, err.message);
    }
  }

  return { ok: true, usersScanned, found, digestsSent };
}

module.exports = { runAutoRescans, RESCAN_EVERY_DAYS };
