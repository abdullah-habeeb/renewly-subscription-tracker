import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "estimate_subscription_savings",
  title: "Estimate subscription savings",
  description:
    "Given a list of monthly subscription costs, returns total monthly and yearly spend plus a rough savings estimate if a stated fraction were cancelled.",
  inputSchema: {
    subscriptions: z
      .array(
        z.object({
          name: z.string().describe("Subscription name, e.g. Netflix."),
          monthly_cost: z.number().nonnegative().describe("Monthly cost in the user's currency."),
        }),
      )
      .min(1)
      .describe("List of subscriptions with their monthly cost."),
    cancel_fraction: z
      .number()
      .min(0)
      .max(1)
      .default(0.2)
      .describe("Fraction (0-1) of monthly spend the user could plausibly cancel."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ subscriptions, cancel_fraction }) => {
    const monthly = subscriptions.reduce((sum, s) => sum + s.monthly_cost, 0);
    const yearly = monthly * 12;
    const monthlySavings = monthly * cancel_fraction;
    const yearlySavings = monthlySavings * 12;

    const lines = [
      `Subscriptions analyzed: ${subscriptions.length}`,
      `Total monthly spend: ${monthly.toFixed(2)}`,
      `Total yearly spend: ${yearly.toFixed(2)}`,
      `Estimated monthly savings (cancel ${Math.round(cancel_fraction * 100)}%): ${monthlySavings.toFixed(2)}`,
      `Estimated yearly savings: ${yearlySavings.toFixed(2)}`,
    ];

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: {
        count: subscriptions.length,
        monthly_total: monthly,
        yearly_total: yearly,
        monthly_savings: monthlySavings,
        yearly_savings: yearlySavings,
      },
    };
  },
});
