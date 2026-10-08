// FACTS_AVAILABLE or FACTS_UNAVAILABLE, and never a third silent state.
//
// Phase 1 of the AI quality audit: F-01, F-02, F-03, F-15, F-22.
//
// The shape of all five is the same. Every protection in this codebase
// lives inside a generator and needs the canonical facts to work, so
// every generator was written as `facts ? guard(...) : return output`.
// One transient failure in gatherBusinessFactsSafely therefore turned
// the whole layer off — silently, with no note and no marker — and the
// surfaces that never received facts at all (the chat's own prose,
// Social Management, the website widget) were in that state permanently.
//
// What is pinned here, in the order the audit numbered it.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api,
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : (tables[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? tables[table] ?? [] : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

/** candle_by_qaaf: ₹550 candle, ₹60 flat shipping, no offers, no orders. */
const CANDLE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [], is_active: true, order_index: 0 }],
  discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
  business_knowledge: [],
  brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: [] }],
  content_pieces: [], social_management_items: [],
});

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));
vi.mock("@/lib/knowledge/retrieveKnowledge", () => ({ retrieveRelevantKnowledge: async () => [] }));

import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { factsState, truthBlock, guardOrMark, FACTS_UNAVAILABLE_BRIEF, safeToAutoPublish } from "@/lib/claims/factsGate";
import { findUnverifiableClaims, stripUnverifiable } from "@/lib/claims/claimCheck";
import { checkReplyClaims } from "@/lib/chat/replyClaims";

/** Anthropic answering with each payload in turn; returns the prompts it was sent. */
function anthropic(payloads: unknown[]) {
  const sent: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: any) => {
      const body = JSON.parse(init.body);
      sent.push(body);
      const reply = payloads[Math.min(sent.length - 1, payloads.length - 1)];
      const content = [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }];
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ content }),
        json: async () => ({ content }),
        headers: { get: () => null },
      };
    })
  );
  return sent;
}

beforeEach(() => {
  tables = CANDLE();
  vi.unstubAllGlobals();
});

const facts = () => gatherBusinessFacts(db(), "d1");

// ---------------------------------------------------------------------
// F-01 — the two states, and nothing in between.
// ---------------------------------------------------------------------

