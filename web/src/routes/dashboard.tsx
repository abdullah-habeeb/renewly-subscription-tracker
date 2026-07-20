import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  Plus, Pencil, Trash2, CalendarClock, Wallet, Layers, Bell,
  Inbox, Sparkles, Check, X, Loader2, Mail, Landmark, CalendarOff, Scissors, TrendingUp,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CancellationGuideDialog } from "@/components/CancellationGuideDialog";
import { SubscriptionDialog } from "@/components/SubscriptionDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCountUp } from "@/hooks/useCountUp";
import {
  acceptPriceChange,
  approveDetected,
  clearEndDate,
  deleteSubscription,
  dismissDetected,
  dismissPriceChange,
  markDetectedApproved,
  useDetected,
  useSubscriptions,
} from "@/lib/data";
import {
  daysUntil,
  formatDueDate,
  inr,
  inrExact,
  isEnded,
  monthlyCost,
  yearlyCost,
  type DetectedSubscription,
  type Subscription,
} from "@/lib/types";

export const Route = createFileRoute("/dashboard")({
  component: () => <AppShell>{(user) => <Dashboard user={user} />}</AppShell>,
});

const CHART_COLORS = [
  "oklch(0.65 0.19 262)",
  "oklch(0.74 0.15 55)",
  "oklch(0.7 0.14 200)",
  "oklch(0.68 0.16 320)",
  "oklch(0.72 0.15 140)",
  "oklch(0.66 0.18 25)",
];

/** Stagger delay for the Nth item, capped so long lists don't feel sluggish to reveal. */
const stagger = (i: number, stepMs = 40, capIndex = 8) => `${Math.min(i, capIndex) * stepMs}ms`;

