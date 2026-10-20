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
    const request = JSON.parse(init.body);
    sent.push(request);
    // THE SECOND NET ANSWERS ITSELF UNLESS A TEST SAYS OTHERWISE.
    //
    // extractUnlicensable (2026-10-20) added a call to every piece, and
    // scripting it in forty existing tests would have meant renumbering
    // every one of them — turning a change in the pipeline into a
    // change in forty unrelated assertions, where a slip is invisible.
    //
    // So a request for that tool gets an empty, well-formed answer
    // here: the net reports nothing, the piece is unaffected, and the
    // tests that do care about it script it explicitly and are matched
    // first by the loop below.
    const wants = request?.tool_choice?.name;
    const scripted = bodies.find(
      (b: any) => wants && b && Array.isArray((b as any).content) && (b as any).content.some((c: any) => c?.name === wants)
    );
    if (wants === "report_unlicensable" && !scripted) {
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "report_unlicensable", input: { claims: [] } }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return sent;
}
/**
 * The calls that asked for one tool, in order.
 *
 * BY NAME, NOT BY INDEX. The second net runs beside the main
 * extraction in a Promise.all, so a position in `sent` is no longer a
 * stable way to name a step — and it never should have been, since the
 * number of calls is a thing the pipeline is allowed to change.
 */
const asking = (sent: any[], name: string) => sent.filter((c) => c?.tool_choice?.name === name);

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
    expect(asking(sent, "report_claims")[0].model).toBe(CLAUDE_MODELS.fast);
    // And the second net is cheap too — it exists to be cheap.
    expect(asking(sent, "report_unlicensable")[0].model).toBe(CLAUDE_MODELS.fast);
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
    expect(asking(sent, "report_verdicts")).toHaveLength(0);
    expect(asking(sent, "select_claims")).toHaveLength(1);
    expect(asking(sent, "report_claims")).toHaveLength(1);
    expect(asking(sent, "report_unlicensable")).toHaveLength(1);
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
    // The canned extractor here answers with nothing and so does the
    // net, which earns one escalation to Sonnet before the piece would
    // be degraded. Asserted by name: exactly one escalation, never two.
    expect(asking(sent, "report_claims")).toHaveLength(2);
    expect(asking(sent, "report_claims")[1].model).toBe(CLAUDE_MODELS.standard);
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

