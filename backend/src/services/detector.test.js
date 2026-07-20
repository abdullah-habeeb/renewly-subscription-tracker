const {
  detectRecurring, extractAmount, identifyMerchant, demoDetections, bankDemoDetections, addCycle,
} = require('./detector');

describe('extractAmount', () => {
  test('parses ₹ amounts', () => {
    expect(extractAmount('Your payment of ₹649 was successful')).toBe(649);
  });

  test('parses amounts with thousands separators and decimals', () => {
    expect(extractAmount('Charged ₹1,999.50 to your card')).toBe(1999.5);
  });

  test('parses INR and Rs prefixes', () => {
    expect(extractAmount('Amount: INR 499')).toBe(499);
    expect(extractAmount('Rs. 299 debited')).toBe(299);
  });

  test('returns null when no amount is present', () => {
    expect(extractAmount('Thanks for your order')).toBeNull();
  });

  // Regression: without a word boundary before "Rs", the regex matched the
  // tail of ordinary words ending in "rs" and misread unrelated sentences
  // as prices — this exact sentence appeared in a real Adobe marketing
  // email and produced a false-positive ₹13/month "subscription".
  test('does not misread the tail of a word ending in "rs" as a Rupee prefix', () => {
    expect(extractAmount('Adobe services are available only to users 13 and older')).toBeNull();
    expect(extractAmount('Offers valid for 24 hours 30 minutes')).toBeNull();
    expect(extractAmount('Special offers 500 people redeemed this week')).toBeNull();
  });

  test('still matches a real Rs prefix at the start of a sentence', () => {
    expect(extractAmount('Rs 500 was charged to your account')).toBe(500);
  });

  test('returns null for a zero or negative amount', () => {
    expect(extractAmount('₹0 balance')).toBeNull();
  });
});

describe('identifyMerchant', () => {
  test('matches known merchants case-insensitively', () => {
    expect(identifyMerchant('Your NETFLIX payment was successful')?.name).toBe('Netflix');
    expect(identifyMerchant('spotify premium receipt')?.name).toBe('Spotify');
  });

  test('returns null for unrecognized merchants', () => {
    expect(identifyMerchant('Local Grocery Store purchase')).toBeNull();
  });

  // Regression: Google's real Play Store billing emails say "Google One
  // (Google AI Pro (5 TB))", not literally "Google One" on its own — a
  // plain /google\s?one/ pattern still happens to match here since "Google
  // One" appears verbatim, but AI Pro/Premium-only phrasing needs its own
  // branch so future emails that drop "Google One" entirely still match.
  test('matches Google One / AI Pro billing phrasing', () => {
    expect(identifyMerchant('Google One (Google AI Pro (5 TB)) trial ending')?.name).toBe('Google One');
    expect(identifyMerchant('Your Google AI Pro subscription payment')?.name).toBe('Google One');
    expect(identifyMerchant('Google One AI Premium renewal')?.name).toBe('Google One');
  });
});

describe('addCycle', () => {
  test('advances a monthly date by one month', () => {
    expect(addCycle('2026-01-15', 'monthly')).toBe('2026-02-15');
  });

  test('advances a yearly date by one year', () => {
    expect(addCycle('2026-01-15', 'yearly')).toBe('2027-01-15');
  });

  test('handles year rollover for December', () => {
    expect(addCycle('2026-12-20', 'monthly')).toBe('2027-01-20');
  });
});

