// S2a — WhatsApp on the fact-bound pipeline.
//
// docs/PLAN-S2.md §2 names the mechanisms S1 never exercised, written
// down before they could cost a paid run. These are the tests for them.
//
//   the opt-out line   required by Meta, and not a claim. It is added
//                      AFTER the door, so no check can drop it — a
//                      property worth pinning rather than rediscovering
//   the routed model    WhatsApp picks Haiku for the WRITE step through
//                      the task router. Select must stay on Sonnet:
//                      under-selection deletes true claims, and
//                      0-of-34 wrongly removed was the hardest number
//                      S1 had to protect
//   the task slice      the door hardcoded "email", so WhatsApp would
//                      have been handed an email's slice in silence

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { generateCopy, factBoundEnabled, type CopyRequest } from "@/lib/content/generateCopy";
import { WHATSAPP_OPT_OUT, addWhatsappOptOut } from "@/lib/expertise/channelRules";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import { CLAUDE_MODELS } from "@/lib/models";
import { code, sourceWithComments } from "./helpers/source";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const ORIGINAL = globalThis.fetch;
const ORIGINAL_FLAG = process.env.FACT_BOUND_COPY;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  if (ORIGINAL_FLAG === undefined) delete process.env.FACT_BOUND_COPY;
  else process.env.FACT_BOUND_COPY = ORIGINAL_FLAG;
  vi.restoreAllMocks();
});
beforeEach(() => {
  process.env.FACT_BOUND_COPY = "1";
});

const FACTS = {
  businessName: "A Business",
  category: "Home fragrance",
  categoryKnown: true,
  businessModels: { models: ["products"], inferred: false },
  city: "Shahjahanpur",
  site: null,
  home: null,
  products: [
    { id: "p1", name: "Lavender candle", kind: "product", price: 999, description: "Soy wax, 40 hour burn", images: [], inventory: null, category: null, active: true, durationMinutes: null, bookingUrl: null },
  ],
  offers: [],
  shipping: { mode: "free", rate: null, freeThreshold: null },
  last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
  allTime: { paidOrders: 2, leads: 1 },
  ownerFacts: [{ category: "general", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." }],
  brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
  pillars: [],
  links: { store: "/site/a-business", products: [], booking: null },
  season: seasonFor([], "2026-09-18"),
  unreadable: [],
} as unknown as BusinessFacts;

function request(over: Partial<CopyRequest> = {}): CopyRequest {
  return {
    topic: "broadcast about the lavender candle",
    businessName: "A Business",
    businessCategory: "Home fragrance",
    facts: FACTS,
    mode: "draft",
    revise: false,
    operation: "whatsapp_generation",
    factBound: true,
    task: "whatsapp",
    model: CLAUDE_MODELS.fast,
    logContext: { supabase: {}, dealershipId: "biz_1" } as any,
    brief: { label: "broadcast", instructions: "Tell them it is available.", channelRules: `Keep it short. End with "${WHATSAPP_OPT_OUT}"` },
    ...over,
  };
}

/** Canned replies, in call order. */
function script(...bodies: unknown[]) {
  const sent: any[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return sent;
}
const tool = (name: string, input: unknown) => ({ content: [{ type: "tool_use", name, input }], usage: { input_tokens: 10, output_tokens: 5 } });
const prose = (text: string) => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } });

/** The paraffin record's real id, which getContext mints from the owner row. */
async function selectPicking(claims: unknown[], over: Record<string, unknown> = {}) {
  const { contextFromFacts } = await import("@/lib/facts/getContext");
  const ctx = contextFromFacts("biz_1", FACTS, { kind: "whatsapp", topic: "broadcast about the lavender candle" });
  const id = ctx.records.find((r) => r.key === "material.paraffin")!.id;
  const withIds = JSON.parse(JSON.stringify(claims).replace(/__PARAFFIN__/g, id));
  return tool("select_claims", { claims: withIds, conflicts: [], unknowns: [], ...over });
}

describe("1. the surface is on the pipeline", () => {
  it("opts in and declares its own task", () => {
    const src = code("src/lib/agents/whatsappMarketingAgent.ts");
    expect(src).toMatch(/factBound: true/);
    expect(src).toMatch(/task: "whatsapp"/);
    expect(factBoundEnabled(request())).toBe(true);
  });

  it("THE SLICE IS WHATSAPP'S, NOT AN EMAIL'S", async () => {
    // The door hardcoded kind: "email". getContext slices by task, so a
    // second surface would have silently been handed the wrong slice.
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/kind: req\.task \?\? "other"/);
    expect(src).not.toMatch(/kind: "email", topic: req\.topic/);
  });

  it("still does nothing with the flag off", () => {
    delete process.env.FACT_BOUND_COPY;
    expect(factBoundEnabled(request())).toBe(false);
  });
});

