const fs = require('fs');
const os = require('os');
const path = require('path');

// Without Firebase Admin credentials (the test environment), tokenStore falls
// back to its JSON file — point it at a throwaway temp file per test.
const tokenStore = require('./tokenStore');

let tmpFile;

beforeEach(() => {
  tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'renewly-tokens-')), 'tokens.json');
  process.env.GMAIL_TOKENS_FILE = tmpFile;
});

afterEach(() => {
  delete process.env.GMAIL_TOKENS_FILE;
  fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
});

describe('tokenStore (multi-account, file fallback)', () => {
  test('lists nothing for an unknown uid', async () => {
    expect(await tokenStore.listAccounts('u1')).toEqual([]);
  });

  test('stores and lists multiple accounts per uid', async () => {
    await tokenStore.setAccount('u1', 'a@gmail.com', { refreshToken: 'ra', address: 'a@gmail.com' });
    await tokenStore.setAccount('u1', 'b@gmail.com', { refreshToken: 'rb', address: 'b@gmail.com' });
    const accounts = await tokenStore.listAccounts('u1');
    expect(accounts.map((a) => a.address).sort()).toEqual(['a@gmail.com', 'b@gmail.com']);
    expect(accounts.find((a) => a.address === 'a@gmail.com').refreshToken).toBe('ra');
  });

  test('setAccount merges into an existing record instead of replacing it', async () => {
    await tokenStore.setAccount('u1', 'a@gmail.com', { refreshToken: 'ra', connectedAt: '2026-01-01' });
    await tokenStore.setAccount('u1', 'a@gmail.com', { lastScanAt: '2026-07-20' });
    const [account] = await tokenStore.listAccounts('u1');
    expect(account.refreshToken).toBe('ra');
    expect(account.lastScanAt).toBe('2026-07-20');
  });

  test('removeAccount deletes only the targeted address', async () => {
    await tokenStore.setAccount('u1', 'a@gmail.com', { refreshToken: 'ra' });
    await tokenStore.setAccount('u1', 'b@gmail.com', { refreshToken: 'rb' });
    await tokenStore.removeAccount('u1', 'a@gmail.com');
    const accounts = await tokenStore.listAccounts('u1');
    expect(accounts.map((a) => a.address)).toEqual(['b@gmail.com']);
  });

  test('removeAll wipes every account for the uid', async () => {
    await tokenStore.setAccount('u1', 'a@gmail.com', { refreshToken: 'ra' });
    await tokenStore.setAccount('u1', 'b@gmail.com', { refreshToken: 'rb' });
    await tokenStore.removeAll('u1');
    expect(await tokenStore.listAccounts('u1')).toEqual([]);
  });

  test('uids are isolated from each other', async () => {
    await tokenStore.setAccount('u1', 'a@gmail.com', { refreshToken: 'ra' });
    await tokenStore.setAccount('u2', 'b@gmail.com', { refreshToken: 'rb' });
    expect((await tokenStore.listAccounts('u1')).map((a) => a.address)).toEqual(['a@gmail.com']);
    expect((await tokenStore.listAccounts('u2')).map((a) => a.address)).toEqual(['b@gmail.com']);
  });

  // The pre-multi-account release stored one account's fields directly on the
  // uid key. That shape must keep working: the user's production Gmail
  // connection has to survive the upgrade without a reconnect.
  test('migrates a legacy single-account record on first read', async () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        u1: {
          refreshToken: 'legacy-token',
          address: 'me@gmail.com',
          connectedAt: '2026-07-01T00:00:00.000Z',
          lastScanAt: '2026-07-10T00:00:00.000Z',
        },
      }),
    );

    const accounts = await tokenStore.listAccounts('u1');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      address: 'me@gmail.com',
      refreshToken: 'legacy-token',
      lastScanAt: '2026-07-10T00:00:00.000Z',
    });

    // The file itself is rewritten to the new shape — migration runs once.
    const raw = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    expect(raw.u1.refreshToken).toBeUndefined();
    expect(raw.u1.accounts['me@gmail.com'].refreshToken).toBe('legacy-token');
  });

  test('drops a legacy record with no address (user just reconnects)', async () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ u1: { refreshToken: 'orphan' } }));
    expect(await tokenStore.listAccounts('u1')).toEqual([]);
  });

  test('legacy migration keeps working through setAccount too', async () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ u1: { refreshToken: 'legacy', address: 'old@gmail.com' } }),
    );
    await tokenStore.setAccount('u1', 'new@gmail.com', { refreshToken: 'fresh' });
    const accounts = await tokenStore.listAccounts('u1');
    expect(accounts.map((a) => a.address).sort()).toEqual(['new@gmail.com', 'old@gmail.com']);
  });
});