describe("7. an empty extraction is not a clean one", () => {
  // Run 8, salon-04. The message said "₹3500 mein apke baal soft aur
  // shiny ho jayenge" — a benefit claim, and benefit is unlicensable,
  // so the verifier refuses it with no judge call. Measured afterwards
  // on the exact five sentences the door sent, for 30 paise: the
  // extractor reports it and it IS refused.
  //
  // In the run it was not removed, because the extractor came back with
  // no claims at all. No claims, no verdicts; no verdicts, no removals
  // and no note; and the run printed a clean case and offered itself
  // for grading.
  //
  // F-01 in a new place: silence read as approval.

  it("A ZERO-CLAIM EXTRACTION IS ASKED AGAIN, ON A BETTER MODEL", async () => {
    // The output gate of 2026-10-20 caught the extractor doing two
    // different things with the same case in the same hour: zero claims
    // in run 10, two claims when re-asked minutes later. One cheap call
    // is the single point of failure for the whole verify step, so it
    // gets one escalation before the piece is degraded.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Lavender candle hand-poured hai." })),
      tool("report_claims", { claims: [] }),
      // The second pass, on Sonnet, sees it.
      tool("report_claims", {
        claims: [{ sentenceIndex: 0, canonical: "the candle is hand-poured", claimType: "process", subject: "own_product", polarity: "assert" }],
      }),
      tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the record says hand-poured" }] }),
    );
    const r = await generateCopy(request());
    // Haiku first, then Sonnet for the retry.
    const passes = asking(sent, "report_claims");
    expect(passes).toHaveLength(2);
    expect(passes[0].model).toBe(CLAUDE_MODELS.fast);
    expect(passes[1].model).toBe(CLAUDE_MODELS.standard);
    // And the piece is NOT degraded, because the second pass examined it.
    expect(JSON.stringify(r)).not.toMatch(/found nothing to check/);
    expect(r.output.message).toContain("hand-poured");
  });

  it("IT ONLY FIRES ON A ZERO-CLAIM PASS, never on an ordinary one", async () => {
    // A second call on every piece would double the extraction cost of
    // the whole product. This must stay rare.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Lavender candle hand-poured hai." })),
      tool("report_claims", {
        claims: [{ sentenceIndex: 0, canonical: "the candle is hand-poured", claimType: "process", subject: "own_product", polarity: "assert" }],
      }),
      tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the record says hand-poured" }] }),
    );
    await generateCopy(request());
    // One extraction pass, not two: the escalation did not fire.
    expect(asking(sent, "report_claims")).toHaveLength(1);
    // Sonnet appears once, for Select.
    expect(sent.filter((c: any) => c.model === CLAUDE_MODELS.standard)).toHaveLength(1);
  });

  it("A PIECE WITH APPROVED FACTS AND NO EXTRACTED CLAIMS IS UNVERIFIED", async () => {
    script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Lavender candle hand-poured hai." })),
      // The extractor answers, correctly formed, with nothing in it —
      // twice, because the second pass on Sonnet is now asked before
      // the piece is degraded.
      tool("report_claims", { claims: [] }),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(r.publishable).toBe(false);
    expect(JSON.stringify(r)).toMatch(/found nothing to check/);
    expect(JSON.stringify(r)).toMatch(/marked unverified rather than approved/);
  });

  it("THE COPY STILL STANDS — it is marked, not deleted", async () => {
    // Fail closed means unpublishable, not blank. An owner who loses
    // the text to a transient model answer has lost real work.
    //
    // My first version of this test used "Soy wax only, no cheap
    // paraffin", which the OLD claims guard removed as a claim about
    // other people's products — correctly, and nothing to do with this
    // branch. Recorded because it is a fair reminder that the old guard
    // is still standing behind this one.
    script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Lavender candle hand-poured hai." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(r.output.message).toContain("hand-poured");
  });

  it("but a piece with NOTHING APPROVED is not degraded by an empty extraction", async () => {
    // The branch must not fire on the "no fact was approved" path,
    // where a factless greeting is the correct output and an empty
    // extraction is the honest answer.
    script(
      await selectPicking([]),
      prose(JSON.stringify({ message: "Hum yahan hain. Poochh lo." })),
      tool("report_claims", { claims: [] }),
    );
    const r = await generateCopy(request());
    expect(JSON.stringify(r)).not.toMatch(/found nothing to check/);
  });

  it("and a normal extraction is untouched", async () => {
    const { contextFromFacts } = await import("@/lib/facts/getContext");
    const ctx = contextFromFacts("biz_1", FACTS, { kind: "whatsapp", topic: "broadcast about the lavender candle" });
    const priceId = ctx.records.find((r) => r.key === "product.lavender_candle.price")!.id;
    script(
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
    expect(JSON.stringify(r)).not.toMatch(/found nothing to check/);
    expect(r.output.message).toMatch(/999/);
  });
});

