// Model Router foundation — P2 15a.
//
// Centralizes what was previously ~50 independently duplicated
// model-string literals scattered across agent files into one shared
// source of truth. Pure refactor: every call site keeps using exactly
// the same model it used before this — nothing routes differently as
// a result of this change. [Authority: none — this changes which
// underlying model computes an answer, not what gets decided or done.]
//
// Deliberately does NOT add plan-tier-based routing beyond the
// existing Opus carve-out (deepStrategyAgent.ts, unchanged in
// behavior here) — that's a pricing/margin decision, explicitly out
// of scope per confirmation (2026-08-20). A future real router (task-
// complexity-based, tier-based) has exactly one place to change now
// instead of dozens.
export const CLAUDE_MODELS = {
  fast: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
  premium: "claude-opus-4-8",
} as const;

export type ModelTier = keyof typeof CLAUDE_MODELS;

export function getModel(tier: ModelTier): string {
  return CLAUDE_MODELS[tier];
}
