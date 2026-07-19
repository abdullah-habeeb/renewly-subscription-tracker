/**
 * Pure dedupe policy for storing scan candidates — kept free of Firestore
 * imports so it can be unit-tested directly.
 *
 * Rules:
 * - Names already in the user's tracked subscriptions always block.
 * - Demo-sourced detected docs are sample data, not user history: a real
 *   (gmail/plaid) scan deletes them and never dedupes against them.
 *   Otherwise a leftover sample "Google One ₹130" silently blocks the
 *   user's real Google One ₹1,950 — which happened in production.
 * - Real-sourced detected docs (any status) block re-offering: a name the
 *   user dismissed or already has pending shouldn't reappear every scan.
 */
export interface ExistingDetectedDoc {
  id: string;
  name: string;
  source: string;
}

export interface DedupePlan {
  /** Detected-doc ids to delete before storing (stale demo samples). */
  staleIds: string[];
  /** Lowercased names that must not be stored again. */
  blockedNames: Set<string>;
}

export function planDedupe(
  subscriptionNames: string[],
  existingDetected: ExistingDetectedDoc[],
  scanSource: "gmail" | "plaid" | "demo",
): DedupePlan {
  const isRealScan = scanSource !== "demo";
  const blockedNames = new Set(subscriptionNames.map((n) => n.toLowerCase()));
  const staleIds: string[] = [];

  for (const docItem of existingDetected) {
    if (isRealScan && docItem.source === "demo") {
      staleIds.push(docItem.id);
      continue;
    }
    blockedNames.add(docItem.name.toLowerCase());
  }

  return { staleIds, blockedNames };
}
