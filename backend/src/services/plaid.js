const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const tokenStore = require('./plaidTokenStore');

const CLIENT_ID = process.env.PLAID_CLIENT_ID;
const SECRET = process.env.PLAID_SECRET;
const ENV = process.env.PLAID_ENV || 'sandbox';

const isConfigured = Boolean(CLIENT_ID && SECRET);

const client = isConfigured
  ? new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': CLIENT_ID,
        'PLAID-SECRET': SECRET,
      },
    },
  }))
  : null;

async function createLinkToken(uid) {
  const { data } = await client.linkTokenCreate({
    user: { client_user_id: uid },
    client_name: 'Renewly',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
  return data.link_token;
}

async function exchangePublicToken(uid, publicToken, institutionName) {
  const { data } = await client.itemPublicTokenExchange({ public_token: publicToken });
  await tokenStore.set(uid, {
    accessToken: data.access_token,
    itemId: data.item_id,
    institutionName: institutionName || null,
    connectedAt: new Date().toISOString(),
  });
}

async function getStatus(uid) {
  const record = await tokenStore.get(uid);
  return {
    configured: isConfigured,
    connected: Boolean(record && record.accessToken),
    institutionName: record ? record.institutionName : undefined,
    lastScanAt: record ? record.lastScanAt : undefined,
    demo: !isConfigured,
  };
}

async function disconnect(uid) {
  const record = await tokenStore.get(uid);
  if (record && record.accessToken && client) {
    try {
      await client.itemRemove({ access_token: record.accessToken });
    } catch (err) {
      console.warn('Plaid item remove failed (forgetting locally anyway):', err.message);
    }
  }
  await tokenStore.remove(uid);
}

// Non-monthly/yearly cadences get normalized into a monthly-equivalent amount
// so they fit our billingCycle model instead of being dropped.
const FREQUENCY_MULTIPLIER = {
  WEEKLY: 4.345,
  BIWEEKLY: 2.1725,
  SEMI_MONTHLY: 2,
  MONTHLY: 1,
};

const CATEGORY_MAP = {
  ENTERTAINMENT: 'Entertainment',
  SUBSCRIPTION: 'Software',
  RECREATION: 'Entertainment',
  FOOD_AND_DRINK: 'Food',
  RENT_AND_UTILITIES: 'Utilities',
  PERSONAL_CARE: 'Fitness',
  GENERAL_SERVICES: 'Software',
  GENERAL_MERCHANDISE: 'Other',
};

function mapCategory(stream) {
  const primary = stream.personal_finance_category && stream.personal_finance_category.primary;
  return CATEGORY_MAP[primary] || 'Other';
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

function mapStream(stream) {
  const isAnnual = stream.frequency === 'ANNUALLY';
  const billingCycle = isAnnual ? 'yearly' : 'monthly';
  const rawAmount = Math.abs(
    (stream.average_amount && stream.average_amount.amount)
    ?? (stream.last_amount && stream.last_amount.amount)
    ?? 0,
  );
  const multiplier = isAnnual ? 1 : (FREQUENCY_MULTIPLIER[stream.frequency] ?? 1);
  const amount = Math.round(rawAmount * multiplier * 100) / 100;
  const cadence = String(stream.frequency || '').toLowerCase().replace('_', '-');

  return {
    name: stream.merchant_name || stream.description || 'Unknown merchant',
    category: mapCategory(stream),
    amount,
    billingCycle,
    lastChargeDate: stream.last_date,
    nextDueDate: addCycle(stream.last_date, billingCycle),
    confidence: stream.status === 'MATURE' ? 0.92 : 0.65,
    evidence: `Recurring ${cadence} debit detected by Plaid from your linked account. Merchant: "${stream.description || stream.merchant_name}"`,
  };
}

/**
 * Pulls Plaid's own recurring-transaction detection (ML-based, not our
 * regex heuristic) and maps active outflow streams to candidate shape.
 * Note: even in Sandbox, Plaid needs a short window (seconds, occasionally
 * longer) after an Item is first linked before transaction data is ready —
 * in Production that window is measured in hours. Requests made too soon
 * get PRODUCT_NOT_READY, which we turn into a friendly retry-later message.
 */
async function scanRecurring(uid) {
  const record = await tokenStore.get(uid);
  if (!record || !record.accessToken) {
    throw new Error('Bank account is not connected');
  }

  let data;
  try {
    ({ data } = await client.transactionsRecurringGet({ access_token: record.accessToken }));
  } catch (err) {
    if (err.response?.data?.error_code === 'PRODUCT_NOT_READY') {
      throw new Error("Your bank was just connected — Plaid is still pulling your transaction history. Try scanning again in a minute.");
    }
    throw err;
  }

  const items = (data.outflow_streams || []).filter((s) => s.is_active).map(mapStream);

  await tokenStore.set(uid, { lastScanAt: new Date().toISOString() });
  return items;
}

module.exports = {
  isConfigured, createLinkToken, exchangePublicToken, getStatus, disconnect, scanRecurring,
};
