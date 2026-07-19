import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addSubscription, updateSubscription } from "@/lib/data";
import { CATEGORIES, type Subscription } from "@/lib/types";

const subscriptionSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
    amount: z
      .number({ error: "Enter an amount" })
      .positive("Amount must be greater than ₹0"),
    // A plain non-empty string, not a strict enum of CATEGORIES — older or
    // Gmail/bank-detected subscriptions may carry a category outside that
    // fixed list, and editing them shouldn't fail validation on open.
    category: z.string().min(1, "Choose a category"),
    billingCycle: z.enum(["monthly", "yearly"]),
    startDate: z.string().min(1, "Pick a start date"),
    // Optional "till date" — empty string means no end date.
    endDate: z.string(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "Till date can't be before the start date",
    path: ["endDate"],
  });

type SubscriptionFormValues = z.infer<typeof subscriptionSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  /** When set, the dialog edits this subscription instead of creating one. */
  editing?: Subscription | null;
}

function defaultValues(editing?: Subscription | null): SubscriptionFormValues {
  return editing
    ? {
        name: editing.name,
        amount: editing.amount,
        category: editing.category,
        billingCycle: editing.billingCycle,
        startDate: editing.startDate ?? new Date().toISOString().split("T")[0],
        endDate: editing.endDate ?? "",
      }
    : {
        name: "",
        amount: 0,
        category: "Entertainment",
        billingCycle: "monthly",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
      };
}

export function SubscriptionDialog({ open, onOpenChange, uid, editing }: Props) {
  const [saving, setSaving] = useState(false);
  const form = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: defaultValues(editing),
  });

  useEffect(() => {
    if (open) form.reset(defaultValues(editing));
    // form.reset is stable across renders — only re-seed when the dialog opens or the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const onSubmit = async (values: SubscriptionFormValues) => {
    const payload = {
      ...values,
      name: values.name.trim(),
      endDate: values.endDate || null,
    };
    setSaving(true);
    try {
      if (editing) {
        await updateSubscription(editing.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await addSubscription(uid, payload);
        toast.success(`${payload.name} added`);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60 bg-card-gradient backdrop-blur-xl sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal tracking-tight">
            {editing ? "Edit subscription" : "Add a subscription"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the details below."
              : "Track anything that bills you on a schedule."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-2 space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Netflix, Spotify, iCloud…"
                      autoFocus
                      autoComplete="off"
                      className={fieldCls}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Amount (₹)
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="499"
                        value={value || ""}
                        onChange={(e) => onChange(e.target.valueAsNumber)}
                        className={fieldCls}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="billingCycle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Billing cycle
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={fieldCls}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Category
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={fieldCls}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Started on
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className={fieldCls} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    Till date (optional)
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="date" className={fieldCls} />
                  </FormControl>
                  <FormDescription className="text-[11px] text-muted-foreground/70">
                    Once this date passes, Sublet will ask whether to remove the subscription.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <button
              type="submit"
              disabled={saving}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editing ? (
                "Save changes"
              ) : (
                "Add subscription"
              )}
            </button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const fieldCls =
  "h-11 w-full rounded-xl border border-border/60 bg-input/60 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/25 [color-scheme:dark]";
