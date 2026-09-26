// Strategy reads what the other departments noticed (Brain, Phase 0b).
//
// The signal store landed with two producers and no consumer. This is
// the consumer: channelAdvice, which already takes the measured
// diagnosis under exactly the right discipline — the model interprets,
// the code measures, and every figure quoted is checked afterwards.
//
// THE INTERACTION THAT HAD TO BE HANDLED: that check throws away any
// number not in the diagnosis. Hand the model signals without widening
// the allowed set and every line citing one is silently deleted — the
// feature would look wired up and quietly do nothing. So the first test
// below is the one that matters.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

import { verifyAdvice, signalNumbers, generateChannelAdvice } from "@/lib/strategy/channelAdvice";
import type { Diagnosis } from "@/lib/strategy/diagnosis";
import type { StoredSignal } from "@/lib/signals/signals";

const NOW = "2026-09-26T10:00:00Z";

/** Candle by Qaaf's real shape: too thin for the funnel to say much. */
function thin(): Diagnosis {
  return {
    window: { days: 90, from: "2026-06-28", to: "2026-09-26", label: "the last 90 days" },
    models: ["products", "services"],
    funnels: [{ name: "Store", steps: [{ key: "views", label: "Visits", count: 28, fromPrevious: null }, { key: "leads", label: "Enquiries", count: 5, fromPrevious: null }], weakest: null, thin: "Too few visits to judge." }],
    sources: [],
    atRisk: { count: 0, total: 0, days: 60 },
    paid: [],
    gaps: ["Too few visits to judge where people drop off."],
  } as unknown as Diagnosis;
}

const signal = (over: Partial<StoredSignal> = {}): StoredSignal => ({
  id: "s1",
  source: "competitor_monitor",
  topic: "Aroma Co",
  summary: "Aroma Co started same-day delivery in Shahjahanpur",
  evidence: { competitor: "Aroma Co", competitorsOffering: 3 },
  confidence: "observed",
  sourceUrl: "https://aromaco.in/news",
  observedAt: NOW,
  lastSeenAt: NOW,
  ...over,
});

describe("the number check widens to cover the signals", () => {
  it("THE INTERACTION: advice citing a signal's figure survives, where before it was silently deleted", () => {
    // A figure the checker really does police — it polices rupee
    // amounts, percentages and counts of leads/visits/orders and the
    // like, so this is where the widening actually bites.
    const signals = [
      signal({
        source: "content_results",
        topic: "workshop post",
        summary: "The workshop post brought 2 leads from 40 visits",
        evidence: { visits: 40, leads: 2 },
        confidence: "counted",
        sourceUrl: null,
      }),
    ];
    const advice = {
      summary: "The workshop post brought 2 leads.",
      recommendations: [{ title: "Do more of the workshop post", action: "Write two more in the same shape.", evidence: "2 leads from 40 visits on the workshop post" }],
      dataGaps: [],
    };

    // Without the signals, "3" is not a diagnosis number and the whole
    // recommendation goes — this is the bug the widening prevents.
    const blind = verifyAdvice(advice, thin());
    expect(blind.recommendations).toHaveLength(0);
    expect(blind.removed.join(" ")).toContain("2 leads");

    const seeing = verifyAdvice(advice, thin(), signals);
    expect(seeing.recommendations).toHaveLength(1);
    expect(seeing.removed).toEqual([]);
    expect(seeing.summary).toContain("2 leads");
  });

  it("a number in no signal and no diagnosis is still thrown away", () => {
    const v = verifyAdvice(
      {
        summary: "",
        recommendations: [{ title: "Run ads", action: "Spend ₹8,000 a month on Meta.", evidence: "industry benchmark" }],
        dataGaps: [],
      },
      thin(),
      [signal()]
    );
    expect(v.recommendations).toHaveLength(0);
    expect(v.removed.join(" ")).toContain("8,000");
  });

  it("figures are taken from the summary and the evidence, not from a URL", () => {
    const nums = signalNumbers([signal({ summary: "Prices rose 8% last quarter", evidence: { pct: 8, items: [{ count: 12 }] }, sourceUrl: "https://x.in/v23/9999" })]);
    expect(nums.has("8")).toBe(true);
    expect(nums.has("12")).toBe(true);
    // A version number in a link is not a claim about anything.
    expect(nums.has("9999")).toBe(false);
  });

  it("no signals: the rule is exactly what it was", () => {
    expect(signalNumbers([])).toEqual(new Set());
    const v = verifyAdvice({ summary: "28 visits in 90 days.", recommendations: [], dataGaps: [] }, thin());
    expect(v.summary).toContain("28 visits");
  });
});

