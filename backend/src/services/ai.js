// AI-powered subscription extraction. Fits arbitrary billing emails into the
// (name, amount, billingCycle, category, lastChargeDate) tuple that the
// regex heuristics in detector.js can't always reach — unknown merchants,
// unusual phrasing, amounts buried in prose. Optional: without an
// ANTHROPIC_API_KEY the scanner simply runs heuristics-only, as before.
const Anthropic = require('@anthropic-ai/sdk');
const { addCycle } = require('./detector');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const isConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

const CATEGORIES = [
  'Entertainment', 'Music', 'Software', 'Cloud Storage', 'Fitness',
  'News', 'Food', 'Utilities', 'Education', 'Other',
];

// Structured-outputs schema: every object fully required with
// additionalProperties: false, per the API's strict-schema rules.
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    subscriptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Merchant/service name, e.g. "Netflix", "Google One"' },
          amount: { type: 'number', description: 'Charge per billing cycle in INR' },
          billingCycle: { type: 'string', enum: ['monthly', 'yearly'] },
          category: { type: 'string', enum: CATEGORIES },
          lastChargeDate: { type: 'string', description: 'Date of the most recent charge, YYYY-MM-DD' },
          confidence: { type: 'number', description: 'How sure you are this is a real active subscription, 0 to 1' },
          evidence: { type: 'string', description: 'One short sentence citing the email(s) that support this' },
        },
        required: ['name', 'amount', 'billingCycle', 'category', 'lastChargeDate', 'confidence', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['subscriptions'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You extract active paid subscriptions from a user's billing-related emails.

Rules:
- Only report subscriptions the user is actually PAYING for (or has committed to pay for): charges, receipts, renewal notices, trial-ending notices that state the upcoming price, payment-declined notices for an active subscription.
- NEVER report advertised prices from marketing emails, promos for products the user doesn't own, one-off (non-recurring) purchases, or free tiers.
- The same service mentioned in several emails is ONE subscription — merge the evidence and use the most recent charge date.
- Amounts are in INR (₹/Rs/INR). If an email shows a different currency, skip that email.
- lastChargeDate must be YYYY-MM-DD; if only a future renewal date is known, use the email's date as lastChargeDate.
- Set confidence below 0.7 when the evidence is a single ambiguous email.`;

/**
 * Compact, token-bounded summaries of candidate emails for the model.
 * Pure — unit-tested without network access.
 */
function buildEmailSummaries(transactions, { maxItems = 80, maxSnippet = 300 } = {}) {
  return transactions.slice(0, maxItems).map((tx, i) => ({
    id: i + 1,
    date: tx.date,
    from: (tx.from || '').slice(0, 120),
    subject: (tx.subject || '').slice(0, 200),
    amountFound: tx.amount,
    excerpt: (tx.snippet || tx.merchantText || '').slice(0, maxSnippet),
  }));
}

/**
 * Validates and normalizes the model's extractions into the same candidate
 * shape the heuristic detector produces. Pure — unit-tested without network.
 */
function mapExtracted(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    const amount = Number(item.amount);
    const validDate = typeof item.lastChargeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.lastChargeDate);
    const validCycle = item.billingCycle === 'monthly' || item.billingCycle === 'yearly';
    if (!item.name || !Number.isFinite(amount) || amount <= 0 || !validDate || !validCycle) continue;

    const confidence = Math.min(1, Math.max(0, Number(item.confidence) || 0.5));
    out.push({
      name: String(item.name).trim().slice(0, 60),
      category: CATEGORIES.includes(item.category) ? item.category : 'Other',
      amount,
      billingCycle: item.billingCycle,
      lastChargeDate: item.lastChargeDate,
      nextDueDate: addCycle(item.lastChargeDate, item.billingCycle),
      confidence,
      evidence: `AI: ${String(item.evidence || 'identified from your billing emails').slice(0, 200)}`,
    });
  }
  return out;
}

/**
 * Sends candidate email summaries to Claude and returns extracted
 * subscription candidates. Throws on API failure — the caller treats AI as
 * a best-effort enhancement and falls back to heuristics-only.
 */
async function extractSubscriptions(transactions) {
  if (!isConfigured) return [];
  const summaries = buildEmailSummaries(transactions);
  if (summaries.length === 0) return [];

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Here are billing-related emails from the user's Gmail (JSON). Extract their active paid subscriptions.\n\n${JSON.stringify(summaries)}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') return [];
  if (response.stop_reason === 'max_tokens') {
    console.warn('AI extraction hit max_tokens — result may be incomplete');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return [];
  const parsed = JSON.parse(textBlock.text);
  return mapExtracted(parsed.subscriptions);
}

module.exports = { isConfigured, extractSubscriptions, buildEmailSummaries, mapExtracted, MODEL };
