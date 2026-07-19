const admin = require('firebase-admin');
const fs = require('fs');

const path = require('path');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'subscription-hub-19cf9';

// Resolve relative key-file paths against the backend root, not the process cwd,
// so `npm start` works from anywhere.
function keyFilePath() {
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  return p && !path.isAbsolute(p) ? path.join(__dirname, '..', p) : p;
}

// Credential resolution, most-specific first:
//  1. FIREBASE_SERVICE_ACCOUNT      — inline JSON (deploy platforms)
//  2. FIREBASE_SERVICE_ACCOUNT_FILE — path to a service-account key file
//  3. GOOGLE_APPLICATION_CREDENTIALS (handled by the SDK itself)
//  4. none — token verification still works (public certs), Firestore does not.
let hasFirestore = false;

function resolveCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  const keyFile = keyFilePath();
  if (keyFile && fs.existsSync(keyFile)) {
    return admin.credential.cert(JSON.parse(fs.readFileSync(keyFile, 'utf8')));
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }
  return null;
}

let credential = null;
try {
  credential = resolveCredential();
} catch (err) {
  console.error('⚠️  Failed to load Firebase service account credentials:', err.message);
}
if (credential) {
  admin.initializeApp({ credential, projectId: PROJECT_ID });
  hasFirestore = true;
  console.log('🔥 Firebase Admin initialized with service credentials (Firestore enabled)');
} else {
  admin.initializeApp({ projectId: PROJECT_ID });
  console.warn('⚠️  No Firebase service account configured — ID-token verification works, but the reminder cron and server-side Firestore access are disabled. See .env.example.');
}

const db = hasFirestore ? admin.firestore() : null;

module.exports = { admin, db, hasFirestore, PROJECT_ID };
