import { describe, expect, test } from "vitest";
import { matchCancellations } from "./dedupe";

const netflix = { id: "s1", name: "Netflix", status: "active" };
const scanned = (over: Partial<{ name: string; date: string; subject: string; sourceAccounts: string[] }>) => ({
  name: "Netflix",
  date: "2026-09-01",
  subject: "Your Netflix membership has been cancelled",
  ...over,
});

describe("matchCancellations", () => {
  test("matches a tracked, active subscription case-insensitively", () => {
    const matches = matchCancellations([netflix], [scanned({ name: "NETFLIX" })]);
    expect(matches).toEqual([
      {
        subscriptionId: "s1",
        name: "Netflix",
        detectedAt: "2026-09-01",
        evidence: "Your Netflix membership has been cancelled",
        sourceAccounts: undefined,
      },
    ]);
  });

  test("ignores cancellations for merchants nothing is tracked as", () => {
    expect(matchCancellations([netflix], [scanned({ name: "Spotify" })])).toEqual([]);
  });

  // A merchant already marked cancelled shouldn't be re-flagged by a second
  // (possibly duplicate) cancellation email in the same or a later scan.
  test("skips a subscription that is already cancelled", () => {
    const alreadyCancelled = { id: "s1", name: "Netflix", status: "cancelled" };
    expect(matchCancellations([alreadyCancelled], [scanned({})])).toEqual([]);
  });

  test("carries source accounts through when present", () => {
    const matches = matchCancellations(
      [netflix],
      [scanned({ sourceAccounts: ["a@gmail.com", "b@gmail.com"] })],
    );
    expect(matches[0].sourceAccounts).toEqual(["a@gmail.com", "b@gmail.com"]);
  });

  test("flags each subscription at most once per scan", () => {
    const matches = matchCancellations(
      [netflix],
      [scanned({ date: "2026-09-01" }), scanned({ date: "2026-09-05" })],
    );
    expect(matches).toHaveLength(1);
  });

  test("handles several tracked subscriptions independently", () => {
    const spotify = { id: "s2", name: "Spotify", status: "active" };
    const matches = matchCancellations(
      [netflix, spotify],
      [scanned({}), scanned({ name: "Spotify" })],
    );
    expect(matches.map((m) => m.subscriptionId).sort()).toEqual(["s1", "s2"]);
  });

  // A doc predating the status field (no `status` key at all) must still
  // count as active — missing means active, per the Subscription type.
  test("treats a subscription with no status field as active", () => {
    const legacy = { id: "s1", name: "Netflix" };
    expect(matchCancellations([legacy], [scanned({})])).toHaveLength(1);
  });
});
