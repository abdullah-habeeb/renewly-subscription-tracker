import { describe, expect, test } from "vitest";
import { detectPriceChanges } from "./dedupe";

const netflix = { id: "s1", name: "Netflix", amount: 649, billingCycle: "monthly" };
const scanned = (over: Partial<{ name: string; amount: number; billingCycle: string }>) => ({
  name: "Netflix",
  amount: 799,
  billingCycle: "monthly",
  ...over,
});

describe("detectPriceChanges", () => {
  test("flags a hike on a tracked subscription, case-insensitively", () => {
    const changes = detectPriceChanges([netflix], [scanned({ name: "NETFLIX" })]);
    expect(changes).toEqual([
      { subscriptionId: "s1", name: "Netflix", oldAmount: 649, newAmount: 799 },
    ]);
  });

  test("flags price drops too", () => {
    const changes = detectPriceChanges([netflix], [scanned({ amount: 499 })]);
    expect(changes[0].newAmount).toBe(499);
  });

  test("ignores scan candidates that match nothing tracked", () => {
    expect(detectPriceChanges([netflix], [scanned({ name: "Spotify" })])).toEqual([]);
  });

  // A yearly receipt for a monthly-tracked plan isn't a hike — it's a
  // different billing arrangement; comparing the numbers would be nonsense.
  test("never compares across billing cycles", () => {
    expect(
      detectPriceChanges([netflix], [scanned({ amount: 7000, billingCycle: "yearly" })]),
    ).toEqual([]);
  });

  test("ignores sub-2% / sub-₹1 rounding wobble", () => {
    expect(detectPriceChanges([netflix], [scanned({ amount: 650 })])).toEqual([]);
    expect(detectPriceChanges([netflix], [scanned({ amount: 661 })])).toEqual([]);
    // 2% of 649 ≈ 13 — a ₹14 jump is real.
    expect(detectPriceChanges([netflix], [scanned({ amount: 663 })])).toHaveLength(1);
  });

  test("flags each subscription at most once per scan", () => {
    const changes = detectPriceChanges(
      [netflix],
      [scanned({ amount: 799 }), scanned({ amount: 899 })],
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].newAmount).toBe(799);
  });

  test("handles several tracked subscriptions independently", () => {
    const spotify = { id: "s2", name: "Spotify", amount: 119, billingCycle: "monthly" };
    const changes = detectPriceChanges(
      [netflix, spotify],
      [scanned({}), scanned({ name: "Spotify", amount: 149 })],
    );
    expect(changes.map((c) => c.subscriptionId).sort()).toEqual(["s1", "s2"]);
  });
});
