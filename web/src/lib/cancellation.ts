/**
 * Per-merchant cancellation playbook. Static, curated knowledge — links and
 * steps verified against each service's real account flow (Indian variants
 * where they differ). Pure module so the lookup is unit-testable.
 */

export interface CancelGuide {
  /** Canonical merchant name for display. */
  merchant: string;
  /** Direct link to the merchant's cancel / manage-plan page. */
  url: string;
  /** Short, numbered account-flow steps. */
  steps: string[];
  /** Gotcha worth knowing before confirming (fees, app-store billing, …). */
  note?: string;
}

const GUIDES: Array<{ pattern: RegExp; guide: CancelGuide }> = [
  {
    pattern: /netflix/i,
    guide: {
      merchant: "Netflix",
      url: "https://www.netflix.com/cancelplan",
      steps: [
        "Sign in — the link opens the cancel page directly",
        'Hit "Finish cancellation"',
        "You keep access until the end of the billing period",
      ],
      note: "Paying through a Jio/Airtel bundle or an app store? Cancel it there instead — Netflix can't stop those charges.",
    },
  },
  {
    pattern: /spotify/i,
    guide: {
      merchant: "Spotify",
      url: "https://www.spotify.com/in-en/account/subscription/",
      steps: [
        "Sign in → Your plan",
        'Choose "Change plan"',
        'Scroll to Spotify Free → "Cancel Premium"',
      ],
    },
  },
  {
    pattern: /youtube/i,
    guide: {
      merchant: "YouTube Premium",
      url: "https://www.youtube.com/paid_memberships",
      steps: ["Sign in → Manage membership", 'Choose "Deactivate"', "Confirm"],
    },
  },
  {
    pattern: /google\s?(one|ai|gemini)/i,
    guide: {
      merchant: "Google One / Google AI",
      url: "https://one.google.com/settings",
      steps: [
        "Sign in → Settings → Membership",
        'Choose "Cancel membership"',
        "Your storage/AI features downgrade at the end of the cycle",
      ],
      note: "Subscribed on Android? Cancel in Play Store → your profile → Payments & subscriptions → Subscriptions.",
    },
  },
  {
    pattern: /amazon|prime/i,
    guide: {
      merchant: "Amazon Prime",
      url: "https://www.amazon.in/gp/primecentral",
      steps: [
        "Sign in → Manage membership",
        'Choose "End membership"',
        "Amazon may offer a partial refund if you haven't used benefits",
      ],
    },
  },
  {
    pattern: /hotstar|disney/i,
    guide: {
      merchant: "JioHotstar",
      url: "https://www.hotstar.com/in/my-account",
      steps: ["Sign in → My Account → Subscription", 'Choose "Cancel membership"', "Confirm to stop auto-renewal"],
    },
  },
  {
    pattern: /apple|icloud|itunes/i,
    guide: {
      merchant: "Apple",
      url: "https://apps.apple.com/account/subscriptions",
      steps: [
        "On iPhone: Settings → your name → Subscriptions",
        "Pick the subscription → Cancel",
        "Or use the link on any browser",
      ],
    },
  },
  {
    pattern: /adobe|photoshop|acrobat|creative\s?cloud/i,
    guide: {
      merchant: "Adobe",
      url: "https://account.adobe.com/plans",
      steps: ["Sign in → Plans → Manage plan", 'Choose "Cancel your plan"', "Follow the confirmation flow"],
      note: 'Adobe\'s "annual, billed monthly" plans charge an early-termination fee after the first 14 days — check what the flow quotes before confirming.',
    },
  },
  {
    pattern: /microsoft|office\s?365|m365/i,
    guide: {
      merchant: "Microsoft 365",
      url: "https://account.microsoft.com/services",
      steps: ["Sign in → Services & subscriptions", "Manage → Cancel subscription", "Or turn off recurring billing to let it lapse"],
    },
  },
  {
    pattern: /chatgpt|openai/i,
    guide: {
      merchant: "ChatGPT Plus",
      url: "https://chatgpt.com",
      steps: ["Sign in → profile menu → Settings", "Subscription → Manage", 'Choose "Cancel plan"'],
    },
  },
  {
    pattern: /zee5/i,
    guide: {
      merchant: "ZEE5",
      url: "https://www.zee5.com/myaccount",
      steps: ["Sign in → My Account → My Subscriptions", "Cancel auto-renewal on the active pack"],
    },
  },
  {
    pattern: /sony\s?liv/i,
    guide: {
      merchant: "SonyLIV",
      url: "https://www.sonyliv.com/my-account",
      steps: ["Sign in → My Account → Subscription", "Turn off auto-renew / cancel the active plan"],
    },
  },
  {
    pattern: /canva/i,
    guide: {
      merchant: "Canva",
      url: "https://www.canva.com/settings/billing-and-teams",
      steps: ["Sign in → Settings → Billing & plans", "Change plan → Cancel subscription"],
    },
  },
  {
    pattern: /linkedin/i,
    guide: {
      merchant: "LinkedIn Premium",
      url: "https://www.linkedin.com/mypreferences/d/manage-premium",
      steps: ["Sign in → Manage Premium account", "Cancel subscription → follow the prompts"],
    },
  },
];

export function findCancelGuide(subscriptionName: string): CancelGuide | null {
  const match = GUIDES.find(({ pattern }) => pattern.test(subscriptionName));
  return match ? match.guide : null;
}

/** Fallback for merchants we don't know: a well-formed search query. */
export function cancelSearchUrl(subscriptionName: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${subscriptionName} subscription`)}`;
}

/** Generic steps shown when no curated guide matches. */
export const GENERIC_STEPS = [
  "Open the service's website or app and go to Account / Billing settings",
  'Look for "Manage subscription" or "Auto-renewal" and switch it off',
  "Subscribed on mobile? Also check Play Store / App Store → Subscriptions",
];

/**
 * India-specific and easy to miss: cancelling the plan doesn't always revoke
 * the UPI Autopay mandate behind it. Shown with every guide.
 */
export const UPI_MANDATE_TIP =
  "If you approved a UPI Autopay mandate for this, also cancel the mandate in your UPI app (GPay / PhonePe / Paytm → Autopay → Mandates). Banks keep mandates active until you revoke them.";
