const { buildEmailSummaries, mapExtracted } = require('./ai');

describe('buildEmailSummaries', () => {
  const tx = (over = {}) => ({
    merchantText: 'Some long merchant text '.repeat(50),
    amount: 649,
    date: '2026-07-01',
    subject: 'Your receipt',
    from: 'Netflix <billing@netflix.com>',
    snippet: 'Payment of ₹649 was successful',
    ...over,
  });

  test('produces compact numbered summaries', () => {
    const [s] = buildEmailSummaries([tx()]);
    expect(s).toMatchObject({
      id: 1,
      date: '2026-07-01',
      from: 'Netflix <billing@netflix.com>',
      subject: 'Your receipt',
      amountFound: 649,
    });
    expect(s.excerpt).toContain('₹649');
  });

  test('caps item count and excerpt length to bound token usage', () => {
    const many = Array.from({ length: 200 }, () => tx());
    const summaries = buildEmailSummaries(many, { maxItems: 80, maxSnippet: 300 });
    expect(summaries).toHaveLength(80);
    for (const s of summaries) expect(s.excerpt.length).toBeLessThanOrEqual(300);
  });

  test('falls back to merchantText when snippet is missing', () => {
    const [s] = buildEmailSummaries([tx({ snippet: undefined })]);
    expect(s.excerpt).toContain('Some long merchant text');
  });
});

describe('mapExtracted', () => {
  const valid = {
    name: 'Google One',
    amount: 1950,
    billingCycle: 'monthly',
    category: 'Cloud Storage',
    lastChargeDate: '2026-07-18',
    confidence: 0.9,
    evidence: 'Payment declined notice states ₹1,950.00/month',
  };

  test('maps a valid extraction into candidate shape with computed nextDueDate', () => {
    const [c] = mapExtracted([valid]);
    expect(c).toMatchObject({
      name: 'Google One',
      amount: 1950,
      billingCycle: 'monthly',
      category: 'Cloud Storage',
      lastChargeDate: '2026-07-18',
      nextDueDate: '2026-08-18',
      confidence: 0.9,
    });
    expect(c.evidence).toMatch(/^AI: /);
  });

  test('drops entries with invalid amount, date, or cycle', () => {
    expect(mapExtracted([{ ...valid, amount: 0 }])).toHaveLength(0);
    expect(mapExtracted([{ ...valid, amount: 'lots' }])).toHaveLength(0);
    expect(mapExtracted([{ ...valid, lastChargeDate: '18/07/2026' }])).toHaveLength(0);
    expect(mapExtracted([{ ...valid, billingCycle: 'weekly' }])).toHaveLength(0);
    expect(mapExtracted([{ ...valid, name: '' }])).toHaveLength(0);
  });

  test('normalizes an unknown category to Other and clamps confidence to [0,1]', () => {
    const [c] = mapExtracted([{ ...valid, category: 'Gaming', confidence: 3 }]);
    expect(c.category).toBe('Other');
    expect(c.confidence).toBe(1);
  });

  test('tolerates a non-array input from a malformed model response', () => {
    expect(mapExtracted(undefined)).toEqual([]);
    expect(mapExtracted({ oops: true })).toEqual([]);
  });
});
