// Every Anthropic call goes through lib/ai/claude.ts — which decides what
// went wrong, whether retrying can help, what the owner is told, and that
// the operator hears about an outage.
//
// THE LIVE CASE (2026-09-18): the API credits ran out. The Strategy advice
// said "Couldn't write the advice right now", and every other department
// would have failed the same unexplained way — 48 call sites each threw
// the provider's reason away.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const emitted: any[] = [];
let emitFails = false;
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async (_s: any, n: any) => { if (emitFails) throw new Error("db down"); emitted.push(n); } }));
let admins: { dealership_id: string }[];
const profileFilters: any[] = [];
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const api: any = { select: () => api, eq: (col: string, val: any) => (profileFilters.push([table, col, val]), api), then: (res: any) => Promise.resolve({ data: admins, error: null }).then(res) };
      return api;
    },
  }),
}));

import {
  AI_FAILURE_MESSAGE,
  DEFAULT_CLAUDE_RETRY_TIMING,
  aiFailureMessage,
  callClaude,
  classifyClaudeError,
  isPlatformOutage,
  jsonFromText,
  resetOperatorAlerts,
} from "@/lib/ai/claude";

// What Anthropic actually sends for each failure.
const CREDITS_400 = { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } };
const BILLING_402 = { type: "error", error: { type: "billing_error", message: "There's an issue with your billing." } };
const RATE_429 = { type: "error", error: { type: "rate_limit_error", message: "Number of requests has exceeded your rate limit." } };
const OVERLOADED_529 = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
const AUTH_401 = { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } };
const BAD_400 = { type: "error", error: { type: "invalid_request_error", message: "messages: field required" } };
const OK = { content: [{ type: "text", text: "Hello" }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn" };

const reply = (status: number, body: any, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  emitted.length = 0;
  profileFilters.length = 0;
  emitFails = false;
  admins = [{ dealership_id: "admin-biz" }];
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("what went wrong", () => {
  it.each([
    ["credits, as Anthropic sends it (400 + message)", 400, CREDITS_400, "credits", false],
    ["billing_error (402)", 402, BILLING_402, "credits", false],
    ["rate limited", 429, RATE_429, "rate_limited", true],
    ["overloaded", 529, OVERLOADED_529, "overloaded", true],
    ["a provider error", 500, { type: "error", error: { type: "api_error", message: "Internal" } }, "overloaded", true],
    ["a bad key", 401, AUTH_401, "auth", false],
    ["a bad request (our bug)", 400, BAD_400, "bad_request", false],
    ["request too large", 413, { type: "error", error: { type: "request_too_large", message: "too big" } }, "bad_request", false],
  ])("%s", (_label, status, body, kind, retryable) => {
    expect(classifyClaudeError(status as number, body)).toMatchObject({ kind, retryable });
  });

  it("no response at all is a network failure worth one more try", () => {
    expect(classifyClaudeError(null, null)).toMatchObject({ kind: "network", retryable: true });
  });

  it("an ordinary bad request isn't mistaken for a credits problem", () => {
    expect(classifyClaudeError(400, BAD_400).kind).toBe("bad_request");
  });
});

describe("what the owner is told — approved wording", () => {
  it("credits and a bad key: on our side, the team has been alerted", () => {
    for (const kind of ["credits", "auth"] as const) {
      expect(aiFailureMessage(kind)).toBe("AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.");
      expect(isPlatformOutage(kind)).toBe(true);
    }
  });

  it("busy: try again in a minute; a bad request: tell us if it keeps happening", () => {
    expect(aiFailureMessage("rate_limited")).toBe("The AI service is busy — try again in a minute.");
    expect(aiFailureMessage("overloaded")).toBe(aiFailureMessage("rate_limited"));
    expect(aiFailureMessage("bad_request")).toMatch(/If it keeps happening, let us know/);
    expect(isPlatformOutage("overloaded")).toBe(false);
  });

  it("never mentions billing, credits or keys to a business owner", () => {
    for (const text of Object.values(AI_FAILURE_MESSAGE)) expect(text).not.toMatch(/credit|billing|balance|key|anthropic/i);
  });
});

describe("the call", () => {
  it("success: the reply text, and usage logged against the business", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { ...OK, content: [{ type: "tool_use", id: "t" }, { type: "text", text: "Hel" }, { type: "text", text: "lo" }] })));
    const rows: any[] = [];
    const supabase = { from: (table: string) => ({ insert: async (row: any) => { rows.push({ table, ...row }); return { error: null }; } }) };
    const r = await callClaude({ max_tokens: 100, messages: [{ role: "user", content: "hi" }] }, { operation: "test_op", logContext: { supabase, dealershipId: "d1" } });
    expect(r).toMatchObject({ ok: true, text: "Hello" });
    expect(rows).toEqual([expect.objectContaining({ table: "api_usage_logs", dealership_id: "d1", service: "anthropic", operation: "test_op", input_tokens: 10, output_tokens: 5, model: "claude-sonnet-4-6" })]);
  });

  it("sends the body as given, with the standard model unless one is named", async () => {
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: any, init: any) => (sent.push(JSON.parse(init.body)), reply(200, OK))));
    await callClaude({ max_tokens: 50, system: "sys", tools: [{ name: "t" }], messages: [] }, { operation: "x" });
    await callClaude({ model: "claude-haiku-4-5-20251001", max_tokens: 50, messages: [] }, { operation: "x" });
    expect(sent[0]).toMatchObject({ model: "claude-sonnet-4-6", system: "sys", tools: [{ name: "t" }] });
    expect(sent[1].model).toBe("claude-haiku-4-5-20251001");
  });

  it("credits exhausted: NOT retried, and the operator is alerted", async () => {
    const spy = vi.fn(async () => reply(400, CREDITS_400));
    vi.stubGlobal("fetch", spy);
    const r = await callClaude({ max_tokens: 10, messages: [] }, { operation: "strategy_channel_advice" });
    expect(r).toMatchObject({ ok: false, failure: { kind: "credits", status: 400 } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ dealershipId: "admin-biz", kind: "platform_ai_unavailable", title: expect.stringMatching(/credit balance exhausted/i) });
    expect(emitted[0].body).toMatch(/credit balance is too low/);
    expect(emitted[0].dedupeKey).toMatch(/^ai_unavailable:credits:\d{4}-\d{2}-\d{2}T\d{2}$/);
    expect(profileFilters).toEqual([["profiles", "is_platform_admin", true]]);
  });

  it("every platform admin's business hears it, once each", async () => {
    admins = [{ dealership_id: "a" }, { dealership_id: "b" }, { dealership_id: "a" }];
    vi.stubGlobal("fetch", vi.fn(async () => reply(402, BILLING_402)));
    await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" });
    expect(emitted.map((n) => n.dealershipId)).toEqual(["a", "b"]);
  });

  it("a hundred failed calls in an outage raise one alert, not a hundred", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(400, CREDITS_400)));
    for (let i = 0; i < 5; i++) await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" });
    expect(emitted).toHaveLength(1);
  });

  it("a rejected key alerts too, and isn't retried", async () => {
    const spy = vi.fn(async () => reply(401, AUTH_401));
    vi.stubGlobal("fetch", spy);
    const r = await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" });
    expect(r).toMatchObject({ ok: false, failure: { kind: "auth" } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(emitted[0].title).toMatch(/rejected Hawlai's API key/);
  });

  it("busy: one retry, which can succeed — and no operator alert", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? reply(429, RATE_429, { "retry-after": "2" }) : reply(200, OK))));
    const r = await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" });
    expect(r.ok).toBe(true);
    expect(n).toBe(2);
    expect(emitted).toHaveLength(0);
  });

  it("still busy after the retry: a busy failure, never more than two attempts by default", async () => {
    const spy = vi.fn(async () => reply(529, OVERLOADED_529));
    vi.stubGlobal("fetch", spy);
    expect(await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" })).toMatchObject({ ok: false, failure: { kind: "overloaded" } });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("a bad request isn't retried and doesn't page the operator", async () => {
    const spy = vi.fn(async () => reply(400, BAD_400));
    vi.stubGlobal("fetch", spy);
    expect(await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" })).toMatchObject({ ok: false, failure: { kind: "bad_request" } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(0);
  });

  it("no response, then a response: the retry saves it", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { if (++n === 1) throw new Error("socket hang up"); return reply(200, OK); }));
    expect((await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" })).ok).toBe(true);
  });

  it("an unreadable 200 is a hiccup, not an answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway</html>", { status: 200 })));
    expect(await callClaude({ max_tokens: 10, messages: [] }, { operation: "x", attempts: 1 })).toMatchObject({ ok: false, failure: { kind: "network" } });
  });

  it("an alert that can't be sent never breaks the caller", async () => {
    emitFails = true;
    vi.stubGlobal("fetch", vi.fn(async () => reply(400, CREDITS_400)));
    expect(await callClaude({ max_tokens: 10, messages: [] }, { operation: "x" })).toMatchObject({ ok: false, failure: { kind: "credits" } });
  });

  it("waits the provider's retry-after, capped, in production", () => {
    expect(DEFAULT_CLAUDE_RETRY_TIMING).toEqual({ defaultMs: 1000, maxMs: 5000 });
  });
});

describe("reading a reply", () => {
  it("finds the JSON object whether fenced, bare or inside prose", () => {
    expect(jsonFromText('{"a":1}')).toEqual({ a: 1 });
    expect(jsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(jsonFromText('Sure: {"a":1} done')).toEqual({ a: 1 });
    expect(jsonFromText("no json here")).toBeNull();
    expect(jsonFromText('{"a":')).toBeNull();
  });
});

describe("the operator alert can actually be stored", () => {
  it("migration 190 allows the new kind and keeps every existing one", () => {
    const sql = readFileSync("supabase/migrations/190_platform_ai_unavailable.sql", "utf8");
    const prev = readFileSync("supabase/migrations/182_email_delivery_status.sql", "utf8");
    const kinds = (text: string) => [...text.slice(text.indexOf("check (kind in")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(kinds(sql)).toEqual([...kinds(prev), "platform_ai_unavailable"]);
  });
});
