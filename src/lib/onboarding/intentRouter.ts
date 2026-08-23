// ------------------------------------------------------------------
// Intent Router — UX Transformation, piece 4.
// ------------------------------------------------------------------
// Maps what a new customer types ("I need someone to call my leads")
// to a product mode.
//
// DELIBERATELY NOT AN LLM CALL. The mandate itself says to prefer
// deterministic routing where intent is obvious, and it's right: this
// runs once at signup, on short phrases, from a closed set of six
// outcomes. An LLM here would add latency and cost to the very first
// interaction, be non-reproducible when it misroutes, and fail exactly
// where keywords also fail — on genuinely ambiguous input. For that
// case we ask a question instead of guessing, which is both cheaper
// and more honest.
//
// The rule that matters: NEVER silently route someone into the wrong
// workflow. Low confidence returns needsClarification, not a guess.
// ------------------------------------------------------------------

export type ProductMode = "calling" | "marketing" | "automation" | "research" | "website" | "full";

export interface IntentResult {
  mode: ProductMode | null;
  /** True when we couldn't tell confidently — the UI must ask rather than proceed. */
  needsClarification: boolean;
  /** Runner-up modes, used to offer choices in the clarifying question. */
  candidates: ProductMode[];
  matchedOn: string[];
}

// Weighted so a strong signal beats an incidental mention. "Call" in
// "call my leads" should win over the passing "leads" that also
// appears in the marketing vocabulary.
const SIGNALS: Record<ProductMode, { strong: string[]; weak: string[] }> = {
  calling: {
    strong: ["call my", "calling", "cold call", "phone call", "call leads", "call customers", "call people", "leads called", "customers called", "voice agent", "ai caller", "receptionist", "answer calls", "answer the phone", "telecall", "telecalling"],
    // "called"/"calls" included explicitly: the word-boundary check
    // below won't match them from the stem "call", and "I need my
    // leads called" is a completely natural way to ask for this.
    weak: ["call", "called", "calls", "phone", "dial", "appointment", "follow up", "followup", "qualify"],
  },
  marketing: {
    strong: ["more customers", "more leads", "more sales", "grow my business", "marketing", "advertis", "campaign", "social media", "instagram", "facebook ads", "google ads", "content", "seo", "brand"],
    weak: ["promote", "reach", "audience", "post", "sales", "growth", "customers", "leads"],
  },
  automation: {
    strong: ["automate", "automation", "workflow", "on autopilot", "auto reply", "auto-reply", "repetitive", "do it automatically", "without me"],
    weak: ["automatic", "schedule", "recurring", "follow-up sequence"],
  },
  research: {
    strong: ["research", "competitor", "competition", "market analysis", "market research", "industry trend", "what are others doing", "benchmark"],
    weak: ["analyse", "analyze", "compare", "intelligence", "insights", "trends"],
  },
  website: {
    strong: ["website", "web site", "landing page", "online store", "storefront", "ecommerce", "e-commerce", "sell online", "shop online"],
    weak: ["site", "page", "store", "shop", "products", "catalog"],
  },
  // Never keyword-matched — it's the explicit "show me everything"
  // choice and the fallback for existing accounts, not something a
  // phrase resolves to.
  full: { strong: [], weak: [] },
};

const STRONG_WEIGHT = 3;
const WEAK_WEIGHT = 1;
/** Below this, we ask instead of guessing. One weak keyword is not intent. */
const MIN_CONFIDENT_SCORE = 3;

export function routeIntent(text: string): IntentResult {
  const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;

  const scores: { mode: ProductMode; score: number; matched: string[]; hasStrong: boolean }[] = [];

  for (const [mode, { strong, weak }] of Object.entries(SIGNALS) as [ProductMode, { strong: string[]; weak: string[] }][]) {
    let score = 0;
    let hasStrong = false;
    const matched: string[] = [];
    for (const phrase of strong) {
      if (normalized.includes(` ${phrase}`) || normalized.includes(`${phrase} `)) {
        score += STRONG_WEIGHT;
        hasStrong = true;
        matched.push(phrase);
      }
    }
    for (const phrase of weak) {
      // Word-boundary-ish check so "call" doesn't match inside
      // "recall" and "post" doesn't match inside "postpone".
      if (new RegExp(`\\b${phrase.replace(/[-]/g, "\\-")}\\b`).test(normalized)) {
        score += WEAK_WEIGHT;
        matched.push(phrase);
      }
    }
    if (score > 0) scores.push({ mode, score, matched, hasStrong });
  }

  if (scores.length === 0) {
    return { mode: null, needsClarification: true, candidates: [], matchedOn: [] };
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const runnerUp = scores[1];

  // Two plausible readings that score close together is the genuinely
  // ambiguous case — ask, don't coin-flip. But an explicit phrase
  // beating an incidental word is NOT ambiguous: "automate my whatsapp
  // follow up" is clearly automation even though "follow up" also
  // hints at calling. So a strong match outranks a weak-only rival
  // outright, and only rivals of the same kind need a real gap.
  const tooClose =
    runnerUp != null &&
    !(top.hasStrong && !runnerUp.hasStrong) &&
    top.score - runnerUp.score < STRONG_WEIGHT;

  if (top.score < MIN_CONFIDENT_SCORE || tooClose) {
    return {
      mode: null,
      needsClarification: true,
      candidates: scores.slice(0, 3).map((s) => s.mode),
      matchedOn: top.matched,
    };
  }

  return { mode: top.mode, needsClarification: false, candidates: [], matchedOn: top.matched };
}

// ---- Customer-facing copy -----------------------------------------
// No provider or internal naming anywhere, per the standing rule.

export const MODE_LABELS: Record<ProductMode, string> = {
  calling: "AI Calling",
  marketing: "Marketing & Growth",
  automation: "Automation",
  research: "Research & Intelligence",
  website: "Website & Store",
  full: "Everything",
};

export const MODE_DESCRIPTIONS: Record<ProductMode, string> = {
  calling: "Hawlai calls your leads and customers, qualifies them, and books appointments.",
  marketing: "Hawlai runs your content, ads, social, and campaigns to bring in more customers.",
  automation: "Hawlai handles repetitive work for you — follow-ups, replies, and routine tasks.",
  research: "Hawlai researches your market and competitors and tells you what matters.",
  website: "Hawlai builds and runs your website or online store.",
  full: "Everything Hawlai can do, all available from the start.",
};

/** The starting-point chips shown under the free-text box. Shortcuts, not the primary path. */
export const MODE_SUGGESTIONS: { mode: ProductMode; label: string }[] = [
  { mode: "calling", label: "I need my leads called" },
  { mode: "marketing", label: "I need more customers" },
  { mode: "automation", label: "I want to automate work" },
  { mode: "website", label: "I need a website or store" },
  { mode: "research", label: "I need market research" },
  { mode: "full", label: "I'm not sure yet" },
];

/** The first-value event each journey must reach before onboarding counts as done. */
export const ACTIVATION_EVENT: Record<ProductMode, string> = {
  calling: "first_test_call_completed",
  marketing: "first_business_analysis_generated",
  automation: "first_workflow_run",
  research: "first_research_report_generated",
  website: "first_website_draft_created",
  full: "first_ai_result_generated",
};
