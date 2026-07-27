import { costOfClaudeCallInr, costOfVapiCallInr } from "./pricing";

// Single place every real usage log gets written from — keeps the
// cost-calculation logic in one spot rather than duplicated at every
// call site. Never throws: a logging failure should never break the
// actual feature that triggered it, so errors are swallowed (best-
// effort telemetry, not a critical path).

export async function logClaudeUsage(supabase: any, dealershipId: string, operation: string, inputTokens: number, outputTokens: number) {
  try {
    await supabase.from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "anthropic",
      operation,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costOfClaudeCallInr(inputTokens, outputTokens),
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
