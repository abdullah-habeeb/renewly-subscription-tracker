import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const CATEGORIES = [
  "Streaming",
  "Music",
  "Productivity",
  "Cloud storage",
  "Fitness",
  "News",
  "Gaming",
  "Utilities",
  "AI tools",
  "Other",
] as const;

// Curated public heuristic catalog — no user data.
const KNOWN: Record<string, { category: (typeof CATEGORIES)[number]; typical_monthly: number }> = {
  netflix: { category: "Streaming", typical_monthly: 15.49 },
  "disney+": { category: "Streaming", typical_monthly: 10.99 },
  hulu: { category: "Streaming", typical_monthly: 9.99 },
  "hbo max": { category: "Streaming", typical_monthly: 15.99 },
  max: { category: "Streaming", typical_monthly: 15.99 },
  spotify: { category: "Music", typical_monthly: 11.99 },
  "apple music": { category: "Music", typical_monthly: 10.99 },
  "youtube premium": { category: "Streaming", typical_monthly: 13.99 },
  notion: { category: "Productivity", typical_monthly: 10 },
  "google one": { category: "Cloud storage", typical_monthly: 1.99 },
  icloud: { category: "Cloud storage", typical_monthly: 2.99 },
  dropbox: { category: "Cloud storage", typical_monthly: 11.99 },
  "chatgpt plus": { category: "AI tools", typical_monthly: 20 },
  claude: { category: "AI tools", typical_monthly: 20 },
  "github copilot": { category: "AI tools", typical_monthly: 10 },
  "adobe creative cloud": { category: "Productivity", typical_monthly: 59.99 },
  "1password": { category: "Productivity", typical_monthly: 2.99 },
  "peloton app": { category: "Fitness", typical_monthly: 12.99 },
  "apple fitness+": { category: "Fitness", typical_monthly: 9.99 },
  "nyt": { category: "News", typical_monthly: 17 },
  "the new york times": { category: "News", typical_monthly: 17 },
  "xbox game pass": { category: "Gaming", typical_monthly: 16.99 },
  "playstation plus": { category: "Gaming", typical_monthly: 10.99 },
};

export default defineTool({
  name: "categorize_subscription",
  title: "Categorize subscription",
  description:
    "Look up a well-known consumer subscription by name and return its typical category and typical monthly price. Uses a public heuristic catalog — no user or account data.",
  inputSchema: {
    name: z.string().min(1).describe("Subscription name, e.g. 'Netflix' or 'Spotify'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ name }) => {
    const key = name.trim().toLowerCase();
    const hit = KNOWN[key];
    if (hit) {
      return {
        content: [
          {
            type: "text",
            text: `${name}: ${hit.category}, typical ~$${hit.typical_monthly.toFixed(2)}/month.`,
          },
        ],
        structuredContent: { name, matched: true, ...hit },
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `No public catalog entry for "${name}". Category likely: Other. Ask the user for the amount and category.`,
        },
      ],
      structuredContent: { name, matched: false, category: "Other" as const },
    };
  },
});
