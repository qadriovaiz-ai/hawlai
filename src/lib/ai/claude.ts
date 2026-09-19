// Every call to Anthropic goes through here.
//
// WHY (approved 2026-09-18): 48 separate calls in 40 files each built their
// own request and, on any failure, returned a fallback — so the provider's
// reason was thrown away 48 times. When the API credits ran out, the
// Strategy advice said "Couldn't write the advice right now", and every
// other department failed the same unexplained way at once.
//
// One place now decides:
//  - what went wrong (classifyClaudeError) — credits and billing apart from
//    rate limits, overload, a bad key and a bad request;
//  - whether another try can help (never for credits, auth or a bad request);
//  - what the owner is told (aiFailureMessage) — honest that an outage is
//    on Hawlai's side, without billing details;
//  - that the operator hears about an outage from Hawlai (one in-app alert
//    to platform admins, not one per failed call);
//  - usage logging, which every call site used to do by hand.
//
// Modelled on lib/ads/metaRead.ts (classifyGraphError / GraphResult).

import { logClaudeUsage, logWebSearchUsage } from "@/lib/usage/logUsage";
import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { getModel } from "@/lib/models";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export type AiFailureKind = "credits" | "auth" | "rate_limited" | "overloaded" | "bad_request" | "network";

export type AiFailure = {
  kind: AiFailureKind;
  /** null when no response came back at all. */
  status: number | null;
  /** The provider's own words, for logs and the operator — never shown to a business owner. */
  message: string;
  /** Whether another attempt could succeed. */
  retryable: boolean;
};

export type ClaudeResult = { ok: true; data: any; text: string; /** Tokens plus web searches, in rupees. */ costInr: number } | { ok: false; failure: AiFailure };

// Anthropic reports an empty credit balance as HTTP 400
// (invalid_request_error, "Your credit balance is too low…"); newer API
// docs also list a dedicated billing_error (402). Both are caught.
const CREDITS_MESSAGE = /credit balance|billing|purchase credits|plans\s*&\s*billing|payment/i;

export function classifyClaudeError(status: number | null, body: any): AiFailure {
  const e = body?.error ?? {};
  const type = String(e.type ?? "");
  const message = String(e.message ?? (status === null ? "no response from Anthropic" : `HTTP ${status}`));
  const failure = (kind: AiFailureKind, retryable: boolean): AiFailure => ({ kind, status, message, retryable });

  if (status === null) return failure("network", true);
  if (status === 402 || type === "billing_error" || (status === 400 && CREDITS_MESSAGE.test(message))) return failure("credits", false);
  if (status === 401 || status === 403 || type === "authentication_error" || type === "permission_error") return failure("auth", false);
  if (status === 429 || type === "rate_limit_error") return failure("rate_limited", true);
  if (status === 529 || status >= 500 || type === "overloaded_error" || type === "api_error") return failure("overloaded", true);
  if (status === 408) return failure("network", true);
  return failure("bad_request", false);
}

/** What a business owner is told. Approved wording, 2026-09-18. */
export const AI_FAILURE_MESSAGE: Record<AiFailureKind, string> = {
  credits: "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.",
  auth: "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.",
  rate_limited: "The AI service is busy — try again in a minute.",
  overloaded: "The AI service is busy — try again in a minute.",
  network: "The AI service is busy — try again in a minute.",
  bad_request: "Something went wrong writing this — try again. If it keeps happening, let us know.",
};

export function aiFailureMessage(kind: AiFailureKind | null | undefined): string {
  return AI_FAILURE_MESSAGE[kind ?? "bad_request"] ?? AI_FAILURE_MESSAGE.bad_request;
}

/**
 * What a generator hands back with its fallback when the AI call failed,
 * so the page (or automation) can say why instead of showing a template.
 */
export type AiFailureNote = { kind: AiFailureKind; message: string };

export function aiFailureNote(failure: Pick<AiFailure, "kind">): AiFailureNote {
  return { kind: failure.kind, message: aiFailureMessage(failure.kind) };
}

/**
 * A generator's fallback, marked with why the AI failed. A placeholder
 * `output.text` / `output.message` is replaced with the approved words, so
 * no page shows a template as if it had been written for the business.
 */
export function withAiFailure<T extends Record<string, any>>(fallback: T, failure: Pick<AiFailure, "kind">): T & { _aiFailure: AiFailureNote } {
  const note = aiFailureNote(failure);
  const out = fallback.output;
  if (out && typeof out === "object" && !Array.isArray(out)) {
    const key = typeof out.text === "string" ? "text" : typeof out.message === "string" ? "message" : null;
    if (key) return { ...fallback, output: { ...out, [key]: note.message }, _aiFailure: note };
  }
  return { ...fallback, _aiFailure: note };
}

/**
 * The failure a result carries, if any — `_aiFailure` beside a
 * generator's fallback, or `aiFailure` where it's named without the
 * underscore (lead follow-ups, social captions, the monitors).
 */
export function aiFailureOf(result: unknown): AiFailureNote | null {
  const r = result as { _aiFailure?: AiFailureNote; aiFailure?: AiFailureNote } | null | undefined;
  if (!r || typeof r !== "object") return null;
  return r._aiFailure ?? r.aiFailure ?? null;
}

/** Short reason for Automation Health and the daily job list (approved 2026-09-18: "AI unavailable (credits)"). */
export const AI_FAILURE_LABEL: Record<AiFailureKind, string> = {
  credits: "AI unavailable (credits)",
  auth: "AI unavailable (API key rejected)",
  rate_limited: "AI unavailable (busy)",
  overloaded: "AI unavailable (busy)",
  network: "AI unavailable (no response)",
  bad_request: "AI request failed",
};

