const {
  extractBodyText, isBulkMail, isNonChargeNotice, mergeAccountCandidates, scanLookbackDays,
} = require('./gmail');
const { extractAmount } = require('./detector');

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

describe('extractBodyText', () => {
  // Regression: real Gmail receipts (Google Play, App Store, etc.) very
  // often put the charge amount only in the HTML body — never in the short
  // auto-generated snippet — which is what originally made scanInbox miss
  // a real ₹1,950/month Google One subscription entirely.
  test('decodes a plain single-part body', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: b64('Your next payment of ₹1,950.00 is due on 17 Jul 2026.') },
    };
    expect(extractBodyText(payload)).toContain('₹1,950.00');
  });

  test('decodes and strips tags from an HTML body', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64('<html><body><table><tr><td>Summary</td></tr><tr><td>Next payment</td><td><b>₹1,950.00</b>/month</td></tr></table></body></html>') },
    };
    const text = extractBodyText(payload);
    expect(text).toContain('₹1,950.00');
    expect(text).not.toContain('<td>');
  });

  test('walks nested multipart/alternative payloads to find the html part', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64('Plain version, no price shown here.') } },
        { mimeType: 'text/html', body: { data: b64('<p>Amount charged: ₹649.00</p>') } },
      ],
    };
    expect(extractBodyText(payload)).toContain('₹649.00');
  });

  test('returns an empty string for a payload with no readable parts', () => {
    const payload = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'application/pdf', body: { data: b64('binary-ish') } }] };
    expect(extractBodyText(payload)).toBe('');
  });

  test('does not throw on malformed base64', () => {
    const payload = { mimeType: 'text/plain', body: { data: '%%%not-base64%%%' } };
    expect(() => extractBodyText(payload)).not.toThrow();
  });

  // Regression: a real Adobe marketing email's plain-text fallback part
  // printed a raw tracking link whose encoded query string happened to
  // contain the literal substring "RRS3pB" (...QUQzdkRRS3pBcXRY...) — read
  // as ₹3, a false-positive "subscription" this exact string produced
  // in production. URLs must never reach extractAmount.
  test('strips raw tracking URLs so they cannot be misread as an amount', () => {
    const payload = {
      mimeType: 'text/plain',
      body: {
        data: b64(
          'View in browser: https://mail.adobe.com/track?wl=x&ul=y&e5,15b30795,46f9b7&e=cDE9JTQwVzNXZVV4R0hRMmpZQzR0ZUxZZWolMkZhRFJyQlN2JTJGQUQzdkRRS3pBcXRYanB4Q2ZWR3RaejJBRm1CTlN6dHl0Y2JVbkh1bkhYYSUyQkc4dlVMTkdxbjJ2UEcxVnloRDE Check your e-signature status.',
        ),
      },
    };
    const text = extractBodyText(payload);
    expect(text).not.toMatch(/https?:\/\//i);
    expect(extractAmount(text)).toBeNull();
  });
});

describe('isBulkMail', () => {
  // Regression: real Adobe marketing newsletters ("Get Acrobat Express at
  // ₹399/mo!") were being misread as an actual ₹399/month charge, because
  // any known-merchant name + any amount anywhere in the email body was
  // treated as evidence of a bill. Verified against a real inbox: every
  // promo email carried List-Unsubscribe / Precedence: bulk; every real
  // billing/account notice carried neither — so this header check is what
  // actually distinguishes an advertised price from a real charge.
  test('flags mail with a List-Unsubscribe header as bulk', () => {
    expect(isBulkMail({ 'list-unsubscribe': '<mailto:unsub@adobe.com>' })).toBe(true);
  });

  test('flags mail with Precedence: bulk', () => {
    expect(isBulkMail({ precedence: 'bulk' })).toBe(true);
  });

  test('does not flag a real transactional notice with neither header', () => {
    expect(isBulkMail({ subject: 'Payment declined for Google One subscription' })).toBe(false);
  });

  test('handles an empty headers object', () => {
    expect(isBulkMail({})).toBe(false);
  });
});

