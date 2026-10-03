// About ₹27 of paid work discarded, and a reason invented to cover it.
//
// THE LIVE CASE (3 Oct 2026, candle_by_qaaf). A competitor pricing
// compare for "Karessa Candles" ran twice. api_usage_logs shows the web
// search ran both times (₹1.74 each) and the Claude call ran and
// returned (₹11.52, ₹11.72). The owner got "Couldn't complete pricing
// compare for Karessa Candles right now — try again shortly", and the
// chat, with no cause to relay, invented two: "research tool ne koi
// result nahi diya" and "tool temporarily unavailable lag raha hai".
// Both wrong.
//
// The Vercel log, one line after the second call:
//   [competitor-intel-agent] error: Expected ',' or ']' after array
//   element in JSON at position 6934 (line 147 column 6)
//
// JSON.parse threw inside a catch returning a generic fallback. The
// answer was there and was thrown away.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { parseModelJson } from "@/lib/ai/modelJson";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));
vi.mock("@/lib/research/perplexityClient", () => ({
  isPerplexityConfigured: () => false,
  callComplexResearch: async () => { throw new Error("x"); },
  callDeepResearch: async () => { throw new Error("x"); },
}));

// ---- the parser, on the three ways a reply breaks ---------------------

describe("the reply that was spliced by the greedy match", () => {
  it("reads the first balanced object and ignores a later fragment", () => {
    // THE REPRODUCTION of position 6934. A web-search reply is many text
    // blocks; joining them and matching /\{[\s\S]*\}/ runs from the
    // FIRST "{" to the LAST "}", so a second fragment's element lands
    // inside the first's array with no comma before it — which is
    // exactly "Expected ',' or ']' after array element".
    const spliced = `{"competitorPricing":[{"item":"Jar candle","price":"₹1,450"}],"comparisonNotes":"Dearer."}
Let me search once more.
{"item":"Votive","price":"₹450"}`;
    expect(() => JSON.parse(spliced.slice(spliced.indexOf("{"), spliced.lastIndexOf("}") + 1))).toThrow();

    const read = parseModelJson(spliced);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.partial).toBe(false);
    expect(read.value.competitorPricing[0].price).toBe("₹1,450");
  });

  it("skips a brace that was only prose and finds the real object", () => {
    const read = parseModelJson(`Here is what I found {details below}:\n{"comparisonNotes":"Dearer."}`);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.comparisonNotes).toBe("Dearer.");
  });

  it("is not confused by a brace inside a quoted string", () => {
    const read = parseModelJson('{"note":"they write prices as {price} on the page","ok":true}');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.ok).toBe(true);
  });
});

describe("the reply that was cut off at max_tokens", () => {
  const truncated = `{"competitorPricing":[{"item":"Jar candle","price":"₹1,450"},{"item":"Votive set","price":"₹890"},{"item":"Tin ca`;

  it("keeps the complete items instead of discarding the call", () => {
    expect(() => JSON.parse(truncated)).toThrow();

    const read = parseModelJson(truncated, { stopReason: "max_tokens", outputTokens: 2500, maxTokens: 2500 });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.competitorPricing).toHaveLength(2);
    expect(read.value.competitorPricing[1].item).toBe("Votive set");
  });

  it("says the answer is partial, so a short answer isn't read as the whole one", () => {
    const read = parseModelJson(truncated, { stopReason: "max_tokens", outputTokens: 2500 });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.partial).toBe(true);
    expect(read.note).toMatch(/incomplete/);
    expect(read.note).toMatch(/cut off after 2500 tokens/);
    expect(read.note).toMatch(/only the 2 complete items are shown/);
  });

  it("does not salvage a key with no value, which would invent one", () => {
    const read = parseModelJson('{"items":[{"item":"Jar","price":"₹1,450"}],"comparisonNotes":');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // The dangling key is dropped rather than given a made-up value.
    expect(read.value.comparisonNotes).toBeUndefined();
    expect(read.value.items).toHaveLength(1);
  });

  it("names the cause when nothing at all was finished", () => {
    const read = parseModelJson('{"competitorPricing":[{"item":"Jar ca', { stopReason: "max_tokens", outputTokens: 2500, maxTokens: 2500 });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.cause).toBe("truncated");
    expect(read.message).toMatch(/cut off before a single complete item/);
    expect(read.message).toMatch(/2500-token limit/);
  });
});

describe("the reply that was malformed", () => {
  it("does NOT guess its way past an unescaped quote, and says so", () => {
    // An unescaped quote destroys string tracking: from that point on
    // there is no way to know where a value ended, so there is no safe
    // point to salvage to. Reported as malformed rather than guessed —
    // the alternative is assembling an item out of fragments, which is
    // the one failure worse than this one. Named here as a limit of the
    // salvage, not an oversight.
    const malformed = `{"items":[{"item":"Jar candle","price":"₹1,450"},{"item":"The "best" votive","price":"₹890"}]}`;
    expect(() => JSON.parse(malformed)).toThrow();
    const read = parseModelJson(malformed);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.cause).toBe("malformed");
    expect(read.message).toMatch(/came back malformed/);
  });

  it("salvages when the break comes after a whole item", () => {
    // The commoner shape, and the one the salvage is for: the damage is
    // past a complete element, so the complete elements survive.
    const read = parseModelJson(`{"items":[{"item":"Jar candle","price":"₹1,450"},{"item":"The "best`);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.items).toHaveLength(1);
    expect(read.value.items[0].price).toBe("₹1,450");
    expect(read.partial).toBe(true);
  });

  it("reports an unreadable reply as malformed, not as a shrug", () => {
    const read = parseModelJson("{ this is not json at all }");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.cause).toBe("malformed");
    expect(read.message).toMatch(/came back malformed/);
    // And says whose fault it isn't.
    expect(read.message).toMatch(/not my data or yours/);
  });

  it("says plainly when the model wrote prose instead", () => {
    const read = parseModelJson("I could not find pricing for this competitor.");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.cause).toBe("no_json");
    expect(read.message).toMatch(/prose instead of the structured answer/);
  });

  it("leaves a clean reply exactly as it is", () => {
    const read = parseModelJson('```json\n{"a":1,"b":[1,2,3]}\n```');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toEqual({ a: 1, b: [1, 2, 3] });
    expect(read.partial).toBe(false);
    expect(read.note).toBeNull();
  });
});

