import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Ban, CalendarOff, CheckCircle2, History as HistoryIcon, Mail, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SourceBadge } from "@/routes/dashboard";
import { reactivateSubscription, useSubscriptions } from "@/lib/data";
import { formatDueDate, inrExact, isCancelled, isEnded, type Subscription } from "@/lib/types";

export const Route = createFileRoute("/history")({
  component: () => <AppShell>{(user) => <History user={user} />}</AppShell>,
});

type StatusFilter = "all" | "active" | "cancelled" | "ended";

function History({ user }: { user: User }) {
  const { subs, loading } = useSubscriptions(user);
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Every subscription this account has ever tracked, unfiltered — the
  // dashboard only shows the active set; this is the full ledger.
  const withStatus = useMemo(
    () =>
      subs.map((sub) => ({
        sub,
        status: isCancelled(sub) ? ("cancelled" as const) : isEnded(sub) ? ("ended" as const) : ("active" as const),
      })),
    [subs],
  );

  const counts = useMemo(
    () => ({
      all: withStatus.length,
      active: withStatus.filter((s) => s.status === "active").length,
      cancelled: withStatus.filter((s) => s.status === "cancelled").length,
      ended: withStatus.filter((s) => s.status === "ended").length,
    }),
    [withStatus],
  );

  const visible = useMemo(
    () =>
      (filter === "all" ? withStatus : withStatus.filter((s) => s.status === filter))
        // Newest activity first: cancelled/ended by their date, active by start date.
        .sort((a, b) => rowDate(b).localeCompare(rowDate(a))),
    [withStatus, filter],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every subscription you've ever tracked — what it cost, and whether you're still paying for it.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterTab label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterTab label="Active" count={counts.active} active={filter === "active"} onClick={() => setFilter("active")} />
        <FilterTab label="Cancelled" count={counts.cancelled} active={filter === "cancelled"} onClick={() => setFilter("cancelled")} />
        <FilterTab label="Ended" count={counts.ended} active={filter === "ended"} onClick={() => setFilter("ended")} />
      </div>

      <section className="rounded-3xl border border-border/60 bg-card-gradient p-6 shadow-elegant backdrop-blur-xl">
        {loading ? (
          <ul className="divide-y divide-border/40">
            {Array.from({ length: 4 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="divide-y divide-border/40">
            {visible.map(({ sub, status }) => (
              <HistoryRow key={sub.id} sub={sub} status={status} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function rowDate({ sub, status }: { sub: Subscription; status: "active" | "cancelled" | "ended" }): string {
  if (status === "cancelled") return sub.cancelledAt || sub.startDate;
  if (status === "ended") return sub.endDate || sub.startDate;
  return sub.startDate;
}

function FilterTab({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
        active
          ? "bg-gradient-primary text-primary-foreground shadow-glow"
          : "border border-border/60 bg-surface/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function HistoryRow({ sub, status }: { sub: Subscription; status: "active" | "cancelled" | "ended" }) {
  const [busy, setBusy] = useState(false);

  const onReactivate = async () => {
    setBusy(true);
    try {
      await reactivateSubscription(sub.id);
      toast.success(`${sub.name} reactivated`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't reactivate. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-4 py-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface-elevated/60 text-sm font-semibold text-primary">
        {sub.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {sub.name}
          {sub.source && sub.source !== "manual" && (
            <SourceBadge source={sub.source} accounts={sub.sourceAccounts} />
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {sub.category} · {sub.billingCycle}
          {sub.sourceAccounts && sub.sourceAccounts.length > 0 && (
            <>
              {" "}
              · <Mail className="mb-0.5 inline h-2.5 w-2.5" /> {sub.sourceAccounts.join(", ")}
            </>
          )}
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className="font-medium">{inrExact.format(sub.amount)}</p>
        <p className="text-xs text-muted-foreground">
          {status === "active" && `next due ${formatDueDate(sub.nextDueDate)}`}
          {status === "ended" && sub.endDate && `ended ${formatDueDate(sub.endDate)}`}
          {status === "cancelled" && sub.cancelledAt && `cancelled ${formatDueDate(sub.cancelledAt)}`}
        </p>
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        <StatusBadge status={status} source={sub.cancellationSource} />
        {status === "cancelled" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onReactivate}
                disabled={busy}
                aria-label="Reactivate"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reactivate</TooltipContent>
          </Tooltip>
        )}
      </div>
      {status === "cancelled" && sub.cancellationEvidence && (
        <p className="w-full pl-14 text-[11px] text-muted-foreground/70">
          {sub.cancellationSource === "gmail" ? "Detected: " : ""}
          {sub.cancellationEvidence}
        </p>
      )}
    </li>
  );
}

function StatusBadge({ status, source }: { status: "active" | "cancelled" | "ended"; source?: string | null }) {
  if (status === "active") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
        <CheckCircle2 className="h-3 w-3" /> Active
      </span>
    );
  }
  if (status === "ended") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-surface-elevated/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        <CalendarOff className="h-3 w-3" /> Ended
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent">
      <Ban className="h-3 w-3" /> Cancelled{source === "gmail" ? " · Gmail" : source === "manual" ? " · manual" : ""}
    </span>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </li>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  const copy =
    filter === "all"
      ? { icon: HistoryIcon, text: "Nothing tracked yet. Add a subscription or connect Gmail to get started." }
      : filter === "cancelled"
        ? { icon: Ban, text: "No cancellations on record." }
        : filter === "ended"
          ? { icon: CalendarOff, text: "Nothing has reached its till date yet." }
          : { icon: Sparkles, text: "No active subscriptions in this filter." };
  const Icon = copy.icon;
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-surface-elevated/60">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mt-4 max-w-xs text-sm text-muted-foreground">{copy.text}</p>
    </div>
  );
}