describe('mergeAccountCandidates', () => {
  const cand = (name, confidence, account, extra = {}) => ({
    name,
    amount: 649,
    billingCycle: 'monthly',
    category: 'Entertainment',
    confidence,
    sourceAccounts: [account],
    ...extra,
  });

  test('keeps candidates with distinct names from different inboxes', () => {
    const merged = mergeAccountCandidates([
      cand('Netflix', 0.9, 'a@gmail.com'),
      cand('Spotify', 0.8, 'b@gmail.com'),
    ]);
    expect(merged).toHaveLength(2);
  });

  // A family Netflix plan billed to one inbox and receipted in another is
  // one subscription — never two rows.
  test('merges the same service found in two inboxes, remembering both', () => {
    const merged = mergeAccountCandidates([
      cand('Netflix', 0.9, 'a@gmail.com'),
      cand('netflix', 0.7, 'b@gmail.com'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sourceAccounts.sort()).toEqual(['a@gmail.com', 'b@gmail.com']);
  });

  test('the higher-confidence candidate wins the merge regardless of order', () => {
    const low = cand('Netflix', 0.6, 'a@gmail.com', { amount: 199 });
    const high = cand('Netflix', 0.95, 'b@gmail.com', { amount: 649 });
    for (const order of [[low, high], [high, low]]) {
      const merged = mergeAccountCandidates(order);
      expect(merged).toHaveLength(1);
      expect(merged[0].amount).toBe(649);
      expect(merged[0].confidence).toBe(0.95);
      expect(merged[0].sourceAccounts.sort()).toEqual(['a@gmail.com', 'b@gmail.com']);
    }
  });

  test('does not duplicate an address the winner already has', () => {
    const merged = mergeAccountCandidates([
      cand('Netflix', 0.9, 'a@gmail.com'),
      cand('Netflix', 0.7, 'a@gmail.com'),
    ]);
    expect(merged[0].sourceAccounts).toEqual(['a@gmail.com']);
  });

  test('tolerates candidates without sourceAccounts (AI second pass)', () => {
    const noAccounts = { name: 'Notion', amount: 350, billingCycle: 'monthly', category: 'Software', confidence: 0.8 };
    const merged = mergeAccountCandidates([noAccounts]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sourceAccounts).toEqual([]);
  });
});

describe('isNonChargeNotice', () => {
  // Regression, verified against the user's real inbox (2026-07-20): a
  // genuine ₹59/month Google One receipt landed the same week as several
  // notices about an unrelated ₹1,950 plan whose payment kept failing — all
  // of which cite the ₹1,950 figure without a charge ever completing. The
  // scanner grouped all of them as "Google One" charges, and the real
  // receipt lost out to a stale reminder. These must be filtered before
  // detectRecurring ever sees them.
  test('flags a subscription-suspended / payment-declined notice', () => {
    const text =
      'Google One subscription suspended due to payment issue Google Play Your subscription will be cancelled UPDATE PAYMENT Hello Abdullah, Your payment from UPI: QR code was declined. Update your payment method to get all of the benefits provided by Google AI';
    expect(isNonChargeNotice(text)).toBe(true);
  });

  test('flags a standalone payment-declined notice', () => {
    const text =
      'Payment declined for Google One subscription Google Play Your subscription will be cancelled UPDATE PAYMENT Hello Abdullah, Your payment from UPI: QR code was declined.';
    expect(isNonChargeNotice(text)).toBe(true);
  });

  test('flags a trial-ending reminder', () => {
    const text =
      "Your trial for Google One will end on 17 Jul 2026 Google Play Hi Abdullah, This is a reminder that your trial for Google One (Google AI Pro (5 TB)) on Google Play will end on 17 Jul 2026. You'll be automatically charged as described below";
    expect(isNonChargeNotice(text)).toBe(true);
  });

  // The real receipt: must survive untouched. Its only mention of "cancel"
  // is the standard "Learn how to cancel" footer link every Google Play
  // receipt carries — that alone must never trip the filter.
  test('does not flag a genuine completed-charge receipt', () => {
    const text =
      "You updated your subscription to Google LLC Google Play Thank you You updated your subscription purchase from Google Ireland Limited on Google Play. You will be automatically charged the subscription cost as described below until you cancel: Starting today: ₹59.00/month Here's what we charged you today: Order number: SOP.3323-2705-5690-63069 Price 30 GB (Google One) ₹59.00/month Total: ₹59.00 Payment method: Visa-0021 Learn how to cancel.";
    expect(isNonChargeNotice(text)).toBe(false);
  });

  test('does not flag an ordinary Netflix payment receipt', () => {
    expect(isNonChargeNotice('Your Netflix payment of ₹649 was successful. Thanks for being a member.')).toBe(false);
  });
});

describe('scanLookbackDays', () => {
  const now = new Date('2026-07-20T08:00:00Z');
  const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();

  test('first scan reads the full 180-day window', () => {
    expect(scanLookbackDays(undefined, now)).toBe(180);
    expect(scanLookbackDays(null, now)).toBe(180);
  });

  test('a recent re-scan shrinks to the 40-day floor, never below', () => {
    expect(scanLookbackDays(daysAgo(1), now)).toBe(40);
    expect(scanLookbackDays(daysAgo(30), now)).toBe(40);
  });

  test('a stale re-scan covers the gap plus margin', () => {
    expect(scanLookbackDays(daysAgo(100), now)).toBe(105);
  });

  test('caps at the full window for very stale scans', () => {
    expect(scanLookbackDays(daysAgo(400), now)).toBe(180);
  });

  test('an unparseable timestamp falls back to the full window', () => {
    expect(scanLookbackDays('not-a-date', now)).toBe(180);
  });
});
