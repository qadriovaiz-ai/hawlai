// Server-side telemetry, and marked so it stays that way: this module
// writes billing rows through the service role, and a client component
// that reached it would now fail the build rather than the page.
import "server-only";
import { createServiceClient } from "../supabase/service";
import { costOfClaudeCallInr, costOfWebSearchesInr, costOfVapiCallInr, costOfGeminiImageInr, costOfVeoVideoInr, costOfElevenLabsInr, costOfPerplexityCallInr } from "./pricing";
import { CLAUDE_MODELS } from "../models";

// Single place every real usage log gets written from — keeps the
// cost-calculation logic in one spot rather than duplicated at every
// call site. Never throws: a logging failure should never break the
// actual feature that triggered it.
//
// ─────────────────────────────────────────────────────────────────────
// THE BUG THIS FIXES (found 2026-09-27, ran unnoticed for 90 days).
//
// api_usage_logs had RLS enabled and exactly ONE policy — a SELECT
// policy. No INSERT policy existed anywhere in 201 migrations. So every
// insert made with a session-bound client (anon key + user cookie) was
// rejected by Postgres, and the catch below swallowed it without a word.
//
// The result: a 90-day log holding ten operations and ~₹343 — all of it
// cron and background work, which runs on a service-role client and so
// bypassed RLS. Every user-initiated action — the AI Employee chat,
// content generation, captions, ad copy, research, images — wrote
// nothing at all. The product's entire cost history was missing, and a
// pricing decision was about to be made on top of it.
//
// THE FIX, and why it is not an INSERT policy. api_usage_logs is
// billing data. A policy letting `authenticated` insert would let
// anyone holding the public anon key — which ships to every browser —
// write arbitrary cost rows against their own business. Usage records
// must be writable by the server only, so RLS stays read-only and these
// functions do their own writing through the service role.
//
// The caller's client is kept as a fallback for environments with no
// service credentials (tests inject a fake and assert on it).
//
// dealershipId is ALWAYS supplied by the server: every call path
// derives it from the authenticated session (profiles.dealership_id, or
// dealerships.owner_id keyed on auth.uid()) or from trusted server
// context (a cron run, or a provider webhook's own lookup). It is never
// read from a request body, a query string, or anything else a client
// can set — see tests/usageLogging.test.ts, which pins that.
// ─────────────────────────────────────────────────────────────────────

/**
 * The client usage rows are written with.
 *
 * Service role when credentials exist, so RLS cannot reject the write;
 * otherwise whatever the caller passed, which is what keeps the tests
 * (and any environment without a service key) working.
 */
function usageClient(passed: any): any {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return passed;
  try {
    return createServiceClient();
  } catch {
    // No service credentials here (tests, local without env) — the
    // caller's client is the honest fallback, not a failure.
    return passed;
  }
}

/**
 * Why a usage row could not be written.
 *
 * Said out loud, every time. The previous silence is the only reason a
 * completely broken cost log survived three months — a single line in
 * the Vercel log would have caught it on day one.
 */
function logFailed(what: string, err: unknown): void {
  console.error(`[usage] ${what} log failed:`, (err as any)?.message ?? err);
}

export async function logClaudeUsage(
  supabase: any,
  dealershipId: string,
  operation: string,
  inputTokens: number,
  outputTokens: number,
  model: string = CLAUDE_MODELS.standard,
  /** What prompt caching did on this call — written at 1.25x input, read at 0.1x. */
  cache: { creationTokens?: number; readTokens?: number } = {}
) {
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "anthropic",
      operation,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cache.creationTokens ?? null,
      cache_read_input_tokens: cache.readTokens ?? null,
      cost_inr: costOfClaudeCallInr(inputTokens, outputTokens, model, cache),
    });
  } catch (err) {
    logFailed("claude", err);
  }
}

/** Web searches a Claude call ran — a separate row, so the log matches the Anthropic bill. */
export async function logWebSearchUsage(supabase: any, dealershipId: string, operation: string, searches: number) {
  if (!(searches > 0)) return;
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "anthropic",
      operation: `${operation}:web_search`,
      model: "web_search",
      input_tokens: 0,
      output_tokens: 0,
      cost_inr: costOfWebSearchesInr(searches),
    });
  } catch (err) {
    logFailed("web search", err);
  }
}

export async function logVapiUsage(supabase: any, dealershipId: string, operation: string, durationSeconds: number) {
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "vapi",
      operation,
      duration_seconds: durationSeconds,
      cost_inr: costOfVapiCallInr(durationSeconds),
    });
  } catch (err) {
    logFailed("vapi", err);
  }
}

export async function logGeminiImageUsage(supabase: any, dealershipId: string, operation: string, imageCount: number = 1) {
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "gemini",
      operation,
      cost_inr: costOfGeminiImageInr(imageCount),
    });
  } catch (err) {
    logFailed("gemini image", err);
  }
}

export async function logVeoVideoUsage(supabase: any, dealershipId: string, operation: string, durationSeconds?: number) {
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "gemini",
      operation,
      duration_seconds: durationSeconds ?? null,
      cost_inr: costOfVeoVideoInr(durationSeconds),
    });
  } catch (err) {
    logFailed("veo video", err);
  }
}

export async function logElevenLabsUsage(supabase: any, dealershipId: string, operation: string, characterCount: number) {
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "elevenlabs",
      operation,
      cost_inr: costOfElevenLabsInr(characterCount),
    });
  } catch (err) {
    logFailed("elevenlabs", err);
  }
}

// Used only for COMPLEX/DEEP research once PERPLEXITY_API_KEY is set
// (see researchRouter.ts) — 'perplexity' needs no schema change,
// api_usage_logs.service is plain text with no CHECK constraint.
export async function logPerplexityUsage(supabase: any, dealershipId: string, operation: string, inputTokens: number, outputTokens: number, model: "sonar-pro" | "sonar-deep-research" = "sonar-pro") {
  try {
    await usageClient(supabase).from("api_usage_logs").insert({
      dealership_id: dealershipId,
      service: "perplexity",
      operation,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costOfPerplexityCallInr(inputTokens, outputTokens, model),
    });
  } catch (err) {
    logFailed("perplexity", err);
  }
}
