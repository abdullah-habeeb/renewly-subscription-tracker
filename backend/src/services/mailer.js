const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER;
// Google shows app passwords as "abcd efgh ijkl mnop" — tolerate pasted spaces.
const SMTP_PASS = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;
const FROM = process.env.MAIL_FROM || (SMTP_USER ? `Sublet <${SMTP_USER}>` : null);

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
        <p style="margin:0;font-size:13px;letter-spacing:1px;color:#7fd6a4;text-transform:uppercase;">Sublet · Renewal reminder</p>
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
        <p style="margin:0;font-size:12px;color:#6f8a7c;">You're getting this because reminders are on in your Sublet settings.</p>
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

module.exports = { isConfigured, sendReminderEmail };
