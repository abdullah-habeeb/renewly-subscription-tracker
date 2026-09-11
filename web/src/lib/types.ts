export type BillingCycle = "monthly" | "yearly";

export const CATEGORIES = [
  "Entertainment",
  "Music",
  "Software",
  "Cloud Storage",
  "Fitness",
  "News",
  "Food",
  "Utilities",
  "Education",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Subscription {
  id: string;
  uid: string;
  name: string;
  amount: number;
  category: string;
  billingCycle: BillingCycle;
  startDate: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  /** Optional "till date": once passed, the subscription counts as ended. */
  endDate?: string | null; // YYYY-MM-DD
  source?: "manual" | "gmail" | "plaid" | "demo";
  /** Which linked Gmail address(es) a scanned subscription was found in. */
  sourceAccounts?: string[];
  /** A scan saw this merchant billing a different amount — awaiting the user's call. */
  pendingPriceChange?: { newAmount: number; detectedAt: string } | null;
  /** Last flagged amount the user chose to ignore; suppresses re-flagging it. */
  dismissedPriceAmount?: number | null;
  /** Missing/undefined means "active" — existing docs predate this field. */
  status?: "active" | "cancelled";
  cancelledAt?: string | null; // YYYY-MM-DD
  cancellationSource?: "gmail" | "manual" | null;
  cancellationEvidence?: string | null;
  /** A scan found a cancellation confirmation for this merchant — awaiting the user's call. */
  pendingCancellation?: { detectedAt: string; evidence: string; sourceAccounts?: string[] } | null;
  /** Last flagged cancellation date the user dismissed; suppresses re-flagging it. */
  dismissedCancellationDate?: string | null;
  createdAt?: unknown;
}

export interface DetectedSubscription {
  id: string;
  uid: string;
  name: string;
  amount: number;
  category: string;
  billingCycle: BillingCycle;
  lastChargeDate: string;
  nextDueDate: string;
  confidence: number; // 0..1
  status: "pending" | "approved" | "dismissed";
  source: "gmail" | "plaid" | "demo";
  evidence?: string;
  /** Which linked Gmail address(es) this candidate was found in. */
  sourceAccounts?: string[];
  /** A known merchant was mentioned but no price could be found — amount is a placeholder (0). */
  needsDetails?: boolean;
}

export interface UserSettings {
  email?: string;
  reminderDays: number;
  /** Weekly background inbox re-scan + digest email. Default on; false = opted out. */
  autoScan?: boolean;
  gmail?: {
    connected: boolean;
    address?: string;
    lastScanAt?: string;
  };
}

export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function monthlyCost(sub: Pick<Subscription, "amount" | "billingCycle">): number {
  return sub.billingCycle === "monthly" ? sub.amount : sub.amount / 12;
}

export function yearlyCost(sub: Pick<Subscription, "amount" | "billingCycle">): number {
  return sub.billingCycle === "yearly" ? sub.amount : sub.amount * 12;
}

/** YYYY-MM-DD in *local* time (toISOString would shift a day for UTC+ zones). */
function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Advance a start date forward in cycle steps until it's today or later. */
export function calculateNextDueDate(startDate: string, cycle: BillingCycle): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(startDate + "T00:00:00");
  while (next < today) {
    if (cycle === "monthly") next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1);
  }
  return toLocalISO(next);
}

/** A subscription whose till date has passed no longer bills or reminds. */
export function isEnded(sub: Pick<Subscription, "endDate">): boolean {
  return Boolean(sub.endDate) && daysUntil(sub.endDate as string) < 0;
}

/** Explicitly cancelled (Gmail-detected or marked by hand) — distinct from a till-date lapsing on its own. */
export function isCancelled(sub: Pick<Subscription, "status">): boolean {
  return sub.status === "cancelled";
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function formatDueDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
