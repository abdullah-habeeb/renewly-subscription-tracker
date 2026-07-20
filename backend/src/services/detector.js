// Recurring-charge detection from parsed email transactions.

const KNOWN_MERCHANTS = [
  { match: /netflix/i, name: 'Netflix', category: 'Entertainment' },
  { match: /spotify/i, name: 'Spotify', category: 'Music' },
  { match: /hotstar|disney/i, name: 'Disney+ Hotstar', category: 'Entertainment' },
  { match: /prime\s?video|amazon\s?prime/i, name: 'Amazon Prime', category: 'Entertainment' },
  { match: /youtube\s?premium/i, name: 'YouTube Premium', category: 'Entertainment' },
  { match: /google\s?(one|ai\s?pro|ai\s?premium)/i, name: 'Google One', category: 'Cloud Storage' },
  { match: /icloud|apple\.com|apple\s?services/i, name: 'Apple Services', category: 'Cloud Storage' },
  { match: /adobe/i, name: 'Adobe Creative Cloud', category: 'Software' },
  { match: /microsoft\s?365|office\s?365/i, name: 'Microsoft 365', category: 'Software' },
  { match: /canva/i, name: 'Canva', category: 'Software' },
  { match: /notion/i, name: 'Notion', category: 'Software' },
  { match: /openai|chatgpt/i, name: 'ChatGPT Plus', category: 'Software' },
  { match: /cult\.?fit|cultfit/i, name: 'Cult.fit', category: 'Fitness' },
  { match: /zomato\s?(gold|pro)/i, name: 'Zomato Gold', category: 'Food' },
  { match: /swiggy\s?one/i, name: 'Swiggy One', category: 'Food' },
  { match: /jio|airtel|vi\b|vodafone/i, name: 'Mobile Recharge', category: 'Utilities' },
  { match: /audible/i, name: 'Audible', category: 'Education' },
  { match: /linkedin/i, name: 'LinkedIn Premium', category: 'Education' },
];

/**
 * ₹ / INR / Rs amount extraction from email text.
 * "Rs"/"INR" require a word boundary before them — without it, "Rs" also
 * matches the tail of any word ending in those letters ("use[rs] 13",
 * "offe[rs] 500", "hou[rs] 24"), turning ordinary sentences into fake prices.
 */