export function aiFailureLabel(kind: AiFailureKind): string {
  return AI_FAILURE_LABEL[kind] ?? AI_FAILURE_LABEL.bad_request;
}

/** Whether the AI is down for everyone until someone acts — the two kinds the operator is alerted about. */
export function isPlatformOutage(kind: AiFailureKind | null | undefined): boolean {
  return kind === "credits" || kind === "auth";
}

/** How long to wait before the one retry: the provider's retry-after, capped, else a second. */
export const DEFAULT_CLAUDE_RETRY_TIMING = { defaultMs: 1000, maxMs: 5000 } as const;
/** The waits actually used — zeroed in tests (tests/setup), which check the defaults above instead. */
export const claudeRetryTiming = { ...DEFAULT_CLAUDE_RETRY_TIMING } as { defaultMs: number; maxMs: number };

// ---- the operator alert -------------------------------------------------

const OPERATOR_ALERT: Record<"credits" | "auth", { title: string; body: string }> = {
  credits: {
    title: "Anthropic credit balance exhausted — AI features are down",
    body: "Every business's AI features (chat, content, email, strategy, automations) are failing until the Anthropic balance is topped up.",
  },
  auth: {
    title: "Anthropic rejected Hawlai's API key — AI features are down",
    body: "Every business's AI features are failing until ANTHROPIC_API_KEY is replaced with a working key.",
  },
};

/** Once per process per hour is plenty; the notification's dedupe key makes it once per hour overall. */
const ALERT_EVERY_MS = 60 * 60 * 1000;
const lastAlertAt: Partial<Record<"credits" | "auth", number>> = {};

/** Test hook. */
export function resetOperatorAlerts() {
  for (const k of Object.keys(lastAlertAt) as ("credits" | "auth")[]) delete lastAlertAt[k];
}

/**
 * Tells platform admins, in-app, that AI is down for everyone. Never
 * throws and never blocks the caller's own failure handling.
 */
export async function alertOperator(failure: AiFailure, now = Date.now()): Promise<boolean> {
  if (failure.kind !== "credits" && failure.kind !== "auth") return false;
  const kind = failure.kind;
  if (lastAlertAt[kind] && now - lastAlertAt[kind]! < ALERT_EVERY_MS) return false;
  lastAlertAt[kind] = now;
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { emitNotification } = await import("@/lib/notifications/emit");
    const service = createServiceClient();
    const { data: admins } = await service.from("profiles").select("dealership_id").eq("is_platform_admin", true);
    const dealershipIds = Array.from(new Set((admins ?? []).map((a: any) => a.dealership_id).filter(Boolean))) as string[];
    const hour = new Date(now).toISOString().slice(0, 13);
    const first = new Date(now).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    for (const dealershipId of dealershipIds) {
      await emitNotification(service, {
        dealershipId,
        kind: "platform_ai_unavailable",
        title: OPERATOR_ALERT[kind].title,
        body: `${OPERATOR_ALERT[kind].body} First seen ${first} IST. Anthropic said: ${failure.message.slice(0, 200)}`,
        href: "/dashboard",
        dedupeKey: `ai_unavailable:${kind}:${hour}`,
      });
    }
    return dealershipIds.length > 0;
  } catch (err: any) {
    console.error("[claude] couldn't alert the operator:", err?.message);
    return false;
  }
}

// ---- the call -----------------------------------------------------------

export type ClaudeCallOptions = {
  /** Names the call in usage logs and error lines, e.g. "content_generation". */
  operation: string;
  /** When given, usage is logged against this business. */
  logContext?: { supabase: any; dealershipId: string } | null;
  /** How many attempts in total, for failures another try can fix. Default 2. */
  attempts?: number;
};

async function readJson(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * One Messages API call. `body` is sent as-is (model, max_tokens, messages,
 * system, tools…); `model` defaults to the standard tier.
 */
export async function callClaude(body: Record<string, any>, opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const request = { model: getModel("standard"), ...body };
  const attempts = Math.max(1, opts.attempts ?? 2);
  let failure: AiFailure = { kind: "network", status: null, message: "not attempted", retryable: true };

  for (let attempt = 0; attempt < attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify(request),
      });
    } catch (err: any) {
      failure = classifyClaudeError(null, { error: { message: err?.message ?? "no response" } });
      if (attempt < attempts - 1) await wait(claudeRetryTiming.defaultMs);
      continue;
    }

    const data = await readJson(res);
    if (res.ok && data) {
      if (opts.logContext && data.usage) {
        await logClaudeUsage(opts.logContext.supabase, opts.logContext.dealershipId, opts.operation, data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0, request.model);
        await logWebSearchUsage(opts.logContext.supabase, opts.logContext.dealershipId, opts.operation, Number(data.usage.server_tool_use?.web_search_requests ?? 0));
      }
      const text = Array.isArray(data.content) ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") : "";
      return { ok: true, data, text, costInr: costOfClaudeResponseInr(data.usage, request.model) };
    }

    // A 200 with a body we can't read is a hiccup, not an answer.
    failure = res.ok ? { kind: "network", status: res.status, message: "unreadable response from Anthropic", retryable: true } : classifyClaudeError(res.status, data);
    if (!failure.retryable || attempt === attempts - 1) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    await wait(retryAfter > 0 ? Math.min(retryAfter * 1000, claudeRetryTiming.maxMs) : claudeRetryTiming.defaultMs);
  }

  console.error(`[claude] ${opts.operation} failed (${failure.kind}, ${failure.status ?? "no response"}): ${failure.message.slice(0, 300)}`);
  if (isPlatformOutage(failure.kind)) await alertOperator(failure);
  return { ok: false, failure };
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** The JSON object in a model reply, fences and surrounding prose allowed. Null when there isn't one. */
export function jsonFromText(text: string): any | null {
  const body = String(text ?? "").replace(/```json|```/g, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