describe("F-01: the facts are available or they are not", () => {
  it("the state is named, not inferred from a falsy check at each call site", async () => {
    expect(factsState(await facts())).toBe("FACTS_AVAILABLE");
    expect(factsState(null)).toBe("FACTS_UNAVAILABLE");
    expect(factsState(undefined)).toBe("FACTS_UNAVAILABLE");
  });

  it("THE TRUTH RULES DO NOT DEPEND ON THE FACTS", () => {
    // They are a static string. Nothing in them becomes acceptable
    // because a database read failed — which is exactly what used to
    // happen, because they were interpolated behind `facts ?`.
    const withFacts = truthBlock(null);
    expect(withFacts).toMatch(/NEVER invent numbers/);
    expect(withFacts).toMatch(/NEVER write an offer, discount, sale price/);
    expect(withFacts).toMatch(/NEVER invent an email address, phone number/);
  });

  it("and the absence is STATED, not left as an empty string", () => {
    const block = truthBlock(null);
    expect(block).toContain(FACTS_UNAVAILABLE_BRIEF);
    expect(block).toMatch(/NONE AVAILABLE RIGHT NOW/);
    // A statement about Hawlai, not about the business: "could not be
    // read" is true; "has no products" would be invented.
    expect(block).toMatch(/could not be read/);
    expect(block).not.toMatch(/has no products/);
  });

  it("no substitute facts are invented", () => {
    const block = truthBlock(null);
    // No fabricated counts, prices or catalogue.
    expect(block).not.toMatch(/0 paid order/);
    expect(block).not.toMatch(/₹0/);
  });

  it("CLAIM CHECKING IS NOT BYPASSED: the fact-independent rules still run", () => {
    // With nothing on record, a count is unsupported BY DEFINITION —
    // the records are what could have excused it.
    const r = guardOrMark({ text: "Loved by 500+ homes! India's best candles. Guaranteed results." }, null, "draft");
    expect(r.state).toBe("FACTS_UNAVAILABLE");
    expect(r.removed.length).toBeGreaterThanOrEqual(2);
    expect(r.removed.join(" ")).toMatch(/500\+ homes/);
    expect(r.output.text).toBe("");
  });

  it("a price is reported as unverifiable, never deleted", () => {
    // Deleting a CORRECT price would be its own kind of wrong, and with
    // no records we cannot tell which it is.
    const r = guardOrMark({ text: "The Lavender candle is ₹550." }, null, "draft");
    expect(r.output.text).toContain("₹550");
    expect(r.unverifiable).toContain("a price");
    expect(r.output._unverified).toContain("a price");
  });

  it("the note says nothing was checked, and does not read as a clean check", () => {
    const r = guardOrMark({ text: "Loved by 500+ homes!" }, null, "draft");
    expect(r.output._claimsNote).toMatch(/couldn't read your store records/);
    expect(r.output._claimsNote).toMatch(/nothing in it has been checked/);
    // "Hawlai removed a line" is the note for a REAL check and must not
    // appear here — it would imply the remainder was verified.
    expect(r.output._claimsNote).not.toMatch(/Hawlai removed/);
  });

  it("UNSUPPORTED CLAIMS CANNOT BECOME VERIFIED OUTPUT", async () => {
    const unverified = guardOrMark({ text: "A quiet evening, bottled." }, null, "draft");
    const verified = guardOrMark({ text: "A quiet evening, bottled." }, await facts(), "draft");
    expect(safeToAutoPublish(unverified.output)).toBe(false);
    expect(safeToAutoPublish(verified.output)).toBe(true);
    expect(unverified.output._factsState).toBe("FACTS_UNAVAILABLE");
    expect(verified.output._factsState).toBe("FACTS_AVAILABLE");
  });

  it("with facts, the existing guard runs completely unchanged", async () => {
    const f = await facts();
    const r = guardOrMark({ text: "Free shipping on the Lavender candle." }, f, "publish");
    expect(r.state).toBe("FACTS_AVAILABLE");
    // ₹60 flat — the existing shipping rule, not a new one.
    expect(r.removed.join(" ")).toMatch(/free shipping/i);
    expect(r.unverifiable).toEqual([]);
  });

  it("the fact-independent layer is a SUBSET: honest copy survives it", () => {
    for (const line of [
      "A quiet room, a small flame, nothing else.",
      "Hand-poured soy wax, lit at dusk.",
      "Lavender, poured into glass.",
    ]) {
      expect(findUnverifiableClaims(line).removed, line).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------
// F-02 — the chat's own sentences.
// ---------------------------------------------------------------------

describe("F-02: the chat's prose is checked like any other copy", () => {
  it("MULTIPLE UNSUPPORTED CLAIMS IN ONE REPLY ARE ALL CAUGHT", async () => {
    const reply = [
      "Here's what I'd lead with.",
      "You're loved by 500+ homes, which is your strongest proof.",
      "Your soy wax burns cleaner than paraffin.",
      "I'd also say results are guaranteed.",
    ].join(" ");
    const r = checkReplyClaims(reply, await facts());
    expect(r.removed.length).toBeGreaterThanOrEqual(3);
    expect(r.removed.join(" ")).toMatch(/500\+ homes/);
    expect(r.removed.join(" ")).toMatch(/cleaner/);
    expect(r.removed.join(" ")).toMatch(/[Gg]uaranteed/);
    // The withheld sentences are gone from what the owner reads.
    expect(r.reply).not.toMatch(/500\+ homes/);
    expect(r.reply).not.toMatch(/guaranteed/i);
    // The useful conversational line survives.
    expect(r.reply).toMatch(/Here's what I'd lead with/);
  });

  it("the note names what went and does not imply the rest is verified", async () => {
    const r = checkReplyClaims("You're rated 5 stars by customers.", await facts());
    expect(r.note).toMatch(/left out of that reply/);
    expect(r.note).toMatch(/add it to Business Knowledge/);
    expect(r.note).not.toMatch(/verified/i);
    expect(r.note).not.toMatch(/everything else/i);
  });

  it("ORDINARY CONVERSATION IS NOT TOUCHED, and gets no note", async () => {
    const f = await facts();
    for (const ordinary of [
      "Want me to write three captions for the Lavender candle?",
      "That reads well. I'd shorten the second line.",
      "Which city are you selling in?",
      "I can draft it now — it'll take a moment.",
    ]) {
      const r = checkReplyClaims(ordinary, f);
      expect(r.reply, ordinary).toBe(ordinary);
      expect(r.note, ordinary).toBeNull();
    }
  });

  it("A CLAIM THE CHAT IS QUOTING IS NOT A CLAIM THE CHAT IS MAKING", async () => {
    // The product deliberately explains its own refusals. Checking that
    // explanation and deleting it would be the opposite of the intent.
    const refusal = `I can't put "India's best candles" on your site — nothing on record backs it.`;
    const r = checkReplyClaims(refusal, await facts());
    expect(r.reply).toBe(refusal);
    expect(r.note).toBeNull();
  });

  it("an apostrophe does not open a quote that swallows the paragraph", async () => {
    const r = checkReplyClaims("The owner's note says you're loved by 500+ homes.", await facts());
    expect(r.removed.join(" ")).toMatch(/500\+ homes/);
  });

  it("with no facts, the prose still gets the fact-independent check", () => {
    const r = checkReplyClaims("You're loved by 500+ homes.", null);
    expect(r.removed.join(" ")).toMatch(/500\+ homes/);
    expect(r.note).toMatch(/left out/);
  });

  it("THE WIRING: a claim typed straight into the chat reply is caught end to end", async () => {
    // The tests above exercise the module. This one proves it is
    // actually ON the reply path — a mutation that removed the call from
    // masterBrainV2 passed every other test in this file.
    const { runMasterBrainChat } = await import("@/lib/agents/masterBrainV2");
    anthropic(["Nice idea. You're loved by 500+ homes, so I'd lead with that."]);
    const { reply } = await runMasterBrainChat(db(), "d1", [], "what should I lead with?");
    // Split at the warning: the note deliberately QUOTES the claim it
    // took out, so the assertion is about the prose above it.
    const [prose, warning] = reply.split("⚠️");
    expect(prose).not.toMatch(/500\+ homes/);
    expect(warning).toMatch(/left out of that reply/);
    expect(warning).toMatch(/500\+ homes/);
    // The conversational half survives.
    expect(prose).toMatch(/Nice idea/);
  });

  it("THE WIRING: an ordinary reply comes back word for word", async () => {
    const { runMasterBrainChat } = await import("@/lib/agents/masterBrainV2");
    const plain = "Want me to write three captions for the Lavender candle?";
    anthropic([plain]);
    const { reply } = await runMasterBrainChat(db(), "d1", [], "ideas?");
    expect(reply).toBe(plain);
  });
});

// ---------------------------------------------------------------------
// F-03 — Social Management.
// ---------------------------------------------------------------------

describe("F-03: Social Management gets the facts and the guard", () => {
  it("A FABRICATED OFFER DOES NOT SURVIVE AS CUSTOMER-FACING COPY", async () => {
    const { generateSocialTask } = await import("@/lib/agents/socialManagementAgent");
    anthropic([{ replies: ["Get free shipping today!", "Thanks for asking — it's ₹550."] }]);
    const r = await generateSocialTask(
      "reply_suggestions",
      "candle_by_qaaf",
      "Home fragrance",
      "how much is the candle?",
      { tone_of_voice: "warm" },
      undefined,
      null,
      undefined,
      await facts()
    );
    // ₹60 flat shipping — the existing shipping rule. Asserted on the
    // REPLIES, not the whole result: `_claimsNote` names the claim it
    // took out, which is the point of the note.
    expect(JSON.stringify((r.output as any).replies)).not.toMatch(/free shipping/i);
    expect(r.claimsRemoved?.join(" ")).toMatch(/free shipping/i);
    expect((r.output as any)._claimsNote).toMatch(/Hawlai removed/);
  });

  it("and the prompt carries the facts and the truth rules", async () => {
    const { generateSocialTask } = await import("@/lib/agents/socialManagementAgent");
    const sent = anthropic([{ replies: ["Sure — ₹550."] }]);
    await generateSocialTask("reply_suggestions", "candle_by_qaaf", "Home fragrance", "price?", null, undefined, null, undefined, await facts());
    const prompt = sent[0].messages[0].content;
    expect(prompt).toMatch(/Lavender candle/);
    expect(prompt).toMatch(/NEVER invent numbers/);
    expect(prompt).toMatch(/Shipping:/);
  });

  it("with no facts it fails closed rather than silently skipping", async () => {
    const { generateSocialTask } = await import("@/lib/agents/socialManagementAgent");
    const sent = anthropic([{ replies: ["Loved by 500+ homes!"] }]);
    const r = await generateSocialTask("reply_suggestions", "candle_by_qaaf", "Home fragrance", "price?", null, undefined, null, undefined, null);
    expect(sent[0].messages[0].content).toMatch(/NEVER invent numbers/);
    expect(r.output._factsState).toBe("FACTS_UNAVAILABLE");
    expect(r.claimsRemoved?.join(" ")).toMatch(/500\+ homes/);
  });

  it("ADVICE TO THE OWNER IS NOT COPY, and is left as written", async () => {
    // "Post three times a week" is not a claim about the business, and
    // running the copy guard over a growth plan would strip guidance.
    const { generateSocialTask } = await import("@/lib/agents/socialManagementAgent");
    const plan = { tactics: [{ tactic: "Post 3x a week", howTo: "Batch on Sunday" }] };
    anthropic([plan]);
    const r = await generateSocialTask("growth_strategy", "candle_by_qaaf", "Home fragrance", "", null, undefined, null, undefined, await facts());
    expect(r.output).toEqual(plan);
    expect(r.output._factsState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// F-15 — the website chat widget.
// ---------------------------------------------------------------------

describe("F-15: the widget answers visitors from the real facts", () => {
  const ctx = (f: any) => ({
    dealershipName: "candle_by_qaaf",
    city: "Lucknow",
    businessCategory: "Home fragrance",
    toneOfVoice: "warm",
    hasBookingLink: false,
    facts: f,
  });

  it("THE REAL PRICE IS IN THE PROMPT, so it can answer the question it was asked", async () => {
    const { runSalesAgentTurn } = await import("@/lib/agents/chatbotAgent");
    const sent = anthropic([{ reply: "The Lavender candle is ₹550.", leadCapture: null, suggestBooking: false }]);
    const r = await runSalesAgentTurn(ctx(await facts()), [], "How much does this cost?");
    expect(sent[0].system).toMatch(/Lavender candle/);
    expect(sent[0].system).toMatch(/550/);
    expect(r.reply).toContain("₹550");
  });

  it("A FABRICATED DISCOUNT IS WITHHELD FROM THE VISITOR", async () => {
    // There is nobody to show a claims note to here — the reader is a
    // customer. So it has to not reach them.
    const { runSalesAgentTurn } = await import("@/lib/agents/chatbotAgent");
    anthropic([{ reply: "It's ₹550, and we're currently 20% off! Grab it today.", leadCapture: null, suggestBooking: false }]);
    const r = await runSalesAgentTurn(ctx(await facts()), [], "any discount?");
    expect(r.reply).not.toMatch(/20%/);
    expect(r.reply).not.toMatch(/off/i);
  });

  it("a reply emptied by the check becomes the honest hand-off, not a blank bubble", async () => {
    const { runSalesAgentTurn } = await import("@/lib/agents/chatbotAgent");
    anthropic([{ reply: "We're rated 5 stars by 500+ happy customers!", leadCapture: null, suggestBooking: false }]);
    const r = await runSalesAgentTurn(ctx(await facts()), [], "are you any good?");
    expect(r.reply).not.toMatch(/500\+/);
    expect(r.reply).toMatch(/leave your name and number/);
  });

  it("THE VISITOR IS NOT TOLD THE BUSINESS'S INTERNAL NUMBERS", async () => {
    const { runSalesAgentTurn } = await import("@/lib/agents/chatbotAgent");
    const sent = anthropic([{ reply: "Sure.", leadCapture: null, suggestBooking: false }]);
    await runSalesAgentTurn(ctx(await facts()), [], "hi");
    // The owner's draft prompts carry "Track record: N paid order(s)".
    // A visitor-facing prompt must not.
    expect(sent[0].system).not.toMatch(/Track record/);
    expect(sent[0].system).not.toMatch(/paid order\(s\)/);
    // It must still be told there is nothing to quote.
    expect(sent[0].system).toMatch(/No ratings, reviews or customer counts are on record/);
  });

  it("A CUSTOMER'S PRIVATE STORY IS NOT REPEATED TO STRANGERS", async () => {
    const { runSalesAgentTurn } = await import("@/lib/agents/chatbotAgent");
    const sent = anthropic([{ reply: "Sure.", leadCapture: null, suggestBooking: false }]);
    await runSalesAgentTurn(
      {
        ...ctx(await facts()),
        knowledgeFacts: [
          { category: "story", title: "A customer wrote", content: "Her husband had been in an accident and she lit a candle through the waiting at the hospital." },
          { category: "story", title: "How it started", content: "I poured the first batch in my kitchen in 2023." },
        ],
      },
      [],
      "tell me about you"
    );
    expect(sent[0].system).not.toMatch(/hospital/);
    expect(sent[0].system).not.toMatch(/accident/);
    // The owner's own story is fine.
    expect(sent[0].system).toMatch(/poured the first batch/);
  });

  it("with no facts it still carries the truth rules", async () => {
    const { runSalesAgentTurn } = await import("@/lib/agents/chatbotAgent");
    const sent = anthropic([{ reply: "Let me check for you.", leadCapture: null, suggestBooking: false }]);
    await runSalesAgentTurn(ctx(null), [], "price?");
    expect(sent[0].system).toMatch(/NEVER invent numbers/);
    expect(sent[0].system).toMatch(/NONE AVAILABLE RIGHT NOW/);
  });
});

// ---------------------------------------------------------------------
// F-22 — a reply that could not be read.
// ---------------------------------------------------------------------

describe("F-22: malformed model output is an error, not a draft", () => {
  it("the parser's own account travels out of the generator", async () => {
    const { generateContent } = await import("@/lib/agents/contentMarketingAgent");
    // Prose where JSON was required.
    anthropic(["Sure! Here's a lovely caption for you to use."]);
    const r = await generateContent("instagram_post", "candle_by_qaaf", "Home fragrance", "lavender", null, undefined, undefined, await facts());
    expect(r._fallback).toBe(true);
    expect((r as any)._malformed).toBe(true);
    expect((r as any)._cause).toBeTruthy();
    expect((r as any)._detail).toBeTruthy();
  });

  it("NO ARTIFACT, NO SAVE, NO APPROVAL OBJECT reaches the chat", async () => {
    const { executeTool, extractArtifact } = await import("@/lib/agents/masterBrainV2");
    anthropic(["Sure! Here's a lovely caption for you to use."]);
    const result = await executeTool(
      db(),
      { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [], facts: await facts() } as any,
      "generate_content",
      { contentType: "instagram_post", topic: "lavender" },
      ""
    );
    // A structured error, by the existing convention.
    expect(result.error).toBeTruthy();
    expect(result._savedId).toBeUndefined();
    // Nothing that could be mistaken for a finished piece.
    expect(result.output).toBeUndefined();
    expect(result._destinations).toBeUndefined();
    // And extractArtifact builds nothing from it, so there is no card
    // and no publish action pointing at an apology sentence.
    const artifact = extractArtifact("generate_content", { contentType: "instagram_post" }, result);
    expect(artifact?.publish).toBeUndefined();
  });

  it("nothing was written to the database", async () => {
    const writes: string[] = [];
    const watched = () => ({
      from: (t: string) => {
        const api: any = {
          select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api,
          not: () => api, is: () => api, in: () => api, ilike: () => api,
          insert: () => (writes.push(t), api),
          update: () => (writes.push(t), api),
          single: async () => ({ data: (tables[t] ?? [])[0] ?? null, error: null }),
          maybeSingle: async () => ({ data: (tables[t] ?? [])[0] ?? null, error: null }),
          then: (res: any, rej: any) => Promise.resolve({ data: tables[t] ?? [], error: null }).then(res, rej),
        };
        return api;
      },
    });
    const { executeTool } = await import("@/lib/agents/masterBrainV2");
    anthropic(["Not JSON at all."]);
    await executeTool(
      watched(),
      { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [], facts: await facts() } as any,
      "generate_content",
      { contentType: "instagram_post", topic: "lavender" },
      ""
    );
    expect(writes).not.toContain("content_pieces");
  });

  it("a readable reply is unaffected", async () => {
    const { executeTool } = await import("@/lib/agents/masterBrainV2");
    anthropic([{ text: "A quiet evening, bottled." }]);
    const result = await executeTool(
      db(),
      { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [], facts: await facts() } as any,
      "generate_content",
      { contentType: "blog_post", topic: "lavender" },
      ""
    );
    expect(result.error).toBeUndefined();
    expect(result.text).toBe("A quiet evening, bottled.");
  });
});