describe('detectRecurring', () => {
  test('flags a known merchant billed ~30 days apart as monthly', () => {
    const result = detectRecurring([
      { merchantText: 'Netflix payment', amount: 649, date: '2026-05-01', subject: 'Netflix receipt' },
      { merchantText: 'Netflix payment', amount: 649, date: '2026-06-01', subject: 'Netflix receipt' },
      { merchantText: 'Netflix payment', amount: 649, date: '2026-07-01', subject: 'Netflix receipt' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Netflix', category: 'Entertainment', billingCycle: 'monthly', amount: 649 });
    expect(result[0].confidence).toBeGreaterThan(0.7);
  });

  test('flags charges ~365 days apart as yearly', () => {
    const result = detectRecurring([
      { merchantText: 'Amazon Prime membership', amount: 1499, date: '2025-01-10', subject: 'Prime receipt' },
      { merchantText: 'Amazon Prime membership', amount: 1499, date: '2026-01-10', subject: 'Prime receipt' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].billingCycle).toBe('yearly');
  });

  test('flags a single charge from a known subscription merchant at lower confidence', () => {
    const result = detectRecurring([
      { merchantText: 'ChatGPT Plus invoice', amount: 1999, date: '2026-06-01', subject: 'OpenAI invoice' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'ChatGPT Plus', billingCycle: 'monthly', confidence: 0.6 });
  });

  test('ignores a single charge from an unrecognized merchant', () => {
    const result = detectRecurring([
      { merchantText: 'Random Cafe purchase', amount: 250, date: '2026-06-01', subject: 'Receipt' },
    ]);
    expect(result).toHaveLength(0);
  });

  test('does not flag unknown-merchant charges at a non-subscription interval (e.g. weekly)', () => {
    const result = detectRecurring([
      { merchantText: 'Corner Store purchase', amount: 300, date: '2026-06-01', subject: 'Receipt' },
      { merchantText: 'Corner Store purchase', amount: 300, date: '2026-06-08', subject: 'Receipt' },
      { merchantText: 'Corner Store purchase', amount: 300, date: '2026-06-15', subject: 'Receipt' },
    ]);
    expect(result).toHaveLength(0);
  });

  test('groups charges by known merchant even when raw text varies', () => {
    const result = detectRecurring([
      { merchantText: 'NETFLIX.COM debit', amount: 649, date: '2026-05-01', subject: 'Debit alert' },
      { merchantText: 'Your Netflix subscription', amount: 649, date: '2026-06-01', subject: 'Payment receipt' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Netflix');
  });

  test('returns an empty array for no transactions', () => {
    expect(detectRecurring([])).toEqual([]);
  });

  // Regression: real Google One billing emails come in two flavors —
  // genuine receipts ("Price 30 GB (Google One) ₹59.00/month... Here's what
  // we charged you today") and pure reminders that merely *cite* a future
  // price ("Your trial for Google One will end... you'll be charged ₹1,950").
  // Both used to survive into the scanner's transaction list and get grouped
  // under the same bare "Google One" name, wrecking the interval-average
  // calculation and letting a stale reminder amount win over the real
  // receipt. gmail.js's isNonChargeNotice is what should keep the reminders
  // out before they ever reach here — this test locks in what detectRecurring
  // itself must do with the transactions that remain: a single real receipt
  // for a *different* plan than one already tracked must produce its own,
  // distinctly named candidate instead of colliding with it.
  test('labels distinct Google One plans separately so a new plan never collides with an existing one', () => {
    const result = detectRecurring([
      {
        merchantText:
          'You updated your subscription to Google LLC Google Play Price 30 GB (Google One) ₹59.00/month Total: ₹59.00',
        amount: 59,
        date: '2026-07-20',
        subject: 'You updated your subscription to Google LLC',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Google One (30 GB)', amount: 59, billingCycle: 'monthly' });
  });

  test('keeps repeat charges of the same Google One plan grouped together', () => {
    const receipt = (date) => ({
      merchantText: 'Your Google AI Pro (5 TB) payment Price (Google One) ₹1,950.00/month receipt',
      amount: 1950,
      date,
      subject: 'Google One payment receipt',
    });
    const result = detectRecurring([receipt('2026-05-20'), receipt('2026-06-20'), receipt('2026-07-20')]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Google One (AI Pro)', billingCycle: 'monthly', amount: 1950 });
  });

  test('a Google plan with no size/tier wording in the text stays a bare "Google One"', () => {
    const result = detectRecurring([
      { merchantText: 'Google One payment receipt', amount: 130, date: '2026-06-01', subject: 'Receipt' },
    ]);
    expect(result[0].name).toBe('Google One');
  });
});

describe('demo data', () => {
  test.each([
    ['demoDetections', demoDetections],
    ['bankDemoDetections', bankDemoDetections],
  ])('%s returns well-formed candidates with sensible dates', (_name, fn) => {
    const items = fn();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.amount).toBeGreaterThan(0);
      expect(['monthly', 'yearly']).toContain(item.billingCycle);
      expect(new Date(item.nextDueDate).getTime()).toBeGreaterThan(new Date(item.lastChargeDate).getTime());
      expect(item.confidence).toBeGreaterThan(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
    }
  });
});