describe("2. the routed model", () => {
  it("SELECT STAYS ON SONNET WHILE THE WRITE STEP USES HAIKU", async () => {
    // WhatsApp routes Haiku for short copy. Select must not follow it:
    // a cheap miss there deletes a true claim, and 0-of-34 wrongly
    // removed was the number S1 fought hardest for.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Lavender candle ab available. ₹999." })),
      tool("report_claims", { claims: [] }),
    );
    await generateCopy(request());
    expect(sent[0].model).toBe(CLAUDE_MODELS.standard);
    expect(sent[1].model).toBe(CLAUDE_MODELS.fast);
  });

  it("and the extractor stays cheap, as it always was", async () => {
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Lavender candle ab available." })),
      tool("report_claims", { claims: [] }),
    );
    await generateCopy(request());
    expect(sent[2].model).toBe(CLAUDE_MODELS.fast);
  });
});

describe("3. the opt-out line", () => {
  it("IS ADDED AFTER THE DOOR, so no check can drop it", () => {
    // The property that makes this safe, asserted rather than assumed:
    // the agent calls addWhatsappOptOut on the door's OUTPUT.
    const src = code("src/lib/agents/whatsappMarketingAgent.ts");
    expect(src).toMatch(/output: addWhatsappOptOut\(taskKey, copy\.output\)/);
  });

  it("SURVIVES EVEN WHEN THE VERIFIER EMPTIES THE MESSAGE", () => {
    // The worst case: every sentence removed. Meta still requires the
    // line, so it must be there on an empty message too.
    expect(addWhatsappOptOut("broadcast", { message: "" }).message).toBe("");
    const stripped = addWhatsappOptOut("broadcast", { message: "Available now." });
    expect(stripped.message).toContain(WHATSAPP_OPT_OUT);
  });

  it("is not added twice when the model wrote it itself", () => {
    const already = addWhatsappOptOut("broadcast", { message: `Available now.\n\n${WHATSAPP_OPT_OUT}` });
    expect(already.message.match(/Reply STOP/g)).toHaveLength(1);
  });

  it("IF A MODEL WRITES IT, ITS OWN SHAPE PROTECTS IT — not the vocabulary", async () => {
    // I added the channel rules to the allowed vocabulary expecting
    // that to be what saved this line, and a surviving mutation showed
    // it is not: "Reply" is sentence-initial and so skipped, and "STOP"
    // is all-caps, which the name pattern (upper then lower) never
    // matches. The line is safe either way.
    //
    // Recorded rather than dressed up as a fix. The channel rules stay
    // in the vocabulary for OTHER channels' required furniture, and
    // that is all they do here.
    const { introducedWords } = await import("@/lib/content/introducedWords");
    expect(introducedWords([WHATSAPP_OPT_OUT], [`Keep it short. End with "${WHATSAPP_OPT_OUT}"`])).toEqual([]);
    expect(introducedWords([WHATSAPP_OPT_OUT], ["A Business"])).toEqual([]);
  });

  it("the channel rules are in the vocabulary, for furniture that is not so lucky", () => {
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/req\.brief\.channelRules \?\? ""/);
    // A Title-Cased required line would NOT be safe by its shape, which
    // is what the vocabulary is actually for. sourceWithComments
    // because the reason IS a comment — CLAUDE.md rule 8.
    expect(sourceWithComments("src/lib/content/generateCopy.ts")).toMatch(/required furniture/);
  });
});

