import { auth } from "./firebase";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export interface GmailAccount {
  address: string;
  connectedAt?: string;
  lastScanAt?: string;
  /** Google expired this account's access (test-mode tokens last ~7 days). */
  needsReauth?: boolean;
}

export interface GmailStatus {
  configured: boolean; // Google OAuth credentials present on the server
  connected: boolean;
  accounts: GmailAccount[];
  demo: boolean;
}

/** Per-inbox outcome of a multi-account scan. */
export interface ScanAccountResult {
  address: string;
  ok: boolean;
  error?: string;
  found: number;
}

export interface ScanCandidate {
  name: string;
  category: string;
  amount: number;
  billingCycle: "monthly" | "yearly";
  lastChargeDate: string;
  nextDueDate: string;
  confidence: number;
  evidence?: string;
  /** Which linked Gmail address(es) this charge was found in. */
  sourceAccounts?: string[];
  /** A known merchant was mentioned but no price could be found — amount is a placeholder (0). */
  needsDetails?: boolean;
}

export interface PlaidStatus {
  configured: boolean; // Plaid API keys present on the server
  connected: boolean;
  institutionName?: string;
  lastScanAt?: string;
  demo: boolean;
}

export const api = {
  gmailStatus: () => request<GmailStatus>("/gmail/status"),
  gmailAuthUrl: () => request<{ url?: string; demo: boolean }>("/gmail/auth-url"),
  gmailScan: () =>
    request<{ demo: boolean; items: ScanCandidate[]; accounts?: ScanAccountResult[] }>(
      "/gmail/scan",
      { method: "POST" },
    ),
  gmailDisconnect: (address?: string) =>
    request<{ ok: boolean }>("/gmail/disconnect", {
      method: "POST",
      body: JSON.stringify(address ? { address } : {}),
    }),

  plaidStatus: () => request<PlaidStatus>("/plaid/status"),
  plaidLinkToken: () =>
    request<{ linkToken?: string; demo: boolean }>("/plaid/link-token", { method: "POST" }),
  plaidExchange: (publicToken: string, institutionName?: string) =>
    request<{ ok: boolean }>("/plaid/exchange", {
      method: "POST",
      body: JSON.stringify({ publicToken, institutionName }),
    }),
  plaidScan: () =>
    request<{ demo: boolean; items: ScanCandidate[] }>("/plaid/scan", { method: "POST" }),
  plaidDisconnect: () => request<{ ok: boolean }>("/plaid/disconnect", { method: "POST" }),

  sendTestReminder: () =>
    request<{ sent: boolean; to?: string; preview?: string; error?: string }>("/reminders/test", {
      method: "POST",
    }),
};
