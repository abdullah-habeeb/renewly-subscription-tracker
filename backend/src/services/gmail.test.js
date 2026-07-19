const { extractBodyText, isBulkMail } = require('./gmail');
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
