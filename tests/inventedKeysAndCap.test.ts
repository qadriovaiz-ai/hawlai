// Two live findings from the 11 October Facebook post, 189 words long.
//
// 1. "Concrete_details_used" appeared in the visible caption. That
//    string is NOWHERE in this codebase: the MODEL invented the key,
//    because the prompt asks for "at least one CONCRETE, specific
//    detail", and composePost joined every string field it found. The
//    key was not "_" prefixed and not in NOT_CONTENT, so both filters
//    passed it - and the department panel's humanizeKey turned it into
//    a tidy label, "Concrete details used", which is what made it look
//    like part of the output.
//
//    A denylist cannot fix this. The next invented key has a different
//    name and nobody can enumerate what a model might call a field it
//    made up. So content keys are now allowlisted BY SHAPE.
//
// 2. The post was 189 words against a cap of 150, and the retry HAD
//    run - three model calls - and come back long. The code then kept
//    it with a note reading "I've left it as it is so you can see it".
//    That is work handed back on the one screen where the owner is
//    about to press Publish.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isContentKey, composePost } from "@/lib/chat/socialPost";
import { tightenToCap, tightenOutput, wordCount, WORD_CAPS } from "@/lib/content/customerFirst";
import { code } from "./helpers/source";
import { generateContent } from "@/lib/agents/contentMarketingAgent";

describe("1. a key the model invented never reaches the reader", () => {
  it("THE LIVE KEY IS REFUSED", () => {
    expect(isContentKey("Concrete_details_used")).toBe(false);
  });

  it("and so is every shape like it", () => {
    for (const key of [
      "Concrete_details_used",
      "facts_used",
      "Notes_for_owner",
      "Angle",
      "ANGLE",
      "Word_count",
      "specifics-used",
      "details used",
    ]) {
      expect(isContentKey(key), key).toBe(false);
    }
  });

  it("EVERY REAL CONTENT KEY IS STILL ALLOWED", () => {
    // The cost side. If this list breaks, real copy stops being
    // published, which is far worse than a stray label.
    for (const key of ["text", "body", "caption", "headline", "intro", "title", "subject", "ctaLabel", "heroHeadline", "hook", "bullets", "slides", "days"]) {
      expect(isContentKey(key), key).toBe(true);
    }
  });

  it("the old filters are still there too", () => {
    expect(isContentKey("_factsState")).toBe(false);
    expect(isContentKey("note")).toBe(false);
    expect(isContentKey("hashtags")).toBe(false);
  });

  it("THE INVENTED VALUE IS NOT IN THE PUBLISHED CAPTION", () => {
    // The whole bug, end to end through the real composer.
    const composed = composePost({
      text: "Evenings get loud. One lavender candle and the room slows down.",
      Concrete_details_used: "40 hour burn, 550 rupees, Shahjahanpur",
      hashtags: ["#candles"],
    });
    expect(composed.text).toContain("Evenings get loud");
    expect(composed.text).not.toMatch(/Concrete_details_used/);
    expect(composed.text).not.toMatch(/40 hour burn, 550 rupees/);
    // The hashtags still join on, as they always did.
    expect(composed.text).toContain("#candles");
  });

  it("AND NOT IN THE DEPARTMENT PANEL EITHER", () => {
    // humanizeKey would have rendered it as "Concrete details used".
    const editor = code("src/components/shared/GeneratedOutputEditor.tsx");
    expect(editor).toMatch(/isContentKey\(key\)/);
    expect(editor).not.toMatch(/filter\(\(\[key\]\) => !key\.startsWith\("_"\)\)/);
  });
});

