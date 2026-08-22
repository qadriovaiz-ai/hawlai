import { costOfClaudeCallInr, costOfVapiCallInr, costOfGeminiImageInr, costOfVeoVideoInr, costOfElevenLabsInr, costOfPerplexityCallInr } from "./pricing";
import { CLAUDE_MODELS } from "../models";

// Single place every real usage log gets written from — keeps the
// cost-calculation logic in one spot rather than duplicated at every
// call site. Never throws: a logging failure should never break the
// actual feature that triggered it, so errors are swallowed (best-
// effort telemetry, not a critical path).

export async function logClaudeUsage(supabase: any, dealershipId: string, operation: string, inputTokens: number, outputTokens: number, model: string = CLAUDE_MODELS.standard) {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "anthropic",
      operation,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costOfClaudeCallInr(inputTokens, outputTokens, model),
    });
  } catch {
    // Best-effort — never let telemetry logging break the real feature.
  }
}

export async function logVapiUsage(supabase: any, dealershipId: string, operation: string, durationSeconds: number) {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "vapi",
      operation,
      duration_seconds: durationSeconds,
      cost_inr: costOfVapiCallInr(durationSeconds),
    });
  } catch {
    // Best-effort.
  }
}

export async function logGeminiImageUsage(supabase: any, dealershipId: string, operation: string, imageCount: number = 1) {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "gemini",
      operation,
      cost_inr: costOfGeminiImageInr(imageCount),
    });
  } catch {
    // Best-effort.
  }
}

export async function logVeoVideoUsage(supabase: any, dealershipId: string, operation: string, durationSeconds?: number) {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "gemini",
      operation,
      duration_seconds: durationSeconds ?? null,
      cost_inr: costOfVeoVideoInr(durationSeconds),
    });
  } catch {
    // Best-effort.
  }
}

export async function logElevenLabsUsage(supabase: any, dealershipId: string, operation: string, characterCount: number) {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "elevenlabs",
      operation,
      cost_inr: costOfElevenLabsInr(characterCount),
    });
  } catch {
    // Best-effort.
  }
}

// Used only for COMPLEX/DEEP research once PERPLEXITY_API_KEY is set
// (see researchRouter.ts) — 'perplexity' needs no schema change,
// api_usage_logs.service is plain text with no CHECK constraint.
export async function logPerplexityUsage(supabase: any, dealershipId: string, operation: string, inputTokens: number, outputTokens: number, model: "sonar-pro" | "sonar-deep-research" = "sonar-pro") {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "perplexity",
      operation,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costOfPerplexityCallInr(inputTokens, outputTokens, model),
    });
  } catch {
    // Best-effort.
  }
}
