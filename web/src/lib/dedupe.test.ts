import { describe, test, expect } from "vitest";
import { planDedupe } from "./dedupe";

describe("planDedupe", () => {
  // Regression: the user's real Google One (₹1,950/mo, found by a real
  // Gmail scan) was silently discarded because a leftover demo-mode sample
  // named "Google One" (₹130) still sat in the detected collection. The
  // scan reported "no new recurring charges found" despite a correct match.
  test("a real scan ignores and deletes demo leftovers instead of deduping against them", () => {
    const plan = planDedupe(
      [],
      [
        { id: "d1", name: "Google One", source: "demo" },
        { id: "d2", name: "Netflix", source: "demo" },
      ],
      "gmail",
    );
    expect(plan.staleIds).toEqual(["d1", "d2"]);
    expect(plan.blockedNames.has("google one")).toBe(false);
    expect(plan.blockedNames.has("netflix")).toBe(false);
  });

  test("a real scan still dedupes against real-sourced detected docs (e.g. dismissed items)", () => {
    const plan = planDedupe(
      [],
      [
        { id: "d1", name: "Google One", source: "gmail" },
        { id: "d2", name: "Cult.fit", source: "plaid" },
      ],
      "gmail",
    );
    expect(plan.staleIds).toEqual([]);
    expect(plan.blockedNames.has("google one")).toBe(true);
    expect(plan.blockedNames.has("cult.fit")).toBe(true);
  });

  test("tracked subscriptions always block, case-insensitively", () => {
    const plan = planDedupe(["NETFLIX"], [], "gmail");
    expect(plan.blockedNames.has("netflix")).toBe(true);
  });

  test("a demo scan does not delete demo docs and dedupes against them (no sample spam)", () => {
    const plan = planDedupe(
      [],
      [{ id: "d1", name: "Google One", source: "demo" }],
      "demo",
    );
    expect(plan.staleIds).toEqual([]);
    expect(plan.blockedNames.has("google one")).toBe(true);
  });

  test("docs missing a source are treated as demo (legacy docs predate the field)", () => {
    // data.ts maps a missing source to "demo" before calling planDedupe;
    // this documents that contract from the pure function's side.
    const plan = planDedupe(
      [],
      [{ id: "d1", name: "Spotify", source: "demo" }],
      "plaid",
    );
    expect(plan.staleIds).toEqual(["d1"]);
  });
});
