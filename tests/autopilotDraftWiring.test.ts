
// THE WIRING OF THE UNATTENDED DRAFTING LOOP.
//
// Its own file because vi.mock is hoisted to the top of whichever file
// it appears in: mocking contentAgent beside the real sender tests
// replaced the thing those tests were testing, and seven of them went
// red at once.
//
// A mutation that made autopilotAgent pass `null` facts again left
// every sender test green, because those test the GENERATOR and the bug
// lived in the CALLER - the manual route passed the facts and this loop
// passed `undefined`, for every due lead. So the real autopilot runs
// here with the generator mocked, which is the only way to see what it
// hands over.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/claims/businessFacts", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, gatherBusinessFactsSafely: vi.fn(async () => ({ __sentinel: "the records" })) };
});

const followUp = vi.fn(async () => ({ message: "Hi Ravi, soy wax, 40 hour burn. 550." }));
vi.mock("@/lib/agents/contentAgent", () => ({ generateFollowUpMessage: (...a: any[]) => followUp(...(a as [])) }));
vi.mock("@/lib/businessMemory/getLeadMemory", () => ({ getLeadMemory: vi.fn(async () => []) }));

import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";

/** A supabase stub that has one stale lead and nothing else. */
function db() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const rows: Record<string, any[]> = {
    // TWO stale leads, not one, and that is deliberate: with a single
    // lead "the records are read once per run" and "once per lead" are
    // the same number, and a mutation that moved the read inside the
    // loop passed the test.
    leads: [
      { id: "l1", name: "Ravi", interest: "lavender candle", details: null, budget: null, lead_temperature: "warm", status: "new", qualification_reason: null, draft_followup_generated_at: null, created_at: threeDaysAgo },
      { id: "l2", name: "Sunita", interest: "rose candle", details: null, budget: null, lead_temperature: "warm", status: "new", qualification_reason: null, draft_followup_generated_at: null, created_at: threeDaysAgo },
    ],
    dealerships: [{ id: "d1", business_category: "Home fragrance", dealership_name: "Candle by Qaaf" }],
    brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: [], preferred_language: "hinglish" }],
  };
  const from = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, in: () => api, lt: () => api, gte: () => api, order: () => api,
      limit: () => api, not: () => api, is: () => api, ilike: () => api, neq: () => api,
      update: () => api, insert: () => api, upsert: () => api, delete: () => api,
      single: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

describe("the autopilot drafting loop hands over the records", () => {
  beforeEach(() => {
    followUp.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("IT PASSES THE RECORDS, NOT undefined", async () => {
    // The bug: this loop passed `undefined` where the manual route
    // passed the facts, so the draft was written from nothing
    // checkable.
    await runDailyAutopilot(db() as any, "d1");
    expect(followUp).toHaveBeenCalled();
    const args = followUp.mock.calls[0] as any[];
    expect(args[6]).toEqual({ __sentinel: "the records" });
  });

  it("AND IT ASKS FOR NO RETRIES — single-shot, like every unattended path", async () => {
    await runDailyAutopilot(db() as any, "d1");
    const args = followUp.mock.calls[0] as any[];
    expect(args[7]).toBe(false);
  });

  it("it also passes the business category it never used to", async () => {
    await runDailyAutopilot(db() as any, "d1");
    const args = followUp.mock.calls[0] as any[];
    expect(args[3]).toBe("Home fragrance");
  });

  it("THE RECORDS ARE READ ONCE, NOT PER LEAD", async () => {
    // Cost, and the reason it is gathered before the loop.
    const { gatherBusinessFactsSafely } = await import("@/lib/claims/businessFacts");
    (gatherBusinessFactsSafely as any).mockClear();
    await runDailyAutopilot(db() as any, "d1");
    // Two leads, one read.
    expect(followUp.mock.calls.length).toBe(2);
    expect((gatherBusinessFactsSafely as any).mock.calls.length).toBe(1);
  });
});
