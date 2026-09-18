// A call the AI couldn't score leaves the lead as it was.
//
// THE BUG (2026-09-18): scoring fell back to score 30 / "cold" whenever the
// AI failed, and the Vapi webhook wrote that onto the lead. A caller who'd
// asked for 20 Diwali candles — already a hot lead — became cold because
// the AI was down, and a "cold" insight went into the business's memory.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let updates: { table: string; values: Row }[];
const notified: Row[] = [];
const insights: Row[] = [];

function db() {
  const from = (table: string) => {
    let op = "select";
    const api: any = {
      select: () => api, eq: () => api,
      update: (v: Row) => ((op = "update"), updates.push({ table, values: v }), api),
      insert: (_v: Row) => ((op = "insert"), api),
      maybeSingle: async () => ({ data: op === "select" ? (tables[table] ?? [])[0] ?? null : null, error: null }),
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async (_s: any, n: Row) => { notified.push(n); } }));
vi.mock("@/lib/businessMemory/outcomeInsights", () => ({ recordCallOutcomeInsight: async (_s: any, i: Row) => { insights.push(i); } }));
vi.mock("@/lib/usage/callingMinutes", () => ({ recordCallingMinutes: async () => {} }));

import { POST } from "@/app/api/webhooks/vapi/route";
import { scoreLeadFromCall } from "@/lib/agents/callScoringAgent";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const TRANSCRIPT = "AI: Namaste Asha ji. Asha: Haan, Diwali ke liye 20 lavender candles chahiye, kal call karo.";
const CREDITS = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };

function anthropic(reply: { status: number; body: any }) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(reply.body), { status: reply.status })));
}
const scored = (json: Row) => ({ status: 200, body: { content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 5, output_tokens: 5 } } });

function endOfCall(transcript = TRANSCRIPT) {
  return new Request("https://hawlai.test/api/webhooks/vapi", {
    method: "POST",
    body: JSON.stringify({ message: { type: "end-of-call-report", call: { id: "vapi-1", metadata: { leadId: "l1" } }, artifact: { transcript }, durationMs: 0, endedReason: "customer-ended-call" } }),
  });
}

const leadUpdates = () => updates.filter((u) => u.table === "leads").map((u) => u.values);
const callUpdates = () => updates.filter((u) => u.table === "calls").map((u) => u.values);

beforeEach(() => {
  tables = {
    calls: [{ id: "call-1", lead_id: "l1", dealership_id: "d1" }],
    leads: [{ id: "l1", name: "Asha", dealership_id: "d1" }],
    profiles: [],
  };
  updates = [];
  notified.length = 0;
  insights.length = 0;
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the AI couldn't score the call", () => {
  it("credits out: the lead's score and temperature are untouched, and the owner is asked to review", async () => {
    anthropic(CREDITS);
    await POST(endOfCall());

    expect(leadUpdates()).toEqual([{ status: "called" }]);
    expect(callUpdates().some((u) => "intent" in u)).toBe(false);
    expect(insights).toEqual([]);
    const review = notified.find((n) => n.kind === "call_needs_follow_up");
    expect(review).toMatchObject({ dealershipId: "d1", title: "Call with Asha couldn't be scored — please review it", href: "/dashboard/leads/l1" });
    expect(review!.body).toMatch(/temporarily unavailable on our side.*score was left as it was/);
  });

  it("an unreadable answer is treated the same way — never guessed cold", async () => {
    anthropic({ status: 200, body: { content: [{ type: "text", text: "This lead seems keen!" }], usage: {} } });
    await POST(endOfCall());
    expect(leadUpdates()).toEqual([{ status: "called" }]);
    expect(notified.find((n) => n.kind === "call_needs_follow_up")?.body).toMatch(/couldn't read this call automatically/);
  });

  it("an answer with no real temperature isn't defaulted to cold", async () => {
    anthropic(scored({ score: 80, temperature: "very keen", reason: "Wants 20 candles" }));
    expect(await scoreLeadFromCall(TRANSCRIPT, "Asha")).toMatchObject({ scored: false });
  });
});

describe("what still works as before", () => {
  it("a scored call is written onto the lead as before", async () => {
    anthropic(scored({ score: 88, temperature: "hot", reason: "Wants 20 lavender candles for Diwali, asked for a call tomorrow.", intent: "ready_to_book", sentiment: "positive", urgency: "high" }));
    await POST(endOfCall());
    expect(leadUpdates()).toEqual([{ ai_score: 88, lead_temperature: "hot", qualification_reason: "Wants 20 lavender candles for Diwali, asked for a call tomorrow.", status: "called" }]);
    expect(insights).toHaveLength(1);
    expect(notified.find((n) => n.kind === "call_needs_follow_up")?.title).toBe("Urgent follow-up needed: Asha");
  });

  it("a call with no conversation is genuinely cold — scored, not a failure", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await scoreLeadFromCall("", "Asha")).toMatchObject({ scored: true, temperature: "cold", intent: "no_real_conversation" });
    expect(spy).not.toHaveBeenCalled();
  });
});