function Dashboard({ user }: { user: User }) {
  const { subs, loading } = useSubscriptions(user);
  const detected = useDetected(user);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [cancelFor, setCancelFor] = useState<Subscription | null>(null);
  const [nudgeFor, setNudgeFor] = useState<DetectedSubscription | null>(null);

  // Subscriptions past their till date drop out of every money figure and
  // move to a "these ended" prompt — they're only removed with permission.
  const { activeSubs, endedSubs } = useMemo(
    () => ({
      activeSubs: subs.filter((s) => !isEnded(s)),
      endedSubs: subs.filter((s) => isEnded(s)),
    }),
    [subs],
  );

  const priceChanged = useMemo(
    () => activeSubs.filter((s) => s.pendingPriceChange),
    [activeSubs],
  );

  const stats = useMemo(() => {
    const monthly = activeSubs.reduce((t, s) => t + monthlyCost(s), 0);
    const yearly = activeSubs.reduce((t, s) => t + yearlyCost(s), 0);
    const next = activeSubs[0]; // sorted by nextDueDate
    return { monthly, yearly, count: activeSubs.length, next };
  }, [activeSubs]);

  // Cap to the 5 largest categories + an "Other" bucket — pie charts become
  // visually unreadable and fail the "no more than ~6 slices" guideline beyond that.
  const byCategory = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const s of activeSubs) acc[s.category] = (acc[s.category] ?? 0) + monthlyCost(s);
    const sorted = Object.entries(acc)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 6) return sorted;
    const other = sorted.slice(5).reduce((t, c) => t + c.value, 0);
    return [...sorted.slice(0, 5), { name: "Other", value: Math.round(other * 100) / 100 }];
  }, [activeSubs]);

  const categoryTotal = useMemo(
    () => byCategory.reduce((t, c) => t + c.value, 0),
    [byCategory],
  );

  const upcoming = useMemo(
    () => activeSubs.filter((s) => daysUntil(s.nextDueDate) >= 0).slice(0, 5),
    [activeSubs],
  );

  const openAdd = () => { setEditing(null); setNudgeFor(null); setDialogOpen(true); };
  const openEdit = (sub: Subscription) => { setEditing(sub); setNudgeFor(null); setDialogOpen(true); };
  const openNudge = (item: DetectedSubscription) => { setEditing(null); setNudgeFor(item); setDialogOpen(true); };

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">
            {greeting()}{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's where your money quietly goes every month.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add subscription
        </button>
      </div>

      {/* Detected review banner */}
      {detected.length > 0 && <DetectedPanel items={detected} onAddDetails={openNudge} />}

      {/* Price changes spotted by scans — amounts only change with permission */}
      {priceChanged.length > 0 && <PriceChangePanel items={priceChanged} />}

      {/* Ended subscriptions prompt (till date passed — remove only with permission) */}
      {endedSubs.length > 0 && <EndedPanel items={endedSubs} />}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              icon={Wallet}
              label="Monthly spend"
              value={<CountUpValue target={stats.monthly} format={inrExact.format} />}
              delay={stagger(0)}
            />
            <StatCard
              icon={CalendarClock}
              label="Yearly equivalent"
              value={<CountUpValue target={stats.yearly} format={inr.format} />}
              delay={stagger(1)}
            />
            <StatCard
              icon={Layers}
              label="Active subscriptions"
              value={<CountUpValue target={stats.count} format={(n) => String(Math.round(n))} />}
              delay={stagger(2)}
            />
            <StatCard
              icon={Bell}
              label="Next renewal"
              value={stats.next ? stats.next.name : "—"}
              sub={stats.next ? renewalPhrase(stats.next.nextDueDate) : "Nothing due"}
              delay={stagger(3)}
            />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Subscription list */}
        <Panel className="lg:col-span-3">
          <PanelTitle>Your subscriptions</PanelTitle>
          {loading ? (
            <ul className="mt-4 divide-y divide-border/40">
              {Array.from({ length: 4 }).map((_, i) => (
                <SubscriptionRowSkeleton key={i} />
              ))}
            </ul>
          ) : activeSubs.length === 0 ? (
            <EmptyState onAdd={openAdd} />
          ) : (
            <ul className="mt-4 divide-y divide-border/40">
              {activeSubs.map((sub, i) => (
                <SubscriptionRow
                  key={sub.id}
                  sub={sub}
                  onEdit={() => openEdit(sub)}
                  onCancelGuide={() => setCancelFor(sub)}
                  delay={stagger(i)}
                />
              ))}
            </ul>
          )}
        </Panel>

        {/* Right column: chart + upcoming */}
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <PanelTitle>Spend by category</PanelTitle>
            {byCategory.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Add subscriptions to see the breakdown.
              </p>
            ) : (
              <>
                <div className="mt-2 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        strokeWidth={0}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {byCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        formatter={(value: number) => inrExact.format(value) + "/mo"}
                        contentStyle={{
                          background: "oklch(0.2 0.005 260)",
                          border: "1px solid oklch(0.32 0.006 260 / 0.5)",
                          borderRadius: "0.75rem",
                          color: "oklch(0.96 0.002 260)",
                        }}
                        itemStyle={{ color: "oklch(0.96 0.002 260)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Text fallback for the chart — pie charts fail WCAG for colorblind
                    users, so the category + amount + share must stand on their own. */}
                <ul className="mt-3 space-y-1.5">
                  {byCategory.map((c, i) => (
                    <li key={c.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        {c.name}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-xs text-muted-foreground/70">
                          {categoryTotal > 0 ? Math.round((c.value / categoryTotal) * 100) : 0}%
                        </span>
                        <span className="font-medium">{inrExact.format(c.value)}/mo</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel>
            <PanelTitle>Upcoming renewals</PanelTitle>
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing coming up.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((s) => {
                  const days = daysUntil(s.nextDueDate);
                  return (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDueDate(s.nextDueDate)}</p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-medium">{inrExact.format(s.amount)}</p>
                        <p className={`text-xs ${days <= 3 ? "text-accent" : "text-muted-foreground"}`}>
                          {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setNudgeFor(null);
        }}
        uid={user.uid}
        editing={editing}
        prefill={
          nudgeFor
            ? {
                name: nudgeFor.name,
                category: nudgeFor.category,
                startDate: nudgeFor.lastChargeDate,
                source: nudgeFor.source,
                sourceAccounts: nudgeFor.sourceAccounts,
              }
            : null
        }
        onSaved={() => {
          if (nudgeFor) markDetectedApproved(nudgeFor.id);
        }}
      />
      <CancellationGuideDialog sub={cancelFor} onClose={() => setCancelFor(null)} />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function renewalPhrase(dateStr: string) {
  const days = daysUntil(dateStr);
  if (days < 0) return "overdue";
  if (days === 0) return "renews today";
  if (days === 1) return "renews tomorrow";
  return `renews in ${days} days`;
}

function CountUpValue({ target, format }: { target: number; format: (n: number) => string }) {
  const value = useCountUp(target);
  return <>{format(value)}</>;
}

function StatCard({
  icon: Icon, label, value, sub, delay = "0ms",
}: { icon: typeof Wallet; label: string; value: ReactNode; sub?: string; delay?: string }) {
  return (
    <div
      className="animate-fade-slide-up rounded-3xl border border-border/60 bg-card-gradient p-5 shadow-elegant backdrop-blur-xl"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card-gradient p-5 shadow-elegant backdrop-blur-xl">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-border/60 bg-card-gradient p-6 shadow-elegant backdrop-blur-xl ${className}`}>
      {children}
    </section>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl tracking-tight">{children}</h2>;
}

function SubscriptionRow({
  sub, onEdit, onCancelGuide, delay = "0ms",
}: { sub: Subscription; onEdit: () => void; onCancelGuide: () => void; delay?: string }) {
  const days = daysUntil(sub.nextDueDate);

  const onDelete = async () => {
    try {
      await deleteSubscription(sub.id);
      toast.success(`${sub.name} deleted`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete. Try again.");
    }
  };

  return (
    <li
      className="group flex animate-fade-slide-up items-center gap-4 py-3.5"
      style={{ animationDelay: delay }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface-elevated/60 text-sm font-semibold text-primary">
        {sub.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {sub.name}
          {sub.source && sub.source !== "manual" && (
            <SourceBadge source={sub.source} accounts={sub.sourceAccounts} />
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {sub.category} · {sub.billingCycle}
          {sub.sourceAccounts && sub.sourceAccounts.length > 0 && (
            <> · {sub.sourceAccounts.join(", ")}</>
          )}
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className="font-medium">{inrExact.format(sub.amount)}</p>
        <p className={`text-xs ${days >= 0 && days <= 3 ? "text-accent" : "text-muted-foreground"}`}>
          {formatDueDate(sub.nextDueDate)}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconBtn label="Edit" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label="How to cancel" onClick={onCancelGuide}>
          <Scissors className="h-3.5 w-3.5" />
        </IconBtn>

        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <button
                  aria-label="Delete"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
          <AlertDialogContent className="border-border/60 bg-card-gradient backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {sub.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This can't be undone. You'll stop getting renewal reminders for it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function SubscriptionRowSkeleton() {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="space-y-2">
        <Skeleton className="ml-auto h-4 w-16" />
        <Skeleton className="ml-auto h-3 w-14" />
      </div>
    </li>
  );
}

function IconBtn({
  children, label, onClick, disabled = false,
}: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const SOURCE_META: Record<string, { icon: typeof Mail; label: string }> = {
  gmail: { icon: Mail, label: "gmail" },
  plaid: { icon: Landmark, label: "bank" },
  demo: { icon: Sparkles, label: "demo" },
};

function SourceBadge({ source, accounts }: { source?: string; accounts?: string[] }) {
  const meta = source ? SOURCE_META[source] : undefined;
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      title={accounts && accounts.length > 0 ? `Found in ${accounts.join(", ")}` : undefined}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
    >
      <Icon className="h-2.5 w-2.5" /> {meta.label}
      {accounts && accounts.length > 1 && (
        <span className="tabular-nums">×{accounts.length}</span>
      )}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-surface-elevated/60">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mt-4 font-medium">No subscriptions yet</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Add one manually, or connect Gmail or your bank in Settings and let Renewly find them for you.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <Plus className="h-4 w-4" /> Add your first
      </button>
    </div>
  );
}

function DetectedPanel({
  items, onAddDetails,
}: { items: DetectedSubscription[]; onAddDetails: (item: DetectedSubscription) => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (item: DetectedSubscription, approve: boolean) => {
    setBusy(item.id);
    try {
      if (approve) {
        await approveDetected(item);
        toast.success(`${item.name} added to your subscriptions`);
      } else {
        await dismissDetected(item.id);
      }
    } catch (err) {
      console.error(err);
      toast.error("Action failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl border border-primary/30 bg-primary/5 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl tracking-tight">
          We found {items.length} subscription{items.length > 1 ? "s" : ""}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Review each one — approve to start tracking it, or dismiss if it's not a subscription.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <li
            key={item.id}
            className="animate-fade-slide-up rounded-2xl border border-border/60 bg-surface/60 p-4"
            style={{ animationDelay: stagger(i, 50) }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  {item.name}
                  <SourceBadge source={item.source} accounts={item.sourceAccounts} />
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {item.needsDetails ? "Price not found — add it yourself" : `${inrExact.format(item.amount)} · ${item.billingCycle}`}
                </p>
                {item.evidence && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/70">
                    {item.evidence}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {Math.round(item.confidence * 100)}% sure
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              {item.needsDetails ? (
                <button
                  onClick={() => onAddDetails(item)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <Pencil className="h-3 w-3" /> Add details
                </button>
              ) : (
                <button
                  onClick={() => act(item, true)}
                  disabled={busy === item.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Track it
                </button>
              )}
              <button
                onClick={() => act(item, false)}
                disabled={busy === item.id}
                className="flex items-center justify-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                <X className="h-3 w-3" /> Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PriceChangePanel({ items }: { items: Subscription[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (sub: Subscription, accept: boolean) => {
    setBusy(sub.id);
    try {
      if (accept) {
        await acceptPriceChange(sub);
        toast.success(`${sub.name} updated to ${inrExact.format(sub.pendingPriceChange!.newAmount)}`);
      } else {
        await dismissPriceChange(sub);
        toast.success(`Keeping ${sub.name} at ${inrExact.format(sub.amount)}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Action failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl border border-accent/30 bg-accent/5 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <h2 className="font-display text-xl tracking-tight">
          {items.length === 1 ? "A price changed" : `${items.length} prices changed`}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Your inbox shows these billing a different amount than you're tracking. Update, or keep
        your number.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((sub) => {
          const next = sub.pendingPriceChange!.newAmount;
          const pct = Math.round(((next - sub.amount) / sub.amount) * 100);
          const isHike = next > sub.amount;
          return (
            <li key={sub.id} className="rounded-2xl border border-border/60 bg-surface/60 p-4">
              <p className="truncate font-medium">{sub.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {inrExact.format(sub.amount)} → {inrExact.format(next)}{" "}
                <span className={isHike ? "text-accent" : "text-primary"}>
                  ({pct > 0 ? "+" : ""}
                  {pct}%)
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => act(sub, true)}
                  disabled={busy === sub.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy === sub.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Update amount
                </button>
                <button
                  onClick={() => act(sub, false)}
                  disabled={busy === sub.id}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  <X className="h-3 w-3" /> Keep mine
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EndedPanel({ items }: { items: Subscription[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  const remove = async (sub: Subscription) => {
    setBusy(sub.id);
    try {
      await deleteSubscription(sub.id);
      toast.success(`${sub.name} removed`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't remove. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const keep = async (sub: Subscription) => {
    setBusy(sub.id);
    try {
      await clearEndDate(sub.id);
      toast.success(`${sub.name} kept — till date cleared`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl border border-accent/30 bg-accent/5 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <CalendarOff className="h-4 w-4 text-accent" />
        <h2 className="font-display text-xl tracking-tight">
          {items.length === 1
            ? "A subscription reached its till date"
            : `${items.length} subscriptions reached their till date`}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        They no longer count toward your spend. Remove them, or keep tracking if they're still active.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((sub) => (
          <li key={sub.id} className="rounded-2xl border border-border/60 bg-surface/60 p-4">
            <p className="truncate font-medium">{sub.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {inrExact.format(sub.amount)} · {sub.billingCycle} · ended {formatDueDate(sub.endDate as string)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => remove(sub)}
                disabled={busy === sub.id}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-60"
              >
                {busy === sub.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Remove
              </button>
              <button
                onClick={() => keep(sub)}
                disabled={busy === sub.id}
                className="flex items-center justify-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> Keep tracking
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
