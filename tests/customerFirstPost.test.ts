// THE LIVE FAILURE, 11 October 2026: a 224-word founder story.
//
// Live-check step 4. "write a facebook post about the lavender candle"
// came back as a 224-word first-person story — "I learned this the hard
// way", "That batch never left the house", "rose gave people
// headaches", "I will not rush the 24-hour setting time", "I light one
// myself most nights" — with the price and shipping as one line at the
// very end. P1 says copy is customer-first and the founder's story is
// information, not a content engine.
//
// WHY IT HAPPENED, and it is not subtle. The 2026-10-09 inversion
// changed the GATE and left the INSTRUCTION. craftSection still told
// the model, in plain English:
//
//   "The owner's own story is in the facts above: use it. That detail
//    is the whole point of the piece."
//
// So nothing was broken. The model did as it was told. And neither
// guard objected: isGeneric passes anything carrying a recorded
// specific, and a story IS one; narrative provenance passes a story the
// owner has actually written down, which this was.
//
// Two separate failures therefore, and both are tested here: the prompt
// that asks for it, and the absence of any check on how much of a piece
// is about the business rather than about the reader.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { code } from "./helpers/source";

// fetch is stubbed rather than callClaude mocked, which is the pattern
// the rest of this suite already proves works: a vi.mock factory that
// closes over a `let` is hoisted above the declaration, so the factory
// sees undefined, the mock never applies, the real client runs with no
// key and the agent returns its fallback. That is what "PROMPTS 0" was.
let prompts: string[];
let replies: any[];

