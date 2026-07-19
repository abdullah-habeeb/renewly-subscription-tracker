// Mocked so tests can exercise the /api/reminders/run route's secret-guard
// logic without ever running the real job (which would hit Firestore and
// could send real emails to real users).
jest.mock('./jobs/reminders', () => ({
  runReminders: jest.fn().mockResolvedValue({ ok: true, usersChecked: 0, emailsSent: 0 }),
  scheduleReminders: jest.fn(),
}));

const request = require('supertest');
const app = require('./server');

describe('GET /health', () => {
  test('reports service status and feature flags', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.features).toEqual(
      expect.objectContaining({
        firestoreAdmin: expect.any(Boolean),
        gmailOAuth: expect.any(Boolean),
        plaidBank: expect.any(Boolean),
        email: expect.any(Boolean),
      }),
    );
  });
});

describe('auth guard', () => {
  test.each([
    ['get', '/api/gmail/status'],
    ['get', '/api/plaid/status'],
    ['post', '/api/gmail/scan'],
    ['post', '/api/plaid/scan'],
    ['post', '/api/reminders/test'],
  ])('%s %s rejects requests with no Authorization header', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  // Verifying a token — even a bogus one — makes Firebase Admin fetch
  // Google's public signing certs on a cold cache, which can take several
  // seconds on the first call. Generous timeout to avoid flaking on that.
  test('rejects an invalid bearer token', async () => {
    const res = await request(app)
      .get('/api/gmail/status')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  }, 15000);
});

describe('POST /api/reminders/run', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  test('rejects an incorrect x-cron-secret header', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await request(app)
      .post('/api/reminders/run')
      .set('x-cron-secret', 'wrong-secret');
    expect(res.status).toBe(401);
  });

  test('runs the (mocked) job when the secret matches', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await request(app)
      .post('/api/reminders/run')
      .set('x-cron-secret', 'test-secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, usersChecked: 0, emailsSent: 0 });
  });
});

describe('unknown routes', () => {
  test('returns 404 for a route that does not exist', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});