// ---- the prompt ------------------------------------------------------------
let prompts: string[];

function anthropic(reply: object) {
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    prompts.push(String(body.messages[0].content));
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply).slice(1) }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }),
      { status: 200 }
    );
  }));
}

const REPLY = { summary: "Competitors are moving on delivery.", recommendations: [{ title: "Say your dispatch time", action: "Add it to the product page.", evidence: "Aroma Co started same-day delivery" }], dataGaps: [] };

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("what the strategist is shown", () => {
  it("signals are in the prompt, each with where it came from and how solid it is", async () => {
    anthropic(REPLY);
    const r = await generateChannelAdvice(thin(), null, undefined, [signal(), signal({ id: "s2", source: "positioning", summary: "Nobody local claims same-day", confidence: "inferred", evidence: {} })]);

    expect(r.ok).toBe(true);
    expect(prompts[0]).toContain("What the other departments have noticed");
    expect(prompts[0]).toContain("Aroma Co started same-day delivery");
    expect(prompts[0]).toContain("quoted from a public page or search result");
    expect(prompts[0]).toContain("a reading of the above, not a measured fact");
  });

  it("and told plainly that a signal is context, not a measurement of this business", async () => {
    anthropic(REPLY);
    await generateChannelAdvice(thin(), null, undefined, [signal()]);
    expect(prompts[0]).toContain("context, not measurement");
    expect(prompts[0]).toContain("Never restate one as a number or a certainty");
  });

  it("NO SIGNALS, NO SECTION — the prompt is what it always was, with no empty heading", async () => {
    anthropic(REPLY);
    await generateChannelAdvice(thin(), null, undefined, []);
    expect(prompts[0]).not.toContain("What the other departments have noticed");
    expect(prompts[0]).not.toContain("context, not measurement");
    // The measured diagnosis is still the backbone.
    expect(prompts[0]).toContain("Every recommendation must rest on a number");
  });

  it("the advice that comes back is verified against the signals it was given", async () => {
    // A figure only a signal carries, in a unit the checker polices — so
    // if the verifier weren't handed the signals, this line would vanish.
    anthropic({ summary: "The workshop post brought 2 leads.", recommendations: [], dataGaps: [] });
    const r = await generateChannelAdvice(thin(), null, undefined, [
      signal({ source: "content_results", summary: "The workshop post brought 2 leads from 40 visits", evidence: { visits: 40, leads: 2 }, confidence: "counted" }),
    ]);
    expect(r.ok && r.advice.summary).toContain("2 leads");
    expect(r.ok && r.advice.removed).toEqual([]);
  });
});

// ---- the callers actually read them ---------------------------------------
describe("both places that ask for advice read the store", () => {
  it("THE STRATEGY PAGE: a stored signal reaches the model", async () => {
    vi.resetModules();
    const rows: Record<string, any[]> = {
      profiles: [{ id: "u1", dealership_id: "d1" }],
      dealerships: [{ id: "d1", dealership_name: "Candle by Qaaf", business_category: "Home fragrance" }],
      business_signals: [{
        id: "s1", dealership_id: "d1", source: "competitor_monitor", topic: "Aroma Co",
        summary: "Aroma Co started same-day delivery in Shahjahanpur", evidence: {}, confidence: "observed",
        source_url: null, observed_at: NOW, last_seen_at: NOW, expires_at: "2099-01-01T00:00:00Z",
      }],
    };
    const client = () => {
      const from = (table: string) => {
        const filters: [string, any][] = [];
        const list = () => (rows[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
        const api: any = {
          select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api,
          not: () => api, in: () => api, is: () => api,
          eq: (k: string, v: any) => (filters.push([k, v]), api),
          single: async () => ({ data: list()[0] ?? null, error: null }),
          maybeSingle: async () => ({ data: list()[0] ?? null, error: null }),
          then: (res: any, rej: any) => Promise.resolve({ data: list(), error: null }).then(res, rej),
        };
        return api;
      };
      return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
    };
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
    anthropic(REPLY);

    const { GET } = await import("@/app/api/strategy/diagnosis/route");
    await GET(new Request("https://x.test/api/strategy/diagnosis?advice=1"));

    expect(prompts[0]).toContain("Aroma Co started same-day delivery");
    vi.doUnmock("@/lib/supabase/server");
  });

  it("CHAT asks for them too, from the same store", () => {
    const src = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(src).toContain("const adviceSignals = await readSignals(supabase, ctx.id, { limit: 12 })");
    expect(src).toContain("generateChannelAdvice(diagnosis, facts, { supabase, dealershipId: ctx.id }, adviceSignals)");
  });
});