function extractAmount(text) {
  const m = text.match(/(?:₹|\bINR|\bRs\.?)\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function identifyMerchant(text) {
  for (const merchant of KNOWN_MERCHANTS) {
    if (merchant.match.test(text)) return merchant;
  }
  return null;
}

// "Google One" covers materially different products at different price
// points — a plain storage top-up vs. the AI Pro/Premium plans — that a
// user can genuinely hold at the same time. Collapsing every match into one
// bare "Google One" bucket merges unrelated charge histories together (see
// detectRecurring) and, even once grouped correctly, would make a brand-new
// plan collide by name with one the user already tracks, silently blocking
// it from ever being offered. Verified against a real inbox: a receipt
// reading "Price 30 GB (Google One) ₹59.00/month" is a different plan than
// one that mentions "Google AI Pro (5 TB)" — tag each with what the email
// actually says so they stay distinguishable.
function googleOnePlanLabel(text) {
  if (/ai\s?pro/i.test(text)) return 'AI Pro';
  if (/ai\s?premium/i.test(text)) return 'AI Premium';
  const size = text.match(/(\d+(?:\.\d+)?\s?(?:GB|TB))\s*\(Google One\)/i);
  return size ? size[1].replace(/\s+/g, ' ').trim() : null;
}

function daysBetween(a, b) {
  return Math.abs(new Date(b) - new Date(a)) / 86_400_000;
}

// YYYY-MM-DD in local time (toISOString would shift a day for UTC+ zones).
function toLocalISO(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addCycle(dateStr, cycle) {
  const d = new Date(dateStr + 'T00:00:00');
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return toLocalISO(d);
}

/**
 * transactions: [{ merchantText, amount, date (YYYY-MM-DD), subject }]
 * Returns detected subscription candidates.
 */
function detectRecurring(transactions) {
  const groups = new Map();

  for (const tx of transactions) {
    const merchant = identifyMerchant(tx.merchantText);
    const variant = merchant && merchant.name === 'Google One' ? googleOnePlanLabel(tx.merchantText) : null;
    const displayName = merchant ? (variant ? `${merchant.name} (${variant})` : merchant.name) : null;
    const key = displayName || tx.merchantText.toLowerCase().slice(0, 40);
    if (!groups.has(key)) groups.set(key, { merchant, displayName, txs: [] });
    groups.get(key).txs.push(tx);
  }

  const detected = [];

  for (const { merchant, displayName, txs } of groups.values()) {
    txs.sort((a, b) => new Date(a.date) - new Date(b.date));
    const last = txs[txs.length - 1];
    const name = displayName || titleCase(last.merchantText);
    const category = merchant ? merchant.category : 'Other';

    if (txs.length >= 2) {
      // Interval between consecutive charges decides the cycle.
      const gaps = [];
      for (let i = 1; i < txs.length; i++) gaps.push(daysBetween(txs[i - 1].date, txs[i].date));
      const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;

      let cycle = null;
      if (avg >= 25 && avg <= 35) cycle = 'monthly';
      else if (avg >= 350 && avg <= 380) cycle = 'yearly';

      if (cycle) {
        detected.push({
          name,
          category,
          amount: last.amount,
          billingCycle: cycle,
          lastChargeDate: last.date,
          nextDueDate: addCycle(last.date, cycle),
          confidence: Math.min(0.95, 0.7 + txs.length * 0.05),
          evidence: `${txs.length} charges of ~₹${last.amount} seen, ${Math.round(avg)} days apart. Last: "${last.subject}"`,
        });
        continue;
      }
    }

    // Single charge from a known subscription merchant → likely monthly.
    if (merchant) {
      detected.push({
        name,
        category,
        amount: last.amount,
        billingCycle: 'monthly',
        lastChargeDate: last.date,
        nextDueDate: addCycle(last.date, 'monthly'),
        confidence: 0.6,
        evidence: `Known subscription merchant. Charge found: "${last.subject}"`,
      });
    }
  }

  return detected;
}

function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Realistic sample data used when no Google OAuth credentials are configured. */
function demoDetections() {
  const today = new Date();
  const iso = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return toLocalISO(d);
  };

  const items = [
    { name: 'Netflix', category: 'Entertainment', amount: 649, billingCycle: 'monthly', lastChargeDate: iso(12), confidence: 0.95, evidence: '3 charges of ₹649, ~30 days apart. Last: "Your Netflix payment was successful"' },
    { name: 'Spotify', category: 'Music', amount: 119, billingCycle: 'monthly', lastChargeDate: iso(5), confidence: 0.92, evidence: '4 charges of ₹119, ~30 days apart. Last: "Receipt for your Spotify Premium subscription"' },
    { name: 'Google One', category: 'Cloud Storage', amount: 130, billingCycle: 'monthly', lastChargeDate: iso(20), confidence: 0.88, evidence: '2 charges of ₹130, ~31 days apart. Last: "Your Google One payment receipt"' },
    { name: 'Amazon Prime', category: 'Entertainment', amount: 1499, billingCycle: 'yearly', lastChargeDate: iso(90), confidence: 0.85, evidence: 'Yearly charge of ₹1,499. Last: "Your Amazon Prime membership receipt"' },
    { name: 'ChatGPT Plus', category: 'Software', amount: 1999, billingCycle: 'monthly', lastChargeDate: iso(8), confidence: 0.9, evidence: '2 charges of ₹1,999, ~30 days apart. Last: "Your OpenAI invoice"' },
  ];

  return items.map((item) => ({
    ...item,
    nextDueDate: addCycle(item.lastChargeDate, item.billingCycle),
  }));
}

/** Realistic sample data used when no Plaid credentials are configured. */
function bankDemoDetections() {
  const today = new Date();
  const iso = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return toLocalISO(d);
  };

  const items = [
    { name: 'Netflix', category: 'Entertainment', amount: 649, billingCycle: 'monthly', lastChargeDate: iso(9), confidence: 0.97, evidence: '3 debits of ₹649.00 from HDFC Bank •••4521, ~30 days apart. Merchant: "NETFLIX.COM"' },
    { name: 'Amazon Prime', category: 'Entertainment', amount: 1499, billingCycle: 'yearly', lastChargeDate: iso(60), confidence: 0.9, evidence: 'Annual debit of ₹1,499.00. Merchant: "AMAZON PRIME MEM"' },
    { name: 'Cult.fit', category: 'Fitness', amount: 999, billingCycle: 'monthly', lastChargeDate: iso(14), confidence: 0.93, evidence: '2 debits of ₹999.00 from HDFC Bank •••4521, ~30 days apart. Merchant: "CULTFIT HEALTHCARE"' },
    { name: 'Jio Fiber', category: 'Utilities', amount: 899, billingCycle: 'monthly', lastChargeDate: iso(3), confidence: 0.85, evidence: '4 debits of ₹899.00, ~30 days apart. Merchant: "RELIANCE JIO INFOCOMM"' },
  ];

  return items.map((item) => ({
    ...item,
    nextDueDate: addCycle(item.lastChargeDate, item.billingCycle),
  }));
}

module.exports = {
  detectRecurring, extractAmount, identifyMerchant, demoDetections, bankDemoDetections, addCycle,
};