describe("2. over the cap is tightened, not handed back", () => {
  const SENTENCES = ["Evenings get loud in Shahjahanpur.", ...Array(24).fill("The lavender candle sits quietly on the shelf and waits for the evening."), "Order on the store page."];
  const LONG = SENTENCES.join(" ");

  it("THE LIVE LENGTH IS OVER THE CAP", () => {
    expect(wordCount(LONG)).toBeGreaterThan(WORD_CAPS.facebook_post);
  });

  it("IT IS CUT TO FIT", () => {
    const r = tightenToCap(LONG, WORD_CAPS.facebook_post);
    expect(wordCount(r.text)).toBeLessThanOrEqual(WORD_CAPS.facebook_post);
    expect(r.dropped).toBeGreaterThan(0);
  });

  it("THE OPENING AND THE CLOSE SURVIVE — the close is the next step", () => {
    const r = tightenToCap(LONG, WORD_CAPS.facebook_post);
    expect(r.text.startsWith("Evenings get loud in Shahjahanpur.")).toBe(true);
    expect(r.text.trim().endsWith("Order on the store page.")).toBe(true);
  });

  it("NEVER MID-SENTENCE", () => {
    // A truncated sentence reads as a bug and can change what the copy
    // says.
    const r = tightenToCap(LONG, WORD_CAPS.facebook_post);
    expect(r.text.trim()).toMatch(/[.!?]$/);
    for (const part of r.text.split(/(?<=[.!?])\s+/)) {
      if (!part.trim()) continue;
      expect(SENTENCES.some((s) => s.trim() === part.trim()), part).toBe(true);
    }
  });

  it("a piece inside the cap is left exactly alone", () => {
    const short = "Evenings get loud. One lavender candle. 550. Order on the store page.";
    const r = tightenToCap(short, WORD_CAPS.facebook_post);
    expect(r.text).toBe(short);
    expect(r.dropped).toBe(0);
  });

  it("ONE LONG SENTENCE IS NOT CUT, because it cannot be cut cleanly", () => {
    // Stated as a test so the limit is known rather than discovered.
    const one = Array(200).fill("word").join(" ") + ".";
    const r = tightenToCap(one, 150);
    expect(r.dropped).toBe(0);
    expect(r.text).toBe(one);
  });

  it("it tightens the PROSE field and leaves the others alone", () => {
    const out = { text: LONG, hashtags: ["#candles", "#lavender"], note: "internal" };
    const r = tightenOutput(out, "facebook_post");
    expect(wordCount(r.output.text)).toBeLessThanOrEqual(WORD_CAPS.facebook_post);
    expect(r.output.hashtags).toEqual(["#candles", "#lavender"]);
    expect(r.output.note).toBe("internal");
  });

  it("a type with no cap is never tightened", () => {
    const out = { body: LONG };
    expect(tightenOutput(out, "blog_seo").dropped).toBe(0);
  });
});

// ---------------------------------------------------------------------
// 3. THE AGENT ITSELF, with a model that stays long through the retry
// ---------------------------------------------------------------------
//
// A mutation that removed tightenOutput from the agent left every test
// above green: they proved the FUNCTION could cut, never that the path
// calls it. That is the F-16 shape again - a measure that exists and is
// not reached - so the gate is driven end to end here.

import type { BusinessFacts } from "@/lib/claims/businessFacts";

