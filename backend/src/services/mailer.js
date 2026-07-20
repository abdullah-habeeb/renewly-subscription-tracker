const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER;
// Google shows app passwords as "abcd efgh ijkl mnop" — tolerate pasted spaces.
const SMTP_PASS = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;
const FROM = process.env.MAIL_FROM || (SMTP_USER ? `Renewly <${SMTP_USER}>` : null);

const isConfigured = Boolean(SMTP_USER && SMTP_PASS);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

function renderReminderHtml(subs) {
  const rows = subs
    .map((s) => {
      const due = new Date(s.nextDueDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;font-weight:600;">${s.name}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;">${inr.format(s.amount)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;">${s.billingCycle}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;">${due}</td>
        </tr>`;
    })
    .join('');

  return `
  <div style="background:#0d1f18;padding:32px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eef5f0;">
    <div style="max-width:560px;margin:0 auto;background:#14291f;border:1px solid #2e4a3f;border-radius:20px;overflow:hidden;">
      <div style="padding:28px 28px 0;">
        <p style="margin:0;font-size:13px;letter-spacing:1px;color:#7fd6a4;text-transform:uppercase;">Renewly · Renewal reminder</p>
        <h1 style="margin:12px 0 4px;font-size:24px;font-weight:600;">Heads up — ${subs.length === 1 ? 'a subscription renews' : `${subs.length} subscriptions renew`} soon.</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#a9c2b4;">Cancel or budget for these before they bill you.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#eef5f0;">
        <thead>
          <tr style="text-align:left;color:#7fd6a4;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
            <th style="padding:8px 16px;">Service</th>
            <th style="padding:8px 16px;">Amount</th>
            <th style="padding:8px 16px;">Cycle</th>
            <th style="padding:8px 16px;">Renews</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="padding:20px 28px 28px;">
        <p style="margin:0;font-size:12px;color:#6f8a7c;">You're getting this because reminders are on in your Renewly settings.</p>
      </div>
    </div>
  </div>`;
}

async function sendReminderEmail(to, subs) {
  if (!isConfigured) {
    return { sent: false, error: 'Email not configured: set SMTP_USER and SMTP_PASS (Gmail app password) on the server.' };
  }

  const subject =
    subs.length === 1
      ? `⏰ ${subs[0].name} renews ${renewsWhen(subs[0].nextDueDate)} — ${inr.format(subs[0].amount)}`
      : `⏰ ${subs.length} subscriptions renew soon (${inr.format(subs.reduce((t, s) => t + s.amount, 0))})`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html: renderReminderHtml(subs),
  });

  return { sent: true, to };
}

function renewsWhen(dateStr) {
  const days = Math.round(
    (new Date(dateStr + 'T00:00:00') - new Date(new Date().toDateString())) / 86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function renderDigestHtml(items, dashboardUrl) {
  const rows = items
    .map(
      (s) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;font-weight:600;">${s.name}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;">${s.needsDetails ? '—' : inr.format(s.amount)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2e4a3f;">${s.needsDetails ? 'add price' : s.billingCycle}</td>
        </tr>`,
    )
    .join('');

  return `
  <div style="background:#0d1f18;padding:32px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eef5f0;">
    <div style="max-width:560px;margin:0 auto;background:#14291f;border:1px solid #2e4a3f;border-radius:20px;overflow:hidden;">
      <div style="padding:28px 28px 0;">
        <p style="margin:0;font-size:13px;letter-spacing:1px;color:#7fd6a4;text-transform:uppercase;">Renewly · Inbox watch</p>
        <h1 style="margin:12px 0 4px;font-size:24px;font-weight:600;">We spotted ${items.length === 1 ? 'a new subscription' : `${items.length} new subscriptions`} in your inbox.</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#a9c2b4;">Renewly re-scans your linked Gmail weekly. These recurring charges are new since last time — review them so nothing slips by.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#eef5f0;">
        <thead>
          <tr style="text-align:left;color:#7fd6a4;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
            <th style="padding:8px 16px;">Service</th>
            <th style="padding:8px 16px;">Amount</th>
            <th style="padding:8px 16px;">Cycle</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="padding:20px 28px 28px;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#2f7a54;color:#eef5f0;text-decoration:none;font-size:14px;font-weight:600;padding:10px 22px;border-radius:999px;">Review on your dashboard</a>
        <p style="margin:16px 0 0;font-size:12px;color:#6f8a7c;">Weekly auto-scan is on in your Renewly settings — switch it off there any time.</p>
      </div>
    </div>
  </div>`;
}

// The weekly auto-scan digest: what the background re-scan found, with a
// review link. Only ever sent when there is something new.
async function sendDigestEmail(to, items) {
  if (!isConfigured) {
    return { sent: false, error: 'Email not configured: set SMTP_USER and SMTP_PASS (Gmail app password) on the server.' };
  }

  const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
  const subject =
    items.length === 1
      ? items[0].needsDetails
        ? `🔎 Renewly spotted ${items[0].name} — add the price to start tracking`
        : `🔎 Renewly found a new subscription: ${items[0].name} (${inr.format(items[0].amount)})`
      : `🔎 Renewly found ${items.length} new subscriptions in your inbox`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html: renderDigestHtml(items, dashboardUrl),
  });

  return { sent: true, to };
}

module.exports = { isConfigured, sendReminderEmail, sendDigestEmail };
