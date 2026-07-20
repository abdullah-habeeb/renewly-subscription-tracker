import { ExternalLink, IndianRupee, Scissors } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelSearchUrl,
  findCancelGuide,
  GENERIC_STEPS,
  UPI_MANDATE_TIP,
} from "@/lib/cancellation";
import type { Subscription } from "@/lib/types";

/**
 * "How do I actually cancel this?" — curated per-merchant steps with a direct
 * link, or a sensible generic playbook when the merchant isn't in the map.
 */
export function CancellationGuideDialog({
  sub,
  onClose,
}: {
  sub: Subscription | null;
  onClose: () => void;
}) {
  const guide = sub ? findCancelGuide(sub.name) : null;
  const steps = guide ? guide.steps : GENERIC_STEPS;
  const url = sub ? (guide ? guide.url : cancelSearchUrl(sub.name)) : "#";

  return (
    <Dialog open={Boolean(sub)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border/60 bg-card-gradient backdrop-blur-xl sm:max-w-md">
        {sub && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl tracking-tight">
                <Scissors className="h-5 w-5 text-primary" />
                How to cancel {sub.name}
              </DialogTitle>
              <DialogDescription>
                {guide
                  ? `The fastest path through ${guide.merchant}'s account flow.`
                  : "We don't have exact steps for this one, but this route almost always works."}
              </DialogDescription>
            </DialogHeader>

            <ol className="space-y-2.5">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>

            {guide?.note && (
              <p className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-xs text-accent">
                {guide.note}
              </p>
            )}

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <ExternalLink className="h-4 w-4" />
              {guide ? "Open the cancellation page" : "Search the exact steps"}
            </a>

            <p className="flex gap-2 rounded-xl border border-border/60 bg-surface/60 px-3.5 py-2.5 text-xs text-muted-foreground">
              <IndianRupee className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{UPI_MANDATE_TIP}</span>
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