let prompts: string[];
function anthropic(...outputs: any[]) {
  const replies = [...outputs];
  // The LAST answer is sticky. A run makes more model calls than the
  // one being tested - the genericness retry, the shape retry - and a
  // stub that runs dry returns a fallback that looks like the agent
  // failing rather than the test under-feeding it.
  let last = outputs[outputs.length - 1];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = replies.length ? replies.shift() : last;
    const payload = { content: [{ type: "text", text: JSON.stringify(next) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

function facts(): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn" }],
    offers: [], pillars: [], site: null, home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    season: { today: "2026-10-11", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
  } as unknown as BusinessFacts;
}

// 189 words, the live length, built out of whole sentences so the model
// answer looks like the one that actually came back.
const OVER = [
  "Evenings in Shahjahanpur get loud.",
  ...Array(22).fill("The lavender candle is soy wax and it sits on the shelf until the evening comes round."),
  "Lavender candle, 550. Order on the store page.",
].join(" ");

describe("3. an over-cap post is tightened by the agent, not handed back", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("THE RESULT IS UNDER THE CAP even when the retry comes back long", async () => {
    // Both the first answer and the shape retry are over the cap. This
    // is what happened live: three model calls, still 189 words.
    anthropic({ text: OVER }, { text: OVER }, { text: OVER }, { text: OVER });
    const r: any = await generateContent("facebook_post", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, facts(), "draft", { revise: true });
    const out = r.output ?? r;
    expect(wordCount(out.text)).toBeLessThanOrEqual(WORD_CAPS.facebook_post);
  });

  it("THE RETRY IS ASKED FOR FIRST — tightening is the fallback, not the plan", async () => {
    anthropic({ text: OVER }, { text: OVER }, { text: OVER }, { text: OVER });
    await generateContent("facebook_post", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, facts(), "draft", { revise: true });
    expect(prompts.some((p) => /Cut it to under 150/i.test(p))).toBe(true);
  });

  it("THE OWNER IS TOLD WHAT WAS CUT, and not told to ask again", async () => {
    anthropic({ text: OVER }, { text: OVER }, { text: OVER }, { text: OVER });
    const r: any = await generateContent("facebook_post", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, facts(), "draft", { revise: true });
    const note = String((r.output ?? r)._storyNote ?? "");
    expect(note).toMatch(/cut/i);
    // The sentence I actually shipped on the live run. It is the thing
    // being fixed, so it must not come back.
    expect(note).not.toMatch(/left it as it is so you can see it/i);
  });

  it("the opening and the next step survive the agent's cut", async () => {
    anthropic({ text: OVER }, { text: OVER }, { text: OVER }, { text: OVER });
    const r: any = await generateContent("facebook_post", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, facts(), "draft", { revise: true });
    const text = String((r.output ?? r).text ?? "");
    expect(text).toMatch(/Evenings in Shahjahanpur get loud/);
    expect(text).toMatch(/Order on the store page/);
  });

  it("a post inside the cap reaches the owner untouched and unremarked", async () => {
    const fine = "Evenings get loud. The lavender candle is soy wax, 40 hour burn, 550. Order on the store page.";
    anthropic({ text: fine });
    const r: any = await generateContent("facebook_post", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, facts(), "draft", { revise: true });
    const out = r.output ?? r;
    expect(out.text).toContain("Evenings get loud");
    expect(String(out._storyNote ?? "")).not.toMatch(/cut/i);
  });
});

// ---------------------------------------------------------------------
// 4. THE SWEEP — the other places that made the same decision
// ---------------------------------------------------------------------
//
// Ovaiz asked which internal keys and labels can reach visible text
// anywhere in the codebase, not just the one that leaked. Five places
// decided independently which fields of an output are content, and
// three of them were looser than composePost:
//
//   api/autopilot/content-queue  Object.values(output)[0]   UNATTENDED
//   automation/contentAutopilot  first key not "_" prefixed UNATTENDED
//   email/EmailMarketingTools    EVERY key, no filter at all
//
// The two unattended ones are the serious pair: they publish to
// Facebook and Instagram with nobody reading the caption first.

import { firstContentString } from "@/lib/content/contentKeys";
import { captionForPost } from "@/lib/automation/contentAutopilot";

describe("4. every path that turns an output into text", () => {
  const LEAKY = {
    _claimsNote: "I took out a line about the burn time.",
    Concrete_details_used: "40 hour burn, 550 rupees",
    text: "Evenings get loud. One lavender candle, 550.",
  };

  it("THE SHARED FALLBACK SKIPS THE INVENTED KEY AND THE NOTE", () => {
    expect(firstContentString(LEAKY)).toContain("Evenings get loud");
  });

  it("AND RETURNS NOTHING RATHER THAN THE WRONG THING", () => {
    // Empty is a handled case on both unattended paths: they refuse to
    // post. A note or an invented label is not.
    expect(firstContentString({ _claimsNote: "x", Concrete_details_used: "y" })).toBe("");
    expect(firstContentString({ note: "internal" })).toBe("");
  });

  it("THE AUTOPILOT CAPTION NEVER CARRIES AN INVENTED KEY'S VALUE", () => {
    // The unattended path. Key order puts the invented key first on
    // purpose - that is how JSON.parse would hand it over.
    const caption = captionForPost({ Concrete_details_used: "40 hour burn, 550 rupees", hashtags: ["#candles"] });
    expect(caption).not.toMatch(/40 hour burn, 550 rupees/);
  });

  it("but a real caption still posts, hashtags and all", () => {
    const caption = captionForPost({ text: "Evenings get loud.", hashtags: ["#candles"] });
    expect(caption).toContain("Evenings get loud");
    expect(caption).toContain("#candles");
  });

  it("THE UNATTENDED QUEUE USES THE SHARED FALLBACK", () => {
    const route = code("src/app/api/autopilot/content-queue/route.ts");
    expect(route).toMatch(/firstContentString/);
    expect(route).not.toMatch(/Object\.values\(contentResult\.output\)\[0\]/);
  });

  it("THE EMAIL PANEL NO LONGER RENDERS EVERY KEY", () => {
    // This one printed _claimsNote and _factsState as paragraphs of the
    // email whenever the shape had no subject or body.
    const panel = code("src/components/email/EmailMarketingTools.tsx");
    expect(panel).toMatch(/isContentKey\(key\)/);
    expect(panel).not.toMatch(/!output\.subject && !output\.body && Object\.entries\(output\)\.map/);
  });

  it("THE AUTOPILOT NO LONGER USES A \"_\" PREFIX TEST FOR THE CAPTION", () => {
    const auto = code("src/lib/automation/contentAutopilot.ts");
    expect(auto).toMatch(/firstContentString/);
    expect(auto).not.toMatch(/find\(\(\[k, v\]\) => !k\.startsWith\("_"\)/);
  });

  it("ONE LIST, and the old copy is gone", () => {
    // Two lists that drift apart are worse than one imperfect list.
    const social = code("src/lib/chat/socialPost.ts");
    expect(social).toMatch(/from "@\/lib\/content\/contentKeys"/);
    expect(social).not.toMatch(/\^\[a-z\]\[a-zA-Z0-9\]\*\$/);
  });
});

// ---------------------------------------------------------------------
// 5. THE PRICE AND THE LINK ARE NEVER CUT
// ---------------------------------------------------------------------
//
// Ovaiz, 11 October 2026: "Post chhoti karte waqt price aur link wali
// line kabhi mat kaato."
//
// Tightening kept the opening and the close and dropped from the
// middle, which is right for description and wrong for the two things
// the post exists to carry. A post trimmed to fit that no longer says
// what it costs or where to buy it has been made worse, not shorter.
//
// So they are kept EVEN WHEN KEEPING THEM LEAVES THE PIECE OVER THE
// CAP, and the owner is told that is what happened.

import { carriesTheOffer, customerFirstNote } from "@/lib/content/customerFirst";

describe("5. the offer survives the cut", () => {
  const FILLER = "The lavender candle sits quietly on the shelf and waits for the evening to come round again.";

  it("A PRICE IN THE MIDDLE IS KEPT while description around it goes", () => {
    const text = [
      "Evenings get loud.",
      ...Array(12).fill(FILLER),
      "Lavender candle, 550, and we ship for 60.",
      ...Array(12).fill(FILLER),
      "Thanks for reading.",
    ].join(" ");
    const r = tightenToCap(text, 150);
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.text).toContain("Lavender candle, 550");
    expect(r.keptForFacts).toBe(1);
  });

  it("A LINK IN THE MIDDLE IS KEPT", () => {
    const text = [
      "Evenings get loud.",
      ...Array(20).fill(FILLER),
      "Order at candlebyqaaf.in today.",
      ...Array(8).fill(FILLER),
      "See you soon.",
    ].join(" ");
    const r = tightenToCap(text, 150);
    expect(r.text).toContain("candlebyqaaf.in");
  });

  it("IT IS KEPT EVEN WHEN THAT LEAVES THE PIECE OVER THE CAP", () => {
    // Three price lines, each long. Fitting would mean losing one.
    const priced = (n: number) => `Our ${n} wick lavender candle is priced at 55${n} rupees and ships anywhere in Shahjahanpur for sixty rupees on every single order.`;
    const text = ["Evenings get loud.", priced(1), priced(2), priced(3), priced(4), "Thanks for reading."].join(" ");
    const r = tightenToCap(text, 40);
    expect(wordCount(r.text)).toBeGreaterThan(40);
    for (const n of [1, 2, 3, 4]) expect(r.text, `price ${n}`).toContain(`55${n} rupees`);
  });

  it("AND THE OWNER IS TOLD WHY IT IS STILL LONG — not that it is one long sentence", () => {
    const note = customerFirstNote({ kind: "too_long", words: 180, cap: 150 }, 4);
    expect(note).toMatch(/cut 4 sentences/);
    expect(note).toMatch(/price or the link/);
    expect(note).not.toMatch(/one long sentence/);
  });

  it("the one-long-sentence note is still said when nothing was cut", () => {
    const note = customerFirstNote({ kind: "too_long", words: 180, cap: 150 }, 0);
    expect(note).toMatch(/one long sentence/);
  });

  it("WHAT COUNTS AS THE OFFER", () => {
    for (const s of [
      "Lavender candle, 550.",
      "₹550 only.",
      "Rs 550 with free shipping.",
      "20% off this week.",
      "Order at candlebyqaaf.in.",
      "Visit https://candlebyqaaf.in/lavender",
      "Link in bio.",
      "Order on the store page.",
      "It costs 550.",
    ]) {
      expect(carriesTheOffer(s), s).toBe(true);
    }
  });

  it("AND WHAT DOES NOT — a specification is not a price", () => {
    // "40 hour burn" and "24 ghante" are the numbers this business
    // actually records. Treating them as the offer would make every
    // description line uncuttable and tightening would stop working.
    for (const s of [
      "Soy wax, 40 hour burn.",
      "Har candle 24 ghante set hoti hai.",
      "It takes 2 days to cure.",
      "Evenings get loud in Shahjahanpur.",
      "The room slows down.",
    ]) {
      expect(carriesTheOffer(s), s).toBe(false);
    }
  });
});
