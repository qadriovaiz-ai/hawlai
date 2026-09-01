// ------------------------------------------------------------------
// AI Task Router — Usage/Pricing/Cost-Control spec, Section 9-10.
// ------------------------------------------------------------------
// VERIFIED before building: models.ts (P2 15a) already has the model
// TIERING this spec asks for — fast/standard/premium mapping to
// Haiku/Sonnet/Opus. What it does NOT have is a CLASSIFIER: nothing
// maps a kind of task to a tier by name. Every one of the 3 existing
// "fast" call sites (callScoringAgent, socialManagementAgent's
// auto-reply, whatsappMarketingAgent) already carries a hand-written
// comment independently re-deriving the same reasoning ("this is
// high-frequency and simple, so Haiku is enough") — this file
// formalizes that already-existing, already-correct reasoning into
// one named, reusable place instead of leaving it duplicated as prose
// comments at each call site. This EXTENDS models.ts — it doesn't
// duplicate it; modelForComplexity() is a thin lookup on top of the
// same CLAUDE_MODELS/getModel() this app already uses everywhere.
//
// SIMPLE/NORMAL/COMPLEX/CRITICAL classify by known task IDENTITY, not
// by a live classification call on freeform text. Virtually every
// call site in this app already knows exactly what task it's doing —
// Master Chat picks which tool to call, department pages call a named
// agent function — so there's no arbitrary user message to classify
// at runtime. Running a separate LLM call just to classify a request
// would itself be the "blindly use an expensive model for every task"
// problem this router exists to avoid.
//
// Tier mapping is deliberately NOT 1:1 with the 4 complexity levels —
// COMPLEX and CRITICAL don't get distinct tiers by accident:
//   COMPLEX  -> standard (Sonnet) — matches what every existing
//               standard-tier call site already uses for this kind of
//               task (a strategy doc, a content plan). Wiring this
//               router in changes NOTHING about their current model.
//   CRITICAL -> premium (Opus) — matches the ONE carve-out that
//               already existed before this router
//               (deepStrategyAgent.ts's full-business-analysis calls,
//               gated by plan opusAccess). This formalizes that
//               existing decision rather than introducing a new one.
//
// NOT done here, on purpose: deepStrategyAgent.ts and the other 4
// premium-tier call sites (brandBuildingAgent, growthAdvisorV2,
// threeDAgent, websiteBuilderAgent) gate Opus by PLAN (opusAccess),
// not by task complexity — a separate, already-decided axis. Per the
// standing decision (P2, reaffirmed at P3 kickoff): no plan-tier
// model routing beyond that existing Opus carve-out. This router
// doesn't touch or override it. A full mass-rewire of the ~50 other
// existing getModel() call sites, and wiring live per-message
// classification into Master Chat's own reasoning loop (which today
// always uses "standard" regardless of what was asked — the actual
// highest-value future application of this router) are both
// explicitly NOT done in this pass — flagged as follow-up, not
// silently skipped.

import { getModel, type ModelTier } from "./models";

export type TaskComplexity = "simple" | "normal" | "complex" | "critical";

const COMPLEXITY_TIER: Record<TaskComplexity, ModelTier> = {
  simple: "fast",
  normal: "standard",
  complex: "standard",
  critical: "premium",
};

export function modelForComplexity(complexity: TaskComplexity): string {
  return getModel(COMPLEXITY_TIER[complexity]);
}

// Known task identities -> complexity. Extend this list as new task
// types get wired in; unknown keys fall back to "normal" (Sonnet) —
// never silently downgraded to a cheap model that might undershoot
// quality on a task nobody's classified yet.
export const TASK_COMPLEXITY: Record<string, TaskComplexity> = {
  // SIMPLE — short, single-purpose copy. Matches today's 3 real
  // "fast" tier call sites, keyed by their ACTUAL task identities
  // (verified against each file, not guessed) so wiring below is a
  // genuine zero-behavior-change lookup, not a silent regression.
  call_scoring: "simple", // callScoringAgent.ts's scoreLeadFromCall
  dm_auto_reply: "simple", // socialManagementAgent.ts's generateAutoReply("dm", ...)
  comment_auto_reply: "simple", // generateAutoReply("comment", ...)
  // whatsappMarketingAgent.ts's WHATSAPP_TASKS — all 7 real keys,
  // uniformly "fast" today (a single flat model choice regardless of
  // task), so all map to simple.
  broadcast: "simple",
  chatbot_flow: "simple",
  follow_up: "simple",
  order_update: "simple",
  promotion: "simple",
  cart_recovery: "simple",
  lead_nurturing: "simple",

  // NORMAL — a structured piece of content or a plan, Sonnet-class.
  content_generation: "normal",
  content_calendar: "normal",
  seo_ideas: "normal",
  email_campaign: "normal",
  ad_plan: "normal",
  social_post: "normal",

  // Structured extraction from the owner's own description of their
  // business — businessIntelligenceAgent.ts, used by onboarding and by
  // Settings -> Brand's analyzer.
  //
  // Deliberately "normal" and NOT "simple", even though extraction is
  // the kind of task a cheap model often handles. This runs once and
  // its output — the Brand Voice Profile — is then reused by every
  // downstream agent, forever, to write in the customer's voice.
  // Saving a fraction of a rupee on the one call that defines how the
  // product sounds for that business would be false economy. This also
  // matches what the agent already used (getModel("standard")), so
  // registering it here changes no behavior.
  business_intelligence: "normal",

  // COMPLEX — real strategic reasoning across a topic, still
  // Sonnet-class per the mapping above (unchanged from today).
  marketing_strategy: "complex",
  competitor_intel: "complex",
  growth_advisor: "complex",

  // CRITICAL — whole-business analysis. Matches the existing Opus
  // carve-out (deepStrategyAgent.ts) — not a new decision.
  full_business_analysis: "critical",
  deep_strategy: "critical",
};

export function classifyTask(taskKey: string): TaskComplexity {
  return TASK_COMPLEXITY[taskKey] ?? "normal";
}

/** Convenience: resolve a known task identity straight to a model string. */
export function modelForTask(taskKey: string): string {
  return modelForComplexity(classifyTask(taskKey));
}
