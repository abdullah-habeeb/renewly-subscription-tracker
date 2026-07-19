const fs = require('fs');
const path = require('path');
const { db, hasFirestore } = require('../firebase');

// Gmail OAuth refresh tokens. Stored in Firestore (collection `gmailTokens`,
// blocked for clients by security rules) when admin credentials exist,
// otherwise in a local gitignored JSON file for development.
const FILE = path.join(__dirname, '..', '..', '.data', 'gmail-tokens.json');

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

async function get(uid) {
  if (hasFirestore) {
    const snap = await db.collection('gmailTokens').doc(uid).get();
    return snap.exists ? snap.data() : null;
  }
  return readFile()[uid] || null;
}

async function set(uid, record) {
  if (hasFirestore) {
    await db.collection('gmailTokens').doc(uid).set(record, { merge: true });
  } else {
    const data = readFile();
    data[uid] = { ...(data[uid] || {}), ...record };
    writeFile(data);
  }
}

async function remove(uid) {
  if (hasFirestore) {
    await db.collection('gmailTokens').doc(uid).delete();
  } else {
    const data = readFile();
    delete data[uid];
    writeFile(data);
  }
}

module.exports = { get, set, remove };
