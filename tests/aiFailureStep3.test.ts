// Step 3 (2026-09-18): the reason reaches the page and Automation Health.
//
// Before: a failed generation came back as a 200 with a placeholder the
// page showed as the result (or a blank card — the shared hook had no
// error state at all), and every automation that couldn't reach the AI
// logged a "successful" run with nothing sent.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserts: { table: string; row: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (op === "insert" ? [{ id: `${table}-new`, ...values }] : (tables[table] ?? []).filter((r) => filters.every((f) => f(r))));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, not: () => api, in: () => api, or: () => api, neq: () => api, ilike: () => api,
      eq: (k: string, v: any) => (filters.push((r) => !(k in r) || r[k] === v), api),
      is: (k: string, v: any) => (filters.push((r) => (r[k] ?? null) === v), api),
      insert: (v: Row) => ((op = "insert"), (values = v), inserts.push({ table, row: v }), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      upsert: (v: Row) => ((op = "insert"), (values = v), inserts.push({ table, row: v }), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
const sent: Row[] = [];
vi.mock("@/lib/email/sendMarketingEmail", () => ({ sendMarketingEmail: async (_s: any, _d: string, msg: Row) => (sent.push(msg), { success: true, resendMessageId: "m1" }) }));

import { aiFailureResponse, aiFailedResponse } from "@/lib/ai/aiFailureResponse";
import { generateOutcome, GENERIC_ERROR } from "@/lib/hooks/useGeneratedOutput";
import { runAndLog, runError } from "@/lib/automation/runAndLog";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { POST as generateContentRoute } from "@/app/api/content-marketing/generate/route";
import { POST as blogPostRoute } from "@/app/api/seo/blog-post/route";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const OUTAGE = "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.";
const BUSY = "The AI service is busy — try again in a minute.";
const CREDITS = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };

function anthropic(...replies: { status: number; body: any }[]) {
  let n = 0;
  const spy = vi.fn(async () => {
    const r = replies[Math.min(n++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
const okJson = (json: any) => ({ status: 200, body: { content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 1, output_tokens: 1 } } });
const post = (body: any) => new Request("https://hawlai.test/api", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
  };
  inserts = [];
  sent.length = 0;
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("how a route says the AI failed", () => {
  it("an outage or a busy AI: 503 with the approved words; our own bad request: 502", async () => {
    const outage = aiFailureResponse({ kind: "credits", message: OUTAGE });
    expect(outage.status).toBe(503);
    expect(await outage.json()).toEqual({ error: OUTAGE, aiFailure: "credits" });
    expect(aiFailureResponse({ kind: "rate_limited", message: BUSY }).status).toBe(503);
    expect(aiFailureResponse({ kind: "bad_request", message: "x" }).status).toBe(502);
  });

  it("reads either field name, and stays out of the way when nothing failed", async () => {
    expect((await aiFailedResponse({ _aiFailure: { kind: "credits", message: OUTAGE } })!.json()).error).toBe(OUTAGE);
    expect((await aiFailedResponse({ aiFailure: { kind: "auth", message: OUTAGE } })!.json()).aiFailure).toBe("auth");
    expect(aiFailedResponse({ output: { text: "real copy" } })).toBeNull();
    expect(aiFailedResponse(null)).toBeNull();
  });
});

describe("the shared page hook never shows a failure as a result", () => {
  it("a failed response: its own reason, no result", () => {
    expect(generateOutcome(false, { error: OUTAGE, aiFailure: "credits" })).toEqual({ output: null, id: null, error: OUTAGE });
    // e.g. a plan limit — refusals that used to render as a blank card
    expect(generateOutcome(false, { error: "You've used all 20 generations this month." }).error).toBe("You've used all 20 generations this month.");
  });

  it("a failed response that still carries a placeholder: the placeholder is never shown", () => {
    expect(generateOutcome(false, { output: { text: "Draft instagram post for candle_by_qaaf…" }, error: OUTAGE })).toEqual({ output: null, id: null, error: OUTAGE });
  });

  it("no reason given, or no result at all: the approved 'something went wrong'", () => {
    expect(generateOutcome(false, {}).error).toBe(GENERIC_ERROR);
    expect(generateOutcome(true, { output: null }).error).toBe(GENERIC_ERROR);
    expect(GENERIC_ERROR).toBe("Something went wrong writing this — try again. If it keeps happening, let us know.");
  });

  it("a real result is shown as before", () => {
    expect(generateOutcome(true, { output: { text: "Diwali pe…" }, id: "c1" })).toEqual({ output: { text: "Diwali pe…" }, id: "c1", error: null });
  });
});

describe("routes, end to end", () => {
  it("Content Marketing, credits out: 503 with the reason, and nothing saved to history", async () => {
    anthropic(CREDITS);
    const res = await generateContentRoute(post({ contentType: "instagram_post", topic: "Diwali" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: OUTAGE, aiFailure: "credits" });
    expect(inserts.filter((i) => i.table === "content_pieces")).toEqual([]);
  });

  it("Content Marketing, working: saved and returned as before", async () => {
    anthropic(okJson({ text: "Diwali pe ghar ko roshan karo" }));
    const res = await generateContentRoute(post({ contentType: "instagram_post", topic: "Diwali" }));
    expect(res.status).toBe(200);
    expect((await res.json()).output.text).toBe("Diwali pe ghar ko roshan karo");
    expect(inserts.filter((i) => i.table === "content_pieces")).toHaveLength(1);
  });

  it("a blog post, credits out: the reason — never the generic 'buyer's guide' template", async () => {
    anthropic(CREDITS);
    const res = await blogPostRoute(post({ topic: "soy candles" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(OUTAGE);
    expect(JSON.stringify(body)).not.toMatch(/Buyer's Guide/);
  });
});

describe("Automation Health: a run the AI couldn't do is a failed run, with the reason", () => {
  it("runAndLog records it as failed — 'AI unavailable (credits)' — and hands the reason to the daily job list", async () => {
    const d = db();
    const result: any = await runAndLog(d, "d1", "topic_alerts", async () => ({ newAlerts: 0, aiFailure: { kind: "credits", message: OUTAGE } }));
    expect(result.error).toBe("AI unavailable (credits)");
    const log = inserts.find((i) => i.table === "automation_run_log")!.row;
    expect(log.success).toBe(false);
    expect(runError(log.detail)).toBe("AI unavailable (credits)");
  });

  it("the labels for each kind", async () => {
    for (const [kind, label] of [["auth", "AI unavailable (API key rejected)"], ["rate_limited", "AI unavailable (busy)"], ["network", "AI unavailable (no response)"], ["bad_request", "AI request failed"]] as const) {
      const r: any = await runAndLog(db(), "d1", "x", async () => ({ _aiFailure: { kind, message: "m" } }));
      expect(r.error).toBe(label);
    }
  });

  it("an ordinary run is still a success, and an error the run gave itself is kept", async () => {
    expect(await runAndLog(db(), "d1", "topic_alerts", async () => ({ newAlerts: 2 }))).toEqual({ newAlerts: 2 });
    expect(inserts.at(-1)!.row.success).toBe(true);
    const r: any = await runAndLog(db(), "d1", "x", async () => ({ error: "unsubscribe list unreadable", aiFailure: { kind: "credits", message: OUTAGE } }));
    expect(r.error).toBe("unsubscribe list unreadable");
  });

  it("the card's reason is read from the stored detail — JSON, cut-off JSON, or a thrown message", () => {
    expect(runError('{"error":"AI unavailable (credits)","newAlerts":0}')).toBe("AI unavailable (credits)");
    expect(runError('{"error":"AI unavailable (busy)","stepsSent":0,"skipped":"lo')).toBe("AI unavailable (busy)");
    expect(runError("Couldn't read the lead list")).toBe("Couldn't read the lead list");
    expect(runError('{"newAlerts":0}')).toBeNull();
    expect(runError(null)).toBeNull();
  });

  it("welcome emails, credits out: nothing sent, the run stops at the first lead, and says why", async () => {
    tables.dealerships[0] = { ...tables.dealerships[0], welcome_email_auto_enabled: true, follow_up_email_auto_enabled: false };
    tables.leads = [
      { id: "l1", name: "Asha", email: "asha@example.com", welcome_email_sent_at: null },
      { id: "l2", name: "Ravi", email: "ravi@example.com", welcome_email_sent_at: null },
    ];
    const spy = anthropic(CREDITS);
    const result: any = await runAndLog(db(), "d1", "email_automation", () => runEmailAutomation(db(), "d1"));
    expect(sent).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ error: "AI unavailable (credits)", welcomesSent: 0, aiFailure: { kind: "credits" } });
  });
});
