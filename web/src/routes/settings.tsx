import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import {
  Mail, Bell, Loader2, ScanSearch, Unplug, Send, CheckCircle2, FlaskConical, Landmark,
  Plus, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, type GmailStatus, type PlaidStatus } from "@/lib/api";
import { saveUserSettings, storeDetectedCandidates, useUserSettings } from "@/lib/data";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    gmail: typeof search.gmail === "string" ? search.gmail : undefined,
  }),
  component: () => <AppShell>{(user) => <Settings user={user} />}</AppShell>,
});

function Settings({ user }: { user: User }) {
  const settings = useUserSettings(user);
  const { gmail } = Route.useSearch();

  useEffect(() => {
    if (gmail === "connected") toast.success("Gmail connected!");
    if (gmail === "error") toast.error("Gmail connection failed. Please try again.");
  }, [gmail]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.email}
        </p>
      </div>

      <GmailCard user={user} />
      <BankCard user={user} />
      <ReminderCard
        uid={user.uid}
        reminderDays={settings?.reminderDays ?? 3}
        autoScan={settings?.autoScan ?? true}
      />
    </div>
  );
}

// ---------- Bank (Plaid) ----------

function BankCard({ user }: { user: User }) {
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [busy, setBusy] = useState<"connect" | "scan" | "disconnect" | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const openedRef = useRef(false);

  const refresh = () =>
    api.plaidStatus().then(setStatus).catch(() => setUnavailable(true));

  useEffect(() => {
    refresh();
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        const institutionName = metadata.institution?.name;
        await api.plaidExchange(publicToken, institutionName);
        toast.success(`${institutionName ?? "Bank account"} connected!`);
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to link bank account");
      } finally {
        setBusy(null);
        setLinkToken(null);
      }
    },
    [],
  );

  const onExit = useCallback(() => {
    setBusy(null);
    setLinkToken(null);
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  useEffect(() => {
    if (linkToken && ready && !openedRef.current) {
      openedRef.current = true;
      open();
    }
  }, [linkToken, ready, open]);

  const connect = async () => {
    setBusy("connect");
    try {
      const { linkToken: token, demo } = await api.plaidLinkToken();
      if (demo) {
        toast.info("Demo mode: no Plaid credentials configured on the server. Scanning will return sample data.");
        setBusy(null);
        await refresh();
        return;
      }
      openedRef.current = false;
      setLinkToken(token ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start bank connection");
      setBusy(null);
    }
  };

  const scan = async () => {
    setBusy("scan");
    try {
      const { demo, items } = await api.plaidScan();
      const { stored } = await storeDetectedCandidates(user.uid, items, demo ? "demo" : "plaid");
      if (stored === 0) {
        toast.info("Scan complete — no new recurring charges found.");
      } else {
        toast.success(
          `Scan complete — found ${stored} possible subscription${stored > 1 ? "s" : ""}. Review them on the dashboard.${demo ? " (sample data)" : ""}`,
        );
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await api.plaidDisconnect();
      toast.success("Bank account disconnected.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      icon={Landmark}
      title="International banks (demo)"
      desc="Plaid-powered bank linking — the flow apps like Mint use, running on sandbox test banks. Indian banks aren't on Plaid (India uses the RBI Account Aggregator network); for Indian accounts, Gmail scanning above reads your real bank alert emails."
    >
      {unavailable ? (
        <p className="rounded-xl border border-border/60 bg-surface/60 px-4 py-3 text-sm text-muted-foreground">
          The backend isn't reachable right now — start the API server to use bank scanning.
        </p>
      ) : !status ? (
        <ConnectionStatusSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/60 px-4 py-3">
            <div className="flex items-center gap-3">
              {status.connected ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : status.demo ? (
                <FlaskConical className="h-4 w-4 text-accent" />
              ) : (
                <Unplug className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {status.connected
                    ? `Connected${status.institutionName ? ` — ${status.institutionName}` : ""}`
                    : status.demo
                      ? "Demo mode"
                      : "Not connected"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status.connected && status.lastScanAt
                    ? `Last scan ${new Date(status.lastScanAt).toLocaleString("en-IN")}`
                    : status.demo
                      ? "Server has no Plaid API keys — scans return realistic sample data."
                      : "Connect to detect recurring charges straight from your transactions."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {!status.connected && (
              <PrimaryBtn onClick={connect} busy={busy === "connect"}>
                <Landmark className="h-4 w-4" />
                {status.demo ? "Try demo connection" : "Connect bank"}
              </PrimaryBtn>
            )}
            {(status.connected || status.demo) && (
              <PrimaryBtn onClick={scan} busy={busy === "scan"}>
                <ScanSearch className="h-4 w-4" />
                Scan now
              </PrimaryBtn>
            )}
            {status.connected && (
              <GhostBtn onClick={disconnect} busy={busy === "disconnect"}>
                <Unplug className="h-4 w-4" />
                Disconnect
              </GhostBtn>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Gmail ----------

function GmailCard({ user }: { user: User }) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState<"connect" | "scan" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = () =>
    api.gmailStatus().then(setStatus).catch(() => setUnavailable(true));

  useEffect(() => {
    refresh();
  }, []);

  const connect = async () => {
    setBusy("connect");
    try {
      const { url, demo } = await api.gmailAuthUrl();
      if (demo) {
        toast.info("Demo mode: no Google OAuth credentials configured on the server. Scanning will return sample data.");
        await refresh();
      } else if (url) {
        window.location.href = url;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start Gmail connection");
    } finally {
      setBusy(null);
    }
  };

  const scan = async () => {
    setBusy("scan");
    try {
      const { demo, items, accounts } = await api.gmailScan();
      const { stored, priceChanges } = await storeDetectedCandidates(
        user.uid,
        items,
        demo ? "demo" : "gmail",
      );
      if (stored === 0 && priceChanges.length === 0) {
        toast.info("Scan complete — no new recurring charges found.");
      } else if (stored > 0) {
        toast.success(
          `Scan complete — found ${stored} possible subscription${stored > 1 ? "s" : ""}. Review them on the dashboard.${demo ? " (sample data)" : ""}`,
        );
      }
      if (priceChanges.length > 0) {
        toast.info(
          `${priceChanges.length} price change${priceChanges.length > 1 ? "s" : ""} spotted — review on the dashboard.`,
        );
      }
      // A failed inbox never blocks the others — but the user should know.
      for (const a of accounts ?? []) {
        if (!a.ok) toast.warning(`${a.address}: ${a.error ?? "scan failed"}`);
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(null);
    }
  };

  const disconnectAccount = async (address: string) => {
    setRemoving(address);
    try {
      await api.gmailDisconnect(address);
      toast.success(`${address} disconnected.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setRemoving(null);
    }
  };

  const accounts = status?.accounts ?? [];

  return (
    <Card
      icon={Mail}
      title="Gmail subscription detection"
      desc="Renewly reads your bank alerts and payment receipts (read-only) to find recurring charges. Link every Gmail you use — subscriptions from all your inboxes land in one place. For Indian banks — HDFC, ICICI, SBI and the rest — this is your real transaction feed."
    >
      {unavailable ? (
        <p className="rounded-xl border border-border/60 bg-surface/60 px-4 py-3 text-sm text-muted-foreground">
          The backend isn't reachable right now — start the API server to use Gmail scanning.
        </p>
      ) : !status ? (
        <ConnectionStatusSkeleton />
      ) : (
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 px-4 py-3">
              {status.demo ? (
                <FlaskConical className="h-4 w-4 shrink-0 text-accent" />
              ) : (
                <Unplug className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">{status.demo ? "Demo mode" : "Not connected"}</p>
                <p className="text-xs text-muted-foreground">
                  {status.demo
                    ? "Server has no Google OAuth credentials — scans return realistic sample data."
                    : "Connect to scan your inbox for subscriptions."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div
                  key={a.address}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/60 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {a.needsReauth ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.address}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.needsReauth
                          ? "Access expired — reconnect this account"
                          : a.lastScanAt
                            ? `Last scan ${new Date(a.lastScanAt).toLocaleString("en-IN")}`
                            : "Not scanned yet"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.needsReauth && (
                      <button
                        onClick={connect}
                        className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      aria-label={`Disconnect ${a.address}`}
                      onClick={() => disconnectAccount(a.address)}
                      disabled={removing === a.address}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                    >
                      {removing === a.address ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Unplug className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {accounts.length === 0 && (
              <PrimaryBtn onClick={connect} busy={busy === "connect"}>
                <Mail className="h-4 w-4" />
                {status.demo ? "Try demo connection" : "Connect Gmail"}
              </PrimaryBtn>
            )}
            {(accounts.length > 0 || status.demo) && (
              <PrimaryBtn onClick={scan} busy={busy === "scan"}>
                <ScanSearch className="h-4 w-4" />
                {accounts.length > 1 ? "Scan all inboxes" : "Scan now"}
              </PrimaryBtn>
            )}
            {accounts.length > 0 && !status.demo && (
              <GhostBtn onClick={connect} busy={busy === "connect"}>
                <Plus className="h-4 w-4" />
                Add another Gmail
              </GhostBtn>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Reminders ----------

function ReminderCard({
  uid, reminderDays, autoScan,
}: { uid: string; reminderDays: number; autoScan: boolean }) {
  const [days, setDays] = useState(reminderDays);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => setDays(reminderDays), [reminderDays]);

  const toggleAutoScan = async (value: boolean) => {
    try {
      await saveUserSettings(uid, { autoScan: value });
      toast.success(
        value
          ? "Weekly auto-scan is on — we'll email you anything new."
          : "Weekly auto-scan turned off.",
      );
    } catch {
      toast.error("Couldn't save preference.");
    }
  };

  const save = async (value: number) => {
    setDays(value);
    setSaving(true);
    try {
      await saveUserSettings(uid, { reminderDays: value });
      toast.success(`Reminders will arrive ${value} day${value > 1 ? "s" : ""} before renewal.`);
    } catch {
      toast.error("Couldn't save preference.");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const res = await api.sendTestReminder();
      if (res.sent) {
        toast.success(`Test reminder sent to ${res.to}. Check your inbox!`);
      } else {
        toast.info(res.error ?? "Email isn't configured on the server yet — see README for SMTP setup.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card
      icon={Bell}
      title="Renewal reminders"
      desc="A daily job emails you before each subscription renews, so nothing sneaks through."
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Remind me before renewal
          </p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 5, 7].map((d) => (
              <button
                key={d}
                onClick={() => save(d)}
                disabled={saving}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  days === d
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "border border-border/60 bg-surface/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {d} day{d > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/60 px-4 py-3">
          <div className="pr-4">
            <p className="text-sm font-medium">Weekly auto-scan digest</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Renewly re-scans your linked Gmail in the background and emails you when it
              finds a new subscription — no button-pressing required.
            </p>
          </div>
          <Switch
            defaultChecked={autoScan}
            onCheckedChange={toggleAutoScan}
            aria-label="Toggle weekly auto-scan digest"
          />
        </div>

        <GhostBtn onClick={sendTest} busy={sending}>
          <Send className="h-4 w-4" />
          Send me a test reminder
        </GhostBtn>
      </div>
    </Card>
  );
}

// ---------- shared bits ----------

function Card({
  icon: Icon, title, desc, children,
}: { icon: typeof Mail; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card-gradient p-6 shadow-elegant backdrop-blur-xl sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface-elevated/60">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-2xl tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ConnectionStatusSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 px-4 py-3">
        <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <Skeleton className="h-10 w-36 rounded-full" />
    </div>
  );
}

function PrimaryBtn({
  children, onClick, busy,
}: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function GhostBtn({
  children, onClick, busy,
}: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
