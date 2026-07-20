import { describe, expect, test } from "vitest";
import { buildRenewalsIcs, monthTotal, renewalsForMonth } from "./calendar";
import type { Subscription } from "./types";

// Far-future dates keep the tests deterministic regardless of today's date.
const sub = (over: Partial<Subscription>): Subscription => ({
  id: "s1",
  uid: "u1",
  name: "Netflix",
  amount: 649,
  category: "Entertainment",
  billingCycle: "monthly",
  startDate: "2030-01-15",
  nextDueDate: "2030-03-15",
  ...over,
});

describe("renewalsForMonth", () => {
  test("a monthly subscription lands on its due day, in its month and every month after", () => {
    const subs = [sub({})];
    expect(renewalsForMonth(subs, 2030, 2)).toEqual([
      { day: 15, total: 649, items: [{ id: "s1", name: "Netflix", amount: 649, billingCycle: "monthly" }] },
    ]);
    // Projected forward two months.
    expect(renewalsForMonth(subs, 2030, 4)[0].day).toBe(15);
  });

  test("a month before the next due date shows nothing", () => {
    expect(renewalsForMonth([sub({})], 2030, 1)).toEqual([]);
  });

  test("a yearly subscription appears only in its renewal month", () => {
    const subs = [sub({ id: "y1", billingCycle: "yearly", nextDueDate: "2030-06-01" })];
    expect(renewalsForMonth(subs, 2030, 5)).toHaveLength(1);
    expect(renewalsForMonth(subs, 2030, 6)).toEqual([]);
    expect(renewalsForMonth(subs, 2031, 5)).toHaveLength(1);
  });

  test("stops projecting past the till date", () => {
    const subs = [sub({ endDate: "2030-04-30" })];
    expect(renewalsForMonth(subs, 2030, 3)).toHaveLength(1); // Apr 15 — before the till date
    expect(renewalsForMonth(subs, 2030, 4)).toEqual([]); // May 15 — past it
  });

  test("excludes subscriptions that already ended", () => {
    expect(renewalsForMonth([sub({ endDate: "2020-01-01" })], 2030, 2)).toEqual([]);
  });

  test("aggregates several renewals on the same day and totals the month", () => {
    const subs = [
      sub({}),
      sub({ id: "s2", name: "Spotify", amount: 119, nextDueDate: "2030-03-15" }),
      sub({ id: "s3", name: "iCloud", amount: 75, nextDueDate: "2030-03-02" }),
    ];
    const days = renewalsForMonth(subs, 2030, 2);
    expect(days.map((d) => d.day)).toEqual([2, 15]);
    expect(days[1].items).toHaveLength(2);
    expect(days[1].total).toBe(649 + 119);
    expect(monthTotal(days)).toBe(649 + 119 + 75);
  });

  test("ignores an invalid nextDueDate instead of looping or throwing", () => {
    expect(renewalsForMonth([sub({ nextDueDate: "not-a-date" })], 2030, 2)).toEqual([]);
  });
});

describe("buildRenewalsIcs", () => {
  const now = new Date("2030-03-01T10:00:00Z");

  test("emits one recurring all-day VEVENT per active subscription", () => {
    const ics = buildRenewalsIcs([sub({}), sub({ id: "y1", billingCycle: "yearly" })], now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20300315");
    expect(ics).toContain("RRULE:FREQ=MONTHLY");
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    expect(ics).toContain("UID:renewly-s1@renewly.app");
  });

  test("a till date becomes an UNTIL clause; ended subscriptions are skipped", () => {
    const ics = buildRenewalsIcs(
      [sub({ endDate: "2030-12-31" }), sub({ id: "gone", endDate: "2020-01-01" })],
      now,
    );
    expect(ics).toContain("RRULE:FREQ=MONTHLY;UNTIL=20301231");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  test("escapes ICS-special characters in names", () => {
    const ics = buildRenewalsIcs([sub({ name: "Movies, Music; & More" })], now);
    expect(ics).toContain("Movies\\, Music\\; & More");
  });

  test("uses CRLF line endings throughout (RFC 5545)", () => {
    const ics = buildRenewalsIcs([sub({})], now);
    expect(ics.split("\r\n").length).toBeGreaterThan(5);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});
