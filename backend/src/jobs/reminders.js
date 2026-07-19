const cron = require('node-cron');
const { db, hasFirestore } = require('../firebase');
const mailer = require('../services/mailer');
const { addCycle } = require('../services/detector');

function daysUntil(dateStr) {
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86_400_000);
}

/**
 * Daily pass over every user:
 *  1. Roll overdue nextDueDate forward one billing cycle.
 *  2. Email a digest of subscriptions renewing within the user's reminderDays.
 * Each sub remembers the due date it was last reminded for, so users get
 * exactly one email per renewal.
 */
async function runReminders() {
  if (!hasFirestore) {
    return { ok: false, error: 'Reminder job needs Firebase service credentials (see .env.example).' };
  }
  if (!mailer.isConfigured) {
    return { ok: false, error: 'Reminder job needs SMTP_USER / SMTP_PASS configured.' };
  }

  const usersSnap = await db.collection('users').get();
  let emailsSent = 0;

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const uid = userDoc.id;
    const email = user.email;
    const reminderDays = user.reminderDays ?? 3;
    if (!email) continue;

    const subsSnap = await db.collection('subscriptions').where('uid', '==', uid).get();
    const dueSoon = [];

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      if (!sub.nextDueDate || !sub.billingCycle) continue;

      // Past its "till date": no more billing, so no rolling forward and no
      // reminders. The dashboard asks the user whether to remove or keep it.
      if (sub.endDate && daysUntil(sub.endDate) < 0) continue;

      // Roll past-due dates forward so the tracker never shows stale renewals.
      let nextDueDate = sub.nextDueDate;
      while (daysUntil(nextDueDate) < 0) {
        nextDueDate = addCycle(nextDueDate, sub.billingCycle);
      }
      if (nextDueDate !== sub.nextDueDate) {
        await subDoc.ref.update({ nextDueDate });
      }

      // Skip renewals that would land after the till date — the last cycle
      // has already been paid for; there is nothing left to remind about.
      if (sub.endDate && nextDueDate > sub.endDate) continue;

      const days = daysUntil(nextDueDate);
      if (days >= 0 && days <= reminderDays && sub.lastRemindedFor !== nextDueDate) {
        dueSoon.push({ ref: subDoc.ref, name: sub.name, amount: sub.amount, billingCycle: sub.billingCycle, nextDueDate });
      }
    }

    if (dueSoon.length === 0) continue;

    try {
      await mailer.sendReminderEmail(email, dueSoon);
      emailsSent++;
      for (const sub of dueSoon) {
        await sub.ref.update({ lastRemindedFor: sub.nextDueDate });
      }
      console.log(`📧 Reminder sent to ${email} (${dueSoon.length} subscription(s))`);
    } catch (err) {
      console.error(`Failed to email ${email}:`, err.message);
    }
  }

  return { ok: true, usersChecked: usersSnap.size, emailsSent };
}

function scheduleReminders() {
  if (!hasFirestore || !mailer.isConfigured) {
    console.warn('⏸️  Reminder cron disabled (needs Firebase service credentials + SMTP config).');
    return;
  }
  // 08:00 IST every day.
  cron.schedule('0 8 * * *', () => {
    runReminders().then((r) => console.log('Reminder run:', JSON.stringify(r)));
  }, { timezone: 'Asia/Kolkata' });
  console.log('⏰ Reminder cron scheduled: daily 08:00 IST');
}

module.exports = { runReminders, scheduleReminders };
