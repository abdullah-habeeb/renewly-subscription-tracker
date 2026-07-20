import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Inbox } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { buildRenewalsIcs, monthTotal, renewalsForMonth, type DayRenewals } from "@/lib/calendar";
import { useSubscriptions } from "@/lib/data";
import { formatDueDate, inr, inrExact, isEnded } from "@/lib/types";

export const Route = createFileRoute("/calendar")({
  component: () => <AppShell>{(user) => <CalendarPage user={user} />}</AppShell>,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarPage({ user }: { user: User }) {
  const { subs, loading } = useSubscriptions(user);
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const activeSubs = useMemo(() => subs.filter((s) => !isEnded(s)), [subs]);
  const days = useMemo(
    () => renewalsForMonth(activeSubs, cursor.y, cursor.m),
    [activeSubs, cursor],
  );
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const total = monthTotal(days);

  const monthLabel = new Date(cursor.y, cursor.m).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const exportIcs = () => {
    if (activeSubs.length === 0) {
      toast.info("Nothing to export yet — add or detect a subscription first.");
      return;
    }
    const blob = new Blob([buildRenewalsIcs(activeSubs)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "renewly-renewals.ics";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Calendar downloaded — import it in Google Calendar (Settings → Import & export).");
  };

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const isThisMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Renewal calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every charge, on the day it lands.
            {total > 0 && (
              <>
                {" "}
                <span className="text-foreground">{inr.format(total)}</span> due in{" "}
                {monthLabel.split(" ")[0]}.
              </>
            )}
          </p>
        </div>
        <button
          onClick={exportIcs}
          className="flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Download className="h-4 w-4" />
          Export to Google Calendar
        </button>
      </div>

      <section className="rounded-3xl border border-border/60 bg-card-gradient p-6 shadow-elegant backdrop-blur-xl">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl tracking-tight">{monthLabel}</h2>
          <div className="flex items-center gap-1.5">
            {!isThisMonth && (
              <button
                onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
                className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Today
              </button>
            )}
            <button
              aria-label="Previous month"
              onClick={() => shift(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="Next month"
              onClick={() => shift(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl sm:h-20" />
            ))}
          </div>
        ) : (
          <>
            {/* Weekday header */}
            <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const entry = byDay.get(day);
                const isToday = isThisMonth && day === today.getDate();
                return <DayCell key={day} day={day} entry={entry} isToday={isToday} />;
              })}
            </div>
          </>
        )}
      </section>

      {/* Month list — the grid's text fallback, and the mobile-first view */}
      <section className="rounded-3xl border border-border/60 bg-card-gradient p-6 shadow-elegant backdrop-blur-xl">
        <h2 className="font-display text-xl tracking-tight">Due in {monthLabel.split(" ")[0]}</h2>
        {days.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-surface-elevated/60">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {activeSubs.length === 0
                ? "No subscriptions yet — add some on the dashboard and they'll show up here."
                : "Nothing renews this month."}
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border/40">
            {days.flatMap((d) =>
              d.items.map((item) => (
                <li key={`${d.day}-${item.id}`} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl border border-border/60 bg-surface-elevated/60">
                      <CalendarDays className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-semibold tabular-nums">{d.day}</span>
                    </span>
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDueDate(
                          `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
                        )}{" "}
                        · {item.billingCycle}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium tabular-nums">{inrExact.format(item.amount)}</p>
                </li>
              )),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function DayCell({
  day, entry, isToday,
}: { day: number; entry?: DayRenewals; isToday: boolean }) {
  return (
    <div
      title={
        entry
          ? entry.items.map((i) => `${i.name} — ${inrExact.format(i.amount)}`).join("\n")
          : undefined
      }
      className={`min-h-16 rounded-xl border p-1.5 sm:min-h-20 sm:p-2 ${
        isToday
          ? "border-primary/60 bg-primary/10"
          : entry
            ? "border-accent/40 bg-accent/5"
            : "border-border/40 bg-surface/40"
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-[11px] font-medium tabular-nums ${
            isToday ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {day}
        </span>
        {entry && <span className="h-1.5 w-1.5 rounded-full bg-accent sm:hidden" />}
      </div>
      {entry && (
        <div className="mt-1 hidden space-y-0.5 sm:block">
          {entry.items.slice(0, 2).map((item) => (
            <p
              key={item.id}
              className="truncate rounded-md bg-surface-elevated/80 px-1.5 py-0.5 text-[10px] font-medium"
            >
              {item.name}
            </p>
          ))}
          {entry.items.length > 2 && (
            <p className="px-1.5 text-[10px] text-muted-foreground">
              +{entry.items.length - 2} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
