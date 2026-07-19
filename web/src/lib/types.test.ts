import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  calculateNextDueDate,
  daysUntil,
  formatDueDate,
  isEnded,
  monthlyCost,
  yearlyCost,
} from "./types";

describe("monthlyCost / yearlyCost", () => {
  test("a monthly subscription's monthly cost is its own amount", () => {
    expect(monthlyCost({ amount: 649, billingCycle: "monthly" })).toBe(649);
  });

  test("a yearly subscription's monthly cost is amount / 12", () => {
    expect(monthlyCost({ amount: 1200, billingCycle: "yearly" })).toBe(100);
  });

  test("a yearly subscription's yearly cost is its own amount", () => {
    expect(yearlyCost({ amount: 1499, billingCycle: "yearly" })).toBe(1499);
  });

  test("a monthly subscription's yearly cost is amount * 12", () => {
    expect(yearlyCost({ amount: 100, billingCycle: "monthly" })).toBe(1200);
  });
});

describe("date helpers (fixed 'today')", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("calculateNextDueDate", () => {
    test("leaves a future start date unchanged", () => {
      expect(calculateNextDueDate("2026-08-01", "monthly")).toBe("2026-08-01");
    });

    test("rolls a past monthly start date forward to the next upcoming date", () => {
      // Started 2026-01-15 (monthly) — 'today' is 2026-07-18, so the next
      // upcoming charge is 2026-08-15.
      expect(calculateNextDueDate("2026-01-15", "monthly")).toBe("2026-08-15");
    });

    test("rolls a past yearly start date forward by whole years", () => {
      expect(calculateNextDueDate("2024-03-01", "yearly")).toBe("2027-03-01");
    });

    test("treats a start date of exactly today as due today", () => {
      expect(calculateNextDueDate("2026-07-18", "monthly")).toBe("2026-07-18");
    });
  });

  describe("daysUntil", () => {
    test("returns 0 for today", () => {
      expect(daysUntil("2026-07-18")).toBe(0);
    });

    test("returns a positive count for a future date", () => {
      expect(daysUntil("2026-07-21")).toBe(3);
    });

    test("returns a negative count for a past (overdue) date", () => {
      expect(daysUntil("2026-07-15")).toBe(-3);
    });
  });

  describe("formatDueDate", () => {
    test("formats a date as day-month-year in en-IN style", () => {
      expect(formatDueDate("2026-08-09")).toBe("9 Aug 2026");
    });
  });

  describe("isEnded", () => {
    test("no till date means never ended", () => {
      expect(isEnded({})).toBe(false);
      expect(isEnded({ endDate: null })).toBe(false);
    });

    test("a till date in the past means ended", () => {
      expect(isEnded({ endDate: "2026-07-17" })).toBe(true);
    });

    test("a till date of today or in the future is still active", () => {
      expect(isEnded({ endDate: "2026-07-18" })).toBe(false);
      expect(isEnded({ endDate: "2026-12-31" })).toBe(false);
    });
  });
});