describe("the cost of a wasted call is shown, not hidden", () => {
  it("names the real cause and what it cost", async () => {
    const { wastedCallNote } = await import("@/lib/ai/modelJson");
    const read = parseModelJson("{ not json }");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    const note = wastedCallNote(read, 11.72);
    expect(note).toMatch(/came back malformed/);
    expect(note).toMatch(/cost about ₹11\.72/);
    expect(note).toMatch(/said what went wrong rather than just asking you to try again/);
  });
});

// ---- the agent that failed -------------------------------------------

const CITED = [{ type: "web_search_result_location", url: "https://karessacandles.in/shop", title: "Karessa Candles", cited_text: "Karessa jar candle — ₹1,450." }];

let reply: any;
vi.mock("@/lib/ai/claude", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/claude")>();
  return { ...original, callClaude: async () => reply };
});

function modelSays(text: string, stopReason = "end_turn") {
  return {
    ok: true,
    text,
    costInr: 11.72,
    data: {
      content: [{ type: "text", text, citations: CITED }],
      usage: { input_tokens: 31000, output_tokens: 2500 },
      stop_reason: stopReason,
    },
  };
}

async function karessa() {
  const { generateCompetitorIntel } = await import("@/lib/agents/competitorIntelAgent");
  return generateCompetitorIntel("pricing_compare", "Karessa Candles", "candle_by_qaaf", "Home fragrance", undefined, undefined, "free", null);
}

beforeEach(() => { reply = undefined; });

describe("Karessa Candles, the way it actually failed", () => {
  it("no longer discards a spliced reply", async () => {
    reply = modelSays(`{"competitorPricing":[{"item":"Jar candle","price":"₹1,450"}],"comparisonNotes":"Dearer than yours."}
One more search.
{"item":"Votive","price":"₹450"}`);
    const r: any = await karessa();
    expect(r._fallback).toBeUndefined();
    expect(r.output.competitorPricing[0].price).toBe("₹1,450");
    expect(r.output.comparisonNotes).toBe("Dearer than yours.");
  });

  it("salvages a cut-off reply and says it is partial", async () => {
    reply = modelSays(`{"competitorPricing":[{"item":"Jar candle","price":"₹1,450"},{"item":"Votive","pri`, "max_tokens");
    const r: any = await karessa();
    expect(r._fallback).toBeUndefined();
    expect(r.output.competitorPricing).toHaveLength(1);
    expect(r.output._partial).toMatch(/incomplete/);
  });

  it("names the real cause instead of 'try again shortly' when nothing is readable", async () => {
    reply = modelSays("I was unable to find anything about this competitor.");
    const r: any = await karessa();
    expect(r._fallback).toBe(true);
    // THE SENTENCE THE OWNER SAW, gone.
    expect(r.output.text).not.toMatch(/try again shortly/);
    // The cause, and the cost, so a paid failure is visible.
    expect(r.output.text).toMatch(/prose instead of the structured answer/);
    expect(r.output.text).toMatch(/₹11\.72/);
    // And machine-readable, so the chat has something to relay.
    expect(r._cause).toBe("no_json");
    expect(r._detail).toBeTruthy();
  });
});

describe("the chat may not invent a reason", () => {
  it("is told to relay the tool's own account and nothing else", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/WHEN A TOOL FAILS, SAY WHAT IT SAID AND NOTHING MORE/);
    // The two reasons it actually invented, named so the rule is testable.
    expect(brain).toMatch(/the research tool returned nothing/);
    expect(brain).toMatch(/temporarily unavailable/);
    expect(brain).toMatch(/If the result does not say why, say that you do not know why/);
    expect(brain).toMatch(/_cause.*_detail.*_partial/);
  });
});

describe("the answer is asked to be smaller", () => {
  it("bounds the item count and the quote length in the prompt", () => {
    // ₹11.52 and ₹11.72 against ₹1.74 of search — about 4x, and mostly
    // INPUT, because every page the search returns is fed back. Output
    // is the part a prompt can bound, so it is bounded.
    const agent = readFileSync("src/lib/agents/competitorIntelAgent.ts", "utf8");
    expect(agent).toMatch(/At most 5 items in any list/);
    expect(agent).toMatch(/Quote at most 200 characters/);
    expect(agent).toMatch(/const MAX_OUTPUT_TOKENS = 2500/);
  });

  it("tells the parser what the ceiling was, so a cut-off reply can say so", () => {
    const agent = readFileSync("src/lib/agents/competitorIntelAgent.ts", "utf8");
    expect(agent).toMatch(/stopReason: r\.data\.stop_reason \?\? null/);
    expect(agent).toMatch(/maxTokens: MAX_OUTPUT_TOKENS/);
  });
});