describe("4. a short message is where a false refusal hurts most", () => {
  it("A BROADCAST WITH NOTHING APPROVED SAYS NOTHING FACTUAL", async () => {
    // Two or three sentences is the whole message, so the "do not fill
    // the gap" branch matters more here than in an email.
    const sent = script(
      await selectPicking([]),
      prose(JSON.stringify({ message: "Hum yahan hain. Poochh lo." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(JSON.stringify(sent[1])).toMatch(/NO FACT WAS APPROVED FOR THIS PIECE/);
    expect(r.output.message).toMatch(/Hum yahan hain/);
  });

  it("a true recorded claim survives the whole pipeline", async () => {
    const { contextFromFacts } = await import("@/lib/facts/getContext");
    const ctx = contextFromFacts("biz_1", FACTS, { kind: "whatsapp", topic: "broadcast about the lavender candle" });
    const priceId = ctx.records.find((r) => r.key === "product.lavender_candle.price")!.id;
    const sent = script(
      tool("select_claims", {
        claims: [{ id: "c1", claimType: "price", factIds: [priceId], intent: "the candle is ₹999", value: 999, unit: "inr", aboutProduct: "Lavender candle" }],
        conflicts: [],
        unknowns: [],
      }),
      prose(JSON.stringify({ message: "Lavender candle ₹999 mein." })),
      tool("report_claims", {
        claims: [{ sentenceIndex: 0, canonical: "the lavender candle costs ₹999", claimType: "price", subject: "own_product", polarity: "assert", value: { number: 999, unit: "inr" }, aboutProduct: "Lavender candle" }],
      }),
    );
    const r = await generateCopy(request());
    // The figure is decided by arithmetic, so no judge call is made.
    expect(sent).toHaveLength(3);
    expect(r.output.message).toMatch(/999/);
  });
});

describe("5. a slot or a note never reaches the customer", () => {
  it("THE PLACEHOLDER IS STRIPPED FROM THE MESSAGE THAT GOES OUT", async () => {
    // What dairy-05 actually produced on 20 October 2026, end to end
    // through the real door rather than against the check in isolation.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax only.\nFSSAI: [LICENSE NUMBER NEEDED].\nCannot finalize without: (1) the licence number." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(r.output.message).not.toContain("[LICENSE NUMBER NEEDED]");
    expect(r.output.message).not.toMatch(/Cannot finalize/);
    expect(r.output.message).toContain("Soy wax only.");
    expect(sent).toHaveLength(3);
  });

  it("and the owner is told why, in their own words", async () => {
    script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax only.\nFSSAI: [LICENSE NUMBER NEEDED]." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(JSON.stringify(r)).toMatch(/never filled in/);
  });

  it("THE WRITER IS ALSO TOLD NOT TO WRITE THEM", async () => {
    // Both halves: the prompt stops most of it, the code catches the
    // rest. A rule in a prompt is applied unevenly by definition.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax only." })),
      tool("report_claims", { claims: [] }),
    );
    await generateCopy(request());
    expect(JSON.stringify(sent[1])).toMatch(/Never leave a blank, a bracket or a placeholder/);
    expect(JSON.stringify(sent[1])).toMatch(/never write a note, a question or a list of what you still need/);
  });
});

describe("6. the writer is given the real address, not a hole to leave", () => {
  // candle-09's message ended "Check them out → [link]". Nothing in
  // this codebase fills a merge field in — businessFacts tells the OLD
  // path "the ONLY website address you may use" and claimCheck refuses
  // any other host. The fact-bound prompt carried no link at all, so
  // the writer invented a hole.
  //
  // notCopy strips it, which is right and is not a fix on its own: the
  // message would simply lose its call to action.

  it("THE STORE LINK REACHES THE WRITE STEP", async () => {
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax only. /site/a-business" })),
      tool("report_claims", { claims: [] }),
    );
    await generateCopy(request());
    expect(JSON.stringify(sent[1])).toMatch(/THE ONLY WEB ADDRESS YOU MAY USE: \/site\/a-business/);
    expect(JSON.stringify(sent[1])).toMatch(/never a placeholder, never any other address/);
  });

  it("AND WITH NO LINK ON RECORD IT IS TOLD TO LEAVE NO SPACE FOR ONE", async () => {
    const noLink = { ...FACTS, links: { store: null, products: [], booking: null } } as any;
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax only." })),
      tool("report_claims", { claims: [] }),
    );
    await generateCopy(request({ facts: noLink }));
    expect(JSON.stringify(sent[1])).toMatch(/THERE IS NO WEB ADDRESS ON RECORD/);
    expect(JSON.stringify(sent[1])).not.toMatch(/THE ONLY WEB ADDRESS YOU MAY USE/);
  });

  it("the address is in the allowed vocabulary, so its own words are not read as invented", async () => {
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/req\.facts\?\.links\?\.store \?\? ""/);
  });

  it("A PLACEHOLDER IS STILL STRIPPED, because the prompt is only half of it", async () => {
    const { notCopySentences } = await import("@/lib/content/notCopy");
    expect(notCopySentences(["Check them out → [link]"])).toEqual([{ sentenceIndex: 0, reason: "slot" }]);
    // And the real address is not a slot.
    expect(notCopySentences(["Check them out → /site/a-business"])).toEqual([]);
    expect(notCopySentences(["Order at https://hawlai.online/site/a-business"])).toEqual([]);
  });
});
