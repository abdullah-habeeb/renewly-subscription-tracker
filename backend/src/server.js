require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Initializes Firebase Admin as a side effect — keep this first.
const { db, hasFirestore } = require('./firebase');
const { requireAuth } = require('./middleware/auth');
const gmail = require('./services/gmail');
const plaid = require('./services/plaid');
const mailer = require('./services/mailer');
const ai = require('./services/ai');
const { demoDetections, bankDemoDetections } = require('./services/detector');
const { runReminders, scheduleReminders } = require('./jobs/reminders');

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({ origin: [FRONTEND_URL, 'http://localhost', 'http://localhost:3000'] }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

// ---------- Health ----------

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      firestoreAdmin: hasFirestore,
      gmailOAuth: gmail.isConfigured,
      plaidBank: plaid.isConfigured,
      email: mailer.isConfigured,
      aiExtraction: ai.isConfigured,
    },
  });
});

// ---------- Gmail detection ----------

app.get('/api/gmail/status', requireAuth, async (req, res) => {
  try {
    res.json(await gmail.getStatus(req.uid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get Gmail status' });
  }
});

app.get('/api/gmail/auth-url', requireAuth, (req, res) => {
  if (!gmail.isConfigured) {
    return res.json({ demo: true });
  }
  res.json({ url: gmail.getAuthUrl(req.uid), demo: false });
});

// OAuth redirect target — Google calls this, so no Authorization header here.
// The signed `state` parameter carries the uid.
app.get('/api/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/settings?gmail=error`);
  }
  try {
    await gmail.handleCallback(code, state);
    res.redirect(`${FRONTEND_URL}/settings?gmail=connected`);
  } catch (err) {
    console.error('Gmail callback failed:', err.message);
    res.redirect(`${FRONTEND_URL}/settings?gmail=error`);
  }
});

// Scans the inbox and returns subscription candidates. The client stores
// approved candidates in Firestore itself (it owns the user's session there).
app.post('/api/gmail/scan', requireAuth, async (req, res) => {
  try {
    if (!gmail.isConfigured) {
      return res.json({ demo: true, items: demoDetections() });
    }
    const items = await gmail.scanInbox(req.uid);
    res.json({ demo: false, items });
  } catch (err) {
    console.error('Scan failed:', err.message);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

app.post('/api/gmail/disconnect', requireAuth, async (req, res) => {
  try {
    await gmail.disconnect(req.uid);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ---------- Bank detection (Plaid) ----------

app.get('/api/plaid/status', requireAuth, async (req, res) => {
  try {
    res.json(await plaid.getStatus(req.uid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get bank connection status' });
  }
});

// Creates a Plaid Link token the client uses to open the bank-login modal.
// Plaid never sends bank credentials to our server — Link talks to the bank
// (or the bank's OAuth page) directly and only hands us a public_token.
app.post('/api/plaid/link-token', requireAuth, async (req, res) => {
  try {
    if (!plaid.isConfigured) {
      return res.json({ demo: true });
    }
    const linkToken = await plaid.createLinkToken(req.uid);
    res.json({ linkToken, demo: false });
  } catch (err) {
    console.error('Plaid link-token failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to start bank connection' });
  }
});

// Called after the user completes the Link flow with a public_token, which
// we exchange for a long-lived access_token (stored server-side only).
app.post('/api/plaid/exchange', requireAuth, async (req, res) => {
  try {
    const { publicToken, institutionName } = req.body || {};
    if (!publicToken) {
      return res.status(400).json({ error: 'Missing publicToken' });
    }
    await plaid.exchangePublicToken(req.uid, publicToken, institutionName);
    res.json({ ok: true });
  } catch (err) {
    console.error('Plaid exchange failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to link bank account' });
  }
});

// Pulls Plaid's own recurring-transaction detection for the linked account.
app.post('/api/plaid/scan', requireAuth, async (req, res) => {
  try {
    if (!plaid.isConfigured) {
      return res.json({ demo: true, items: bankDemoDetections() });
    }
    const items = await plaid.scanRecurring(req.uid);
    res.json({ demo: false, items });
  } catch (err) {
    console.error('Bank scan failed:', err.message);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

app.post('/api/plaid/disconnect', requireAuth, async (req, res) => {
  try {
    await plaid.disconnect(req.uid);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disconnect bank account' });
  }
});

// ---------- Reminders ----------

// Sends the signed-in user a real reminder email right now (their soonest
// renewals, or a sample if they have none / no server-side Firestore).
app.post('/api/reminders/test', requireAuth, async (req, res) => {
  try {
    if (!req.userEmail) {
      return res.status(400).json({ sent: false, error: 'Your account has no email address.' });
    }

    let subs = Array.isArray(req.body?.subscriptions) ? req.body.subscriptions : [];
    if (subs.length === 0 && hasFirestore) {
      const snap = await db
        .collection('subscriptions')
        .where('uid', '==', req.uid)
        .orderBy('nextDueDate')
        .limit(5)
        .get();
      subs = snap.docs.map((d) => d.data());
    }
    if (subs.length === 0) {
      const due = new Date();
      due.setDate(due.getDate() + 3);
      subs = [{ name: 'Netflix (sample)', amount: 649, billingCycle: 'monthly', nextDueDate: due.toISOString().split('T')[0] }];
    }

    const result = await mailer.sendReminderEmail(req.userEmail, subs.slice(0, 5));
    res.json(result);
  } catch (err) {
    console.error('Test reminder failed:', err.message);
    res.status(500).json({ sent: false, error: err.message });
  }
});

// Manual/external trigger for the daily job (e.g. cron-job.org on free hosts
// that sleep). Protected by CRON_SECRET when set; open in local dev otherwise.
app.post('/api/reminders/run', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!secret && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Set CRON_SECRET to enable this endpoint in production' });
  }
  res.json(await runReminders());
});

// ---------- Errors ----------

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- Start ----------

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Sublet API listening on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    scheduleReminders();
  });
}

module.exports = app;
