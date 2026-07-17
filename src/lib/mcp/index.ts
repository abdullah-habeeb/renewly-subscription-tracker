import { defineMcp } from "@lovable.dev/mcp-js";
import estimateSavings from "./tools/estimate-savings";
import categorizeSubscription from "./tools/categorize-subscription";
import daysUntilRenewal from "./tools/days-until-renewal";

export default defineMcp({
  name: "sublet-mcp",
  title: "Sublet — Subscription Tracker Tools",
  version: "0.1.0",
  instructions:
    "Public helper tools for reasoning about consumer subscriptions: categorize a well-known service, estimate monthly/yearly spend and possible savings, and compute days until a renewal with a reminder date. Tools operate only on data passed in the request — they do not read any user's account, bank, or email data.",
  tools: [categorizeSubscription, estimateSavings, daysUntilRenewal],
});
