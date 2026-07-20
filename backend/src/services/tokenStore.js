const fs = require('fs');
const path = require('path');
const { db, hasFirestore } = require('../firebase');

// Gmail OAuth refresh tokens, one record per linked Gmail address. Stored in
// Firestore (`gmailTokens/{uid}/accounts/{address}`, blocked for clients by
// security rules) when admin credentials exist, otherwise in a local
// gitignored JSON file for development.
//
// Earlier versions stored a single account's fields directly on the
// `gmailTokens/{uid}` doc (or uid key in the file); every public function
// migrates that shape transparently so existing connections survive the
// multi-account upgrade.
function filePath() {
  return process.env.GMAIL_TOKENS_FILE || path.join(__dirname, '..', '..', '.data', 'gmail-tokens.json');
}

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(data) {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(data, null, 2));
}

function accountsCol(uid) {
  return db.collection('gmailTokens').doc(uid).collection('accounts');
}

// Legacy records without an address can't be keyed by email and are dropped —
// the user simply reconnects (handleCallback has stored the address since the
// first release, so in practice this never loses a token).
async function migrateLegacy(uid) {
  if (hasFirestore) {
    const ref = db.collection('gmailTokens').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    if (data && data.refreshToken) {
      if (data.address) {
        await accountsCol(uid).doc(data.address).set(
          {
            refreshToken: data.refreshToken,
            address: data.address,
            connectedAt: data.connectedAt || null,
            lastScanAt: data.lastScanAt || null,
          },
          { merge: true },
        );
      }
      // Deleting the parent doc leaves the subcollection intact.
      await ref.delete();
    }
    return;
  }

  const all = readFile();
  const rec = all[uid];
  if (rec && rec.refreshToken) {
    all[uid] = rec.address
      ? {
          accounts: {
            [rec.address]: {
              refreshToken: rec.refreshToken,
              address: rec.address,
              connectedAt: rec.connectedAt || null,
              lastScanAt: rec.lastScanAt || null,
            },
          },
        }
      : {};
    writeFile(all);
  }
}

async function listAccounts(uid) {
  await migrateLegacy(uid);
  if (hasFirestore) {
    const snap = await accountsCol(uid).get();
    return snap.docs.map((d) => ({ address: d.id, ...d.data() }));
  }
  const rec = readFile()[uid];
  const accounts = (rec && rec.accounts) || {};
  return Object.entries(accounts).map(([address, r]) => ({ ...r, address }));
}

async function setAccount(uid, address, record) {
  await migrateLegacy(uid);
  if (hasFirestore) {
    await accountsCol(uid).doc(address).set(record, { merge: true });
    return;
  }
  const all = readFile();
  const rec = all[uid] && all[uid].accounts ? all[uid] : { accounts: {} };
  rec.accounts[address] = { ...(rec.accounts[address] || {}), ...record };
  all[uid] = rec;
  writeFile(all);
}

async function removeAccount(uid, address) {
  await migrateLegacy(uid);
  if (hasFirestore) {
    await accountsCol(uid).doc(address).delete();
    return;
  }
  const all = readFile();
  if (all[uid] && all[uid].accounts) {
    delete all[uid].accounts[address];
    writeFile(all);
  }
}

async function removeAll(uid) {
  const accounts = await listAccounts(uid);
  if (hasFirestore) {
    await Promise.all(accounts.map((a) => accountsCol(uid).doc(a.address).delete()));
    return;
  }
  const all = readFile();
  delete all[uid];
  writeFile(all);
}

module.exports = { listAccounts, setAccount, removeAccount, removeAll };
