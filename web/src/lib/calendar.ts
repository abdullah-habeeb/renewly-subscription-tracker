/**
 * Renewal-calendar math and the .ics export. Pure module — no React, no
 * Firestore — so both are unit-testable.
 */
import { isEnded, type BillingCycle, type Subscription } from "./types";

export interface DayRenewals {
  day: number;
  items: Array<Pick<Subscription, "id" | "name" | "amount" | "billingCycle">>;
  total: number;
}

function addCycle(d: Date, cycle: BillingCycle): Date {
  const next = new Date(d);
  if (cycle === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * All renewal occurrences inside one displayed month, grouped by day.
 * Occurrences project forward from each subscription's nextDueDate (the same
 * month-arithmetic the rest of the app uses), stop at its till date, and
 * ended subscriptions never appear.
 */
export function renewalsForMonth(
  subs: Subscription[],
  year: number,
  month0: number,
): DayRenewals[] {
  const monthStart = new Date(year, month0, 1);
  const monthEnd = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  const byDay = new Map<number, DayRenewals>();

  for (const sub of subs) {
    if (isEnded(sub)) continue;
    let d = new Date(sub.nextDueDate + "T00:00:00");
    if (Number.isNaN(d.getTime())) continue;
    const end = sub.endDate ? new Date(sub.endDate + "T00:00:00") : null;

    while (d < monthStart) d = addCycle(d, sub.billingCycle);
    while (d <= monthEnd) {
      if (end && d > end) break;
      const day = d.getDate();
      const entry = byDay.get(day) ?? { day, items: [], total: 0 };
      entry.items.push({
        id: sub.id,
        name: sub.name,
        amount: sub.amount,
        billingCycle: sub.billingCycle,
      });
      entry.total += sub.amount;
      byDay.set(day, entry);
      d = addCycle(d, sub.billingCycle);
    }
  }

  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function monthTotal(days: DayRenewals[]): number {
  return days.reduce((t, d) => t + d.total, 0);
}

// ---------- .ics export (RFC 5545) ----------

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDate(dateStr: string): string {
  return dateStr.replaceAll("-", "");
}

/**
 * One all-day recurring VEVENT per active subscription: DTSTART on the next
 * due date, RRULE FREQ matching the billing cycle, UNTIL when a till date is
 * set. Imports cleanly into Google Calendar / Outlook / Apple Calendar.
 */
export function buildRenewalsIcs(subs: Subscription[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Renewly//Renewal Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Renewly renewals",
  ];

  for (const sub of subs) {
    if (isEnded(sub)) continue;
    const freq = sub.billingCycle === "monthly" ? "MONTHLY" : "YEARLY";
    const until = sub.endDate ? `;UNTIL=${icsDate(sub.endDate)}` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:renewly-${sub.id}@renewly.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(sub.nextDueDate)}`,
      `RRULE:FREQ=${freq}${until}`,
      `SUMMARY:${icsEscape(`${sub.name} renews — ₹${sub.amount}`)}`,
      `DESCRIPTION:${icsEscape(`${sub.billingCycle} subscription tracked by Renewly`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