function anthropic(...outputs: any[]) {
  replies = [...outputs];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = replies.shift() ?? { text: "nothing left" };
    const payload = { content: [{ type: "text", text: JSON.stringify(next) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

import { generateContent, craftSection } from "@/lib/agents/contentMarketingAgent";
import { storySentences, storyShare, overWordCap, customerFirstProblem, WORD_CAPS } from "@/lib/content/customerFirst";

/** candle_by_qaaf with its story actually written down, as Ovaiz has it. */
function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn" }],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [
      { category: "business_story", title: "The mistake I learnt from", content: "Ek baar jaldi mein poora batch kharab kiya tha. Woh batch ghar se bahar nahi gaya." },
      { category: "business_story", title: "Curing", content: "Har candle 24 ghante set hoti hai, main jaldi nahi karti." },
      { category: "business_story", title: "Fragrance", content: "Rose se logon ko sirdard hota tha. Sandalwood Shahjahanpur mein har jagah hai." },
    ] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    // resolveFestiveTopic reads facts.season on the way into the prompt
    // and a missing one throws before the model is ever called - which
    // is how the first run of this file reported "PROMPTS 0" and a
    // fallback, looking exactly like a broken mock.
    season: { today: "2026-10-11", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as unknown as BusinessFacts;
}

/** The post that actually went out, shortened only where it repeats itself. */
const LIVE_POST = [
  "I learned this the hard way.",
  "That batch never left the house.",
  "Rose gave people headaches, and sandalwood is everywhere in Shahjahanpur.",
  "I will not rush the 24-hour setting time.",
  "I light one myself most nights.",
  "Lavender candle, 550, ships for 60.",
].join(" ");

beforeEach(() => {
  anthropic({ text: "Lavender candle, 550. Ships for 60 across Shahjahanpur." });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const ask = (contentType = "facebook_post", topic = "the lavender candle", f = facts()) =>
  generateContent(contentType, "Candle by Qaaf", "Home fragrance", topic, null, undefined, undefined, f, "draft", { revise: true });

// ---------------------------------------------------------------------
// 1. THE PROMPT STOPS ASKING FOR IT
// ---------------------------------------------------------------------

describe("1. the instruction that caused it", () => {
  it("THE PROMPT NO LONGER CALLS THE STORY THE POINT OF THE PIECE", async () => {
    // The exact sentence that produced a 224-word founder story.
    await ask();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]).not.toMatch(/whole point of the piece/i);
    expect(prompts[0]).not.toMatch(/story is in the facts above: use it/i);
  });

  it("IT ASKS FOR THE CUSTOMER-FIRST ORDER INSTEAD", async () => {
    await ask();
    const p = prompts[0];
    expect(p).toMatch(/customer/i);
    expect(p).toMatch(/next step/i);
    // And says plainly where the story belongs: information, not the
    // subject, unless it was asked for.
    expect(p).toMatch(/did NOT ask for their story/i);
    expect(p).toMatch(/information, not the subject/i);
    expect(p).toMatch(/AT MOST ONE short sentence/i);
  });

  it("AND STATES THE WORD CAP AS A NUMBER", async () => {
    // "80-150 words, community-toned" was in the instructions and the
    // post was 224. A range buried in prose is a suggestion.
    await ask();
    expect(prompts[0]).toMatch(/at most 150 words/i);
  });

  it("craftSection asks for the story ONLY when the owner asked", () => {
    const asked = craftSection("our story", [], true, true);
    const notAsked = craftSection("the lavender candle", [], true, false);
    expect(asked).toMatch(/story/i);
    expect(notAsked).not.toMatch(/whole point/i);
    // Not banned outright - a recorded detail may still be used as
    // material. What changes is that it stops being the subject.
    expect(notAsked).toMatch(/at most one/i);
  });
});

// ---------------------------------------------------------------------
// 2. AND A CHECK, SO IT IS NOT ONLY A PROMPT
// ---------------------------------------------------------------------

describe("2. the piece is measured, not merely requested", () => {
  it("THE LIVE POST IS CAUGHT AS STORY-DOMINANT", () => {
    // Five of its six sentences are the owner talking about herself.
    const share = storyShare(LIVE_POST);
    expect(share).toBeGreaterThan(0.5);
    const problem = customerFirstProblem({ text: LIVE_POST }, "facebook_post", "the lavender candle");
    expect(problem?.kind).toBe("story_dominant");
  });

  it("every first-person sentence in it is identified", () => {
    const found = storySentences(LIVE_POST);
    expect(found.join(" ")).toMatch(/learned this the hard way/);
    expect(found.join(" ")).toMatch(/never left the house/);
    expect(found.join(" ")).toMatch(/will not rush/);
    expect(found.join(" ")).toMatch(/light one myself/);
  });

  it("A CUSTOMER-FIRST POST PASSES", () => {
    const good = {
      text: "Evenings get loud. One lavender candle, lit at 8, and the room slows down. 550, ships across Shahjahanpur for 60. Order on the store page.",
    };
    expect(customerFirstProblem(good, "facebook_post", "the lavender candle")).toBeNull();
  });

  it("ONE story sentence in an otherwise customer-first post is fine", () => {
    // The story is information, not contraband. P1 withdrew it as the
    // ENGINE, not as material.
    const mixed = {
      text: "Evenings get loud. A lavender candle, lit at 8, slows the room down. I will not rush the 24-hour setting time, so each one is steady. 550, ships for 60. Order on the store page.",
    };
    expect(customerFirstProblem(mixed, "facebook_post", "the lavender candle")).toBeNull();
  });

  it("AND IT IS ALLOWED WHEN THE OWNER ASKED FOR THE STORY", () => {
    // "write our story" is a different request, and the whole piece
    // being the story is then correct.
    expect(customerFirstProblem({ text: LIVE_POST }, "facebook_post", "write our story")).toBeNull();
    expect(customerFirstProblem({ text: LIVE_POST }, "facebook_post", "a post about how we started")).toBeNull();
  });
});

describe("3. the length cap is a number, and it is enforced", () => {
  it("THE LIVE POST IS OVER THE FACEBOOK CAP", () => {
    const long = Array(40).fill("Evenings get loud and the room slows down nicely.").join(" ");
    expect(overWordCap(long, "facebook_post")).toBeTruthy();
  });

  it("the caps are stated per platform, not parsed out of prose", () => {
    expect(WORD_CAPS.facebook_post).toBe(150);
    expect(WORD_CAPS.instagram_post).toBe(150);
    // A type with no cap must not be treated as having a cap of zero.
    expect(overWordCap("a short line", "blog_seo")).toBeNull();
  });

  it("a post inside the cap passes", () => {
    expect(overWordCap("Evenings get loud. One lavender candle. 550.", "facebook_post")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 4. END TO END, through the real generator
// ---------------------------------------------------------------------

describe("4. the generator retries a story-dominant piece and then says so", () => {
  it("A STORY-DOMINANT DRAFT IS RETRIED", async () => {
    // Three replies: generate, revise (still the story), then the
    // customer-first retry is the thing under test.
    const fixed = "Evenings get loud. One lavender candle slows the room. 550. Order on the store page.";
    anthropic({ text: LIVE_POST }, { text: LIVE_POST }, { text: fixed });
    const r = await ask();
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    expect(prompts[prompts.length - 1]).toMatch(/about the reader|customer's situation/i);
    // THE RETRY'S ANSWER IS KEPT. Two mutations survived without this:
    // the reshaped draft could be computed and discarded, and the
    // problem could go un-re-measured so a still-wrong piece reported
    // clean.
    expect((r.output as any).text).toBe(fixed);
    // And it is RE-MEASURED: the fixed version is customer-first, so
    // the owner gets no warning about a problem that is gone.
    expect((r.output as any)._storyNote).toBeUndefined();
  });

  it("AND THE OWNER IS TOLD, in a sentence that reads", async () => {
    // Every attempt stays story-dominant, so the owner must be told.
    anthropic({ text: LIVE_POST }, { text: LIVE_POST }, { text: LIVE_POST });
    const r = await ask();
    // NOT equal to LIVE_POST, and that is two guards composing rather
    // than one misbehaving: narrative provenance removes the lines this
    // business has NOT recorded ("I learned this the hard way", "that
    // batch never left the house") and keeps the one it has ("rose gave
    // people headaches"). My first version of this assertion expected
    // the whole post back and was simply wrong about what should happen.
    expect((r.output as any).text).not.toMatch(/learned this the hard way/);
    expect((r.output as any).text).toMatch(/headaches/);
    const note = String((r.output as any)._storyNote ?? "");
    expect(note).toMatch(/your own story/i);
    expect(note).toMatch(/ask me for/i);
    // Not a broken fragment. The previous note read "I've left in but
    // can't back up something you do yourselves".
    expect(note).not.toMatch(/left in but can't back up something/i);
  });
});

describe("5. internal keys do not reach the model", () => {
  // Asked directly: are FACTS_AVAILABLE, "CopyEdit" or a UUID leaking
  // into text the owner reads?
  //
  // FACTS_AVAILABLE and the UUIDs COULD, and this is the path. Only
  // _emailPreview was stripped from the tool result - for size - so
  // _factsState, _savedId and _postApprovalId all went into the model's
  // context with nothing marking them as internal. A model that has a
  // string will sometimes say it.
  //
  // "CopyEdit" is NOT in the codebase as a string. See the report.
  it("THE SERIALISER DROPS EVERY UNDERSCORE KEY, not just the big one", () => {
    const result = {
      text: "Lavender candle, 550.",
      note: "Saved as a draft.",
      _factsState: "FACTS_AVAILABLE",
      _savedId: "9f1c4a2e-0000-4000-8000-000000000001",
      _postApprovalId: "9f1c4a2e-0000-4000-8000-000000000002",
      _claimsNote: "internal",
      _emailPreview: { html: "<p>big</p>", text: "big" },
    };
    const sent = JSON.stringify(result, (k, v) => (k.startsWith("_") ? undefined : v));
    expect(sent).toContain("Lavender candle");
    expect(sent).toContain("Saved as a draft.");
    expect(sent).not.toMatch(/FACTS_AVAILABLE/);
    expect(sent).not.toMatch(/9f1c4a2e/);
    expect(sent).not.toMatch(/_claimsNote|_emailPreview/);
  });

  it("AND THE CHAT USES THAT SERIALISER, not a plainer one", () => {
    // The guard is one argument to JSON.stringify; losing it is a
    // one-character edit.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    expect(brain).toMatch(/k\.startsWith\("_"\) \? undefined : v/);
    // And the old, narrower version is gone.
    expect(brain).not.toMatch(/k === "_emailPreview" \? undefined : v/);
  });

  it("the card still gets them, because it reads the object directly", () => {
    // Stripping is for the model's channel only. The owner's note must
    // still reach the screen.
    const panel = code("src/components/shared/GeneratedOutputPanel.tsx");
    expect(panel).toMatch(/output\?\._claimsNote/);
    expect(panel).toMatch(/output\?\._storyNote/);
  });
});
