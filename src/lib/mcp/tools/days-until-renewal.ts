import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "days_until_renewal",
  title: "Days until renewal",
  description:
    "Given a renewal date (ISO YYYY-MM-DD), returns days remaining until that date and a suggested reminder date a few days before.",
  inputSchema: {
    renewal_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Renewal date in ISO YYYY-MM-DD format."),
    remind_days_before: z
      .number()
      .int()
      .min(0)
      .max(30)
      .default(3)
      .describe("How many days before the renewal to send a reminder."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ renewal_date, remind_days_before }) => {
    const renewal = new Date(`${renewal_date}T00:00:00Z`);
    if (Number.isNaN(renewal.getTime())) {
      return {
        content: [{ type: "text", text: "Invalid renewal_date." }],
        isError: true,
      };
    }
    const today = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntil = Math.ceil((renewal.getTime() - today.getTime()) / msPerDay);
    const reminder = new Date(renewal.getTime() - remind_days_before * msPerDay);
    const reminderIso = reminder.toISOString().slice(0, 10);

    return {
      content: [
        {
          type: "text",
          text: `${daysUntil} day(s) until renewal on ${renewal_date}. Suggested reminder: ${reminderIso}.`,
        },
      ],
      structuredContent: {
        renewal_date,
        days_until: daysUntil,
        reminder_date: reminderIso,
        overdue: daysUntil < 0,
      },
    };
  },
});
