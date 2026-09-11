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

// ---------- Price-change detection ----------

export interface TrackedForPricing {
  id: string;
  name: string;
  amount: number;
  billingCycle: string;
}

export interface ScannedForPricing {
  name: string;
  amount: number;
  billingCycle: string;
}

export interface PriceChange {
  subscriptionId: string;
  name: string;
  oldAmount: number;
  newAmount: number;
}

/**
 * A scan candidate that matches a *tracked* subscription is dropped by the
 * dedupe — but its amount is fresh evidence. When it differs from what the
 * user tracks (same billing cycle, beyond paise/rounding noise), that's a
 * price change worth flagging: "Netflix now bills ₹799, you track ₹649."
 */
export function detectPriceChanges(
  tracked: TrackedForPricing[],
  scanned: ScannedForPricing[],
): PriceChange[] {
  const byName = new Map(tracked.map((s) => [s.name.toLowerCase(), s]));
  const changes: PriceChange[] = [];
  const flagged = new Set<string>();

  for (const item of scanned) {
    const sub = byName.get(item.name.toLowerCase());
    if (!sub || flagged.has(sub.id)) continue;
    if (sub.billingCycle !== item.billingCycle) continue;
    // Ignore sub-2% (or sub-₹1) wobble — bank alerts sometimes round paise.
    if (Math.abs(item.amount - sub.amount) < Math.max(1, sub.amount * 0.02)) continue;
    flagged.add(sub.id);
    changes.push({
      subscriptionId: sub.id,
      name: sub.name,
      oldAmount: sub.amount,
      newAmount: item.amount,
    });
  }

  return changes;
}

// ---------- Cancellation detection ----------

export interface TrackedForCancellation {
  id: string;
  name: string;
  status?: string;
}

export interface ScannedCancellation {
  name: string;
  date: string;
  subject: string;
  sourceAccounts?: string[];
}

export interface CancellationMatch {
  subscriptionId: string;
  name: string;
  detectedAt: string;
  evidence: string;
  sourceAccounts?: string[];
}

/**
 * A cancellation-confirmation email matching a tracked, still-*active*
 * subscription proposes marking it cancelled — never applied silently. A
 * subscription already cancelled is skipped so a duplicate notice (or a
 * second cancellation email for the same merchant later) can't re-flag it.
 */
export function matchCancellations(
  tracked: TrackedForCancellation[],
  scanned: ScannedCancellation[],
): CancellationMatch[] {
  const byName = new Map(tracked.map((s) => [s.name.toLowerCase(), s]));
  const matches: CancellationMatch[] = [];
  const flagged = new Set<string>();

  for (const c of scanned) {
    const sub = byName.get(c.name.toLowerCase());
    if (!sub || flagged.has(sub.id) || sub.status === "cancelled") continue;
    flagged.add(sub.id);
    matches.push({
      subscriptionId: sub.id,
      name: sub.name,
      detectedAt: c.date,
      evidence: c.subject,
      sourceAccounts: c.sourceAccounts,
    });
  }

  return matches;
}