describe("8. the second net, under the four classes nothing can license", () => {
  // salon-04's "₹3500 mein apke baal soft aur shiny ho jayenge" was
  // published by runs 6, 7, 8 and 10. Sent on its own the extractor
  // reports it as `benefit` and the verifier refuses it outright — the
  // rule is right, and the gate proves it for a rupee. In a real
  // five-sentence message among a price, a location and a call to
  // action, the same call at temperature 0 does not mention it.
  //
  // A recall failure on a long instruction. No retry can fix it: the
  // answer is deterministic, so two identical calls are two bills and
  // one answer.
  //
  // extractUnlicensable asks about four classes and nothing else.
  // Measured on the exact batches those four runs shipped: 2 of 2
  // found, 0 of 6 controls disturbed.

  it("A CLAIM THE MAIN PASS MISSES IS STILL REMOVED", async () => {
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax candles.\n₹3500 mein apke baal soft ho jayenge." })),
      // The main pass sees only the honest sentence — the run-10 shape.
      tool("report_claims", {
        claims: [{ sentenceIndex: 0, canonical: "the candles are soy wax", claimType: "material", subject: "own_product", polarity: "assert" }],
      }),
      // The net sees the one it missed.
      tool("report_unlicensable", {
        claims: [{ sentenceIndex: 1, claimType: "benefit", canonical: "the customer's hair will be soft" }],
      }),
      tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the record says soy wax" }] }),
    );
    const r = await generateCopy(request());
    expect(r.output.message).not.toMatch(/baal soft/);
    expect(r.output.message).toContain("Soy wax candles.");
    expect(asking(sent, "report_unlicensable")).toHaveLength(1);
  });

  it("IT RUNS ON THE CHEAP MODEL — that is the whole point of it", async () => {
    // Sonnet for every extraction would also have worked and would
    // have raised the cost of every piece the product writes by about
    // half, to fix a miss in four classes out of fourteen.
    const sent = script(
      await selectPicking([{ id: "c1", claimType: "material", factIds: ["__PARAFFIN__"], intent: "no cheap paraffin wax" }]),
      prose(JSON.stringify({ message: "Soy wax candles." })),
      tool("report_claims", {
        claims: [{ sentenceIndex: 0, canonical: "the candles are soy wax", claimType: "material", subject: "own_product", polarity: "assert" }],
      }),
      tool("report_verdicts", { verdicts: [{ index: 0, entailed: true, why: "the record says soy wax" }] }),
    );
    await generateCopy(request());
    expect(asking(sent, "report_unlicensable")[0].model).toBe(CLAUDE_MODELS.fast);
  });

  it("THE NET FAILING DOES NOT DEGRADE A PIECE THE MAIN PASS READ", async () => {
    // Fail closed applies to the thing that decides. The net is a
    // second look at four classes; losing it is not losing the check.
    let n = 0;
    globalThis.fetch = (async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      n += 1;
      if (request?.tool_choice?.name === "report_unlicensable") {
        return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 });
      }
      const bodies: Record<string, unknown> = {
        select_claims: { claims: [{ id: "c1", claimType: "material", factIds: ["x"], intent: "soy wax" }], conflicts: [], unknowns: [] },
        report_claims: { claims: [] },
        report_verdicts: { verdicts: [] },
      };
      const wants = request?.tool_choice?.name as string | undefined;
      if (wants) {
        return new Response(JSON.stringify({ content: [{ type: "tool_use", name: wants, input: bodies[wants] ?? {} }], usage: { input_tokens: 10, output_tokens: 5 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ message: "Soy wax candles." }) }], usage: { input_tokens: 10, output_tokens: 5 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const r = await generateCopy(request());
    // The copy stands and the main pass's reading is what decided.
    expect(r.output.message).toContain("Soy wax candles.");
    expect(n).toBeGreaterThan(2);
  });

  it("AND THE MAIN PASS FAILING IS NOT RESCUED BY THE NET", async () => {
    // MUTATION M25 SURVIVED MY FIRST VERSION OF THIS TEST, which only
    // grepped the comment that claims the protection. Fixing the test,
    // not the report - CLAUDE.md rule 2.
    //
    // The net reads four claim classes out of fourteen. If it stood in
    // for a failed main pass, a piece could have its benefit claim
    // refused, its other ten classes never looked at, and still read as
    // examined. Unverified is the only honest state.
    globalThis.fetch = (async (_url: any, init: any) => {
      const req2 = JSON.parse(init.body);
      const wants = req2?.tool_choice?.name as string | undefined;
      // The main extraction is the one that fails.
      if (wants === "report_claims") {
        return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 });
      }
      // And the net succeeds, with something in it.
      const inputs: Record<string, unknown> = {
        report_unlicensable: { claims: [{ sentenceIndex: 0, claimType: "benefit", canonical: "the reader will feel better" }] },
        select_claims: { claims: [{ id: "c1", claimType: "material", factIds: ["x"], intent: "soy wax" }], conflicts: [], unknowns: [] },
        report_verdicts: { verdicts: [] },
      };
      if (wants) {
        return new Response(
          JSON.stringify({ content: [{ type: "tool_use", name: wants, input: inputs[wants] ?? {} }], usage: { input_tokens: 10, output_tokens: 5 } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ message: "Soy wax candles." }) }], usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const r = await generateCopy(request());
    expect(r.publishable).toBe(false);
    expect(JSON.stringify(r)).toMatch(/could not be checked against your records/);
  });
});
