// DOES A WHATSAPP MESSAGE GO THROUGH THE SAME GUARDS AS A POST?
//
// Asked by the founder on 2026-10-12. Four paths send WhatsApp-shaped
// text, and "they import the door" is not an answer — this session has
// twice found a path that imported a guard and did not reach it. So
// every one is driven here with a store whose shipping is PAID and a
// model that claims it is free.
//
// THE FOUR PATHS, and where each meets the guard:
//
//   1. WhatsApp department / chat   whatsappMarketingAgent.ts:72
//                                   generateCopy -> guardOrMark
//   2. lead "WhatsApp Message"      contentAgent.ts:102
//                                   generateCopy (mode "draft")
//   3. retention message            retentionAgent.ts:62
//   4. DM auto-reply, UNATTENDED    socialManagementAgent.ts:206
//                                   guardGenerated directly, publish mode
//
// And inside the door: generateCopy.ts:332 strips invented keys, :370
// measures customer-first, :399 calls guardOrMark, which calls
// guardGenerated (factsGate.ts:119) and so stripUnsupported.
//
// "Free shipping" on a flat-rate store is the probe because it is
// decided by CHECKOUT, not by text — computeShippingAmount, the same
// function the till uses (shipping.ts:14). A message that promises it
// while the customer is charged at the till is the worst shape
// available: the copy and the money disagree, and the customer finds
// out last.
//
// NOTHING IS SENT. Every path is called directly with a stubbed model.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

let prompts: string[];
function anthropic(...outputs: any[]) {
  const replies = [...outputs];
  const last = outputs[outputs.length - 1];
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    prompts.push(String(JSON.parse(init.body).messages[0].content));
    const next = replies.length ? replies.shift() : last;
    const payload = { content: [{ type: "text", text: JSON.stringify(next) }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
  }));
}

import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { generateFollowUpMessage } from "@/lib/agents/contentAgent";
import { generateRetentionMessage } from "@/lib/agents/retentionAgent";
import { generateAutoReply } from "@/lib/agents/socialManagementAgent";

/** Shipping is FLAT ₹60. Nothing here is free. */
function paidShipping(): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 999, description: "Soy wax, 40 hour burn", images: [] }],
    offers: [], pillars: [], site: null, home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    season: { today: "2026-10-12", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
  } as unknown as BusinessFacts;
}

const LIE = "Lavender candle, 999. Free shipping on every order.";
const LEAD: any = { id: "l1", name: "Ravi", lead_temperature: "warm", status: "new", details: null, budget: null };
const CUSTOMER: any = { id: "c1", name: "Meena", details: null };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("1. the WhatsApp department and the chat", () => {
  it("THE INVENTED FREE SHIPPING IS STRIPPED", async () => {
    anthropic({ message: LIE });
    const r: any = await generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, paidShipping(), "draft");
    // THE MESSAGE, not the whole object. _claimsNote QUOTES the claim it
    // removed - that is the point of the note - so asserting over the
    // stringified output tests the note and not the copy. I made this
    // exact mistake earlier in the session and made it again here.
    expect(r.output.message).not.toMatch(/free shipping/i);
    expect(r.claimsRemoved.join(" ")).toMatch(/free shipping/i);
  });

  it("AND THE REASON NAMES THE REAL SHIPPING", async () => {
    anthropic({ message: LIE });
    const r: any = await generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, paidShipping(), "draft");
    expect(r.claimsRemoved.join(" ")).toMatch(/60/);
  });

  it("the true part of the message survives", async () => {
    anthropic({ message: LIE });
    const r: any = await generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, paidShipping(), "draft");
    expect(JSON.stringify(r.output)).toMatch(/999/);
  });

  it("CUSTOMER-FIRST REACHES THIS PATH TOO", async () => {
    anthropic({ message: "Evenings get loud. Lavender candle, 999." });
    await generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, paidShipping(), "draft");
    expect(prompts[0]).toMatch(/WHO THIS IS FOR: the reader, not the business/);
  });

  it("AND THE OPT-OUT IS ADDED AFTER THE GUARD, not stripped by it", async () => {
    anthropic({ message: "Evenings get loud. Lavender candle, 999." });
    const r: any = await generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, paidShipping(), "draft");
    expect(JSON.stringify(r.output)).toMatch(/Reply STOP/i);
  });
});

describe("2. the lead WhatsApp Message button", () => {
  it("THE INVENTED FREE SHIPPING IS STRIPPED", async () => {
    anthropic({ message: `Hi Ravi. ${LIE}` });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, paidShipping());
    expect(r.message).not.toMatch(/free shipping/i);
    expect((r.claimsRemoved ?? []).join(" ")).toMatch(/free shipping/i);
  });

  it("the lead's name and the real price survive", async () => {
    anthropic({ message: `Hi Ravi. ${LIE}` });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, paidShipping());
    expect(r.message).toMatch(/Ravi/);
    expect(r.message).toMatch(/999/);
  });

  it("WITH NO RECORDS IT IS KEPT — and the owner is TOLD it was not checked", async () => {
    // My first version of this test expected the claim to be removed.
    // It is not, and the code is right: a shipping promise is in
    // NEEDS_THE_STORE, so with the records unreadable it is reported as
    // unverifiable rather than deleted - deleting a possibly-correct
    // one is worse (claimCheck.ts:1150-1157).
    //
    // What WAS wrong: this path returned only the message, so the owner
    // saw "free shipping" with nothing saying it had not been checked.
    anthropic({ message: `Hi Ravi. ${LIE}` });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, null);
    expect(r.factsUnavailable).toBe(true);
    expect(String(r.note ?? "")).toMatch(/couldn't read your store records|not been checked/i);
  });

  it("AND THE NOTE NAMES THE SHIPPING CLAIM AS THE THING TO CHECK", async () => {
    anthropic({ message: `Hi Ravi. ${LIE}` });
    const r: any = await generateFollowUpMessage(LEAD, null, "whatsapp", "Home fragrance", undefined, undefined, null);
    expect(String(r.note ?? "")).toMatch(/free shipping/i);
  });
});

describe("3. the retention message", () => {
  it("THE INVENTED FREE SHIPPING IS STRIPPED", async () => {
    anthropic({ message: `Hi Meena. ${LIE}` });
    const message = await generateRetentionMessage(CUSTOMER, null, "upsell", "Home fragrance", undefined, undefined, paidShipping());
    expect(message).not.toMatch(/free shipping/i);
  });
});

describe("4. the DM auto-reply — unattended, nobody reads it first", () => {
  it("THE INVENTED FREE SHIPPING IS STRIPPED, in publish mode", async () => {
    anthropic({ reply: LIE });
    const r: any = await generateAutoReply("dm", "do you ship free?", "Candle by Qaaf", "Home fragrance", null, undefined, null, null, null, undefined, paidShipping());
    expect(String(r.reply ?? "")).not.toMatch(/free shipping/i);
  });

  it("A PARTIALLY STRIPPED REPLY IS NOT SENT — the bug this test found", async () => {
    // THE REAL ONE. A customer asks "do you ship free?" on a ₹60 flat
    // store. The model answers "Yes! Free shipping on every order."
    // The guard removed the second sentence and SENT THE FIRST - so the
    // customer received "Yes!" as the answer, which is the opposite of
    // the truth, unattended, under the owner's name.
    //
    // Sentence-scoped removal is right for a draft a human reads. On a
    // reply to a direct question it can invert what is left.
    anthropic({ reply: "Yes! Free shipping on every order." });
    const r: any = await generateAutoReply("dm", "do you ship free?", "Candle by Qaaf", "Home fragrance", null, undefined, null, null, null, undefined, paidShipping());
    expect(r.reply).toBeNull();
    expect(String(r.escalate ?? "")).toMatch(/nothing was sent/i);
    expect(r.withheld.join(" ")).toMatch(/free shipping/i);
  });

  it("AND THE EMPTIED CASE STILL ESCALATES, as it always did", async () => {
    anthropic({ reply: "Free shipping on every order." });
    const r: any = await generateAutoReply("dm", "do you ship free?", "Candle by Qaaf", "Home fragrance", null, undefined, null, null, null, undefined, paidShipping());
    expect(r.reply).toBeNull();
  });

  it("AN HONEST REPLY WITH NOTHING REMOVED IS STILL SENT — the cost side", async () => {
    // If this fails, the fix has turned the auto-reply off.
    anthropic({ reply: "The lavender candle is 999, and shipping is 60." });
    const r: any = await generateAutoReply("dm", "how much?", "Candle by Qaaf", "Home fragrance", null, undefined, null, null, null, undefined, paidShipping());
    expect(r.reply).toMatch(/999/);
    expect(r.escalate ?? null).toBe(null);
  });

  it("AND WITH NO RECORDS IT DOES NOT REPLY AT ALL", async () => {
    // "Unverified" has nobody to warn on this path, so it fails closed.
    anthropic({ reply: "Yes, we ship free." });
    const r: any = await generateAutoReply("dm", "do you ship free?", "Candle by Qaaf", "Home fragrance", null, undefined, null, null, null, undefined, null);
    expect(r.reply).toBeNull();
  });
});

describe("5. an ALWAYS FREE store may say it on WhatsApp too", () => {
  it("THE TRUE CLAIM IS NOT STRIPPED — the cost side", () => {
    // If this fails, the fix has over-corrected and an honest store has
    // been silenced on its own channel.
    const free = { ...paidShipping(), shipping: { mode: "free", rate: null, freeThreshold: null } } as BusinessFacts;
    return (async () => {
      anthropic({ message: LIE });
      const r: any = await generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "the lavender candle", null, undefined, undefined, free, "draft");
      expect(JSON.stringify(r.output)).toMatch(/free shipping/i);
      expect(r.claimsRemoved).toEqual([]);
    })();
  });
});

describe("6. the boundary: when does a stripped reply still answer?", () => {
  // THE EXISTING DECISION, which my first fix broke and which is right:
  // tests/autoReplyGuard.test.ts:169 requires that the honest half of a
  // mixed answer still reaches the customer. "The rule costs a mixed
  // sentence, not the answer."
  //
  // The narrow difference is whether the SURVIVOR carries substance. A
  // bare yes means whatever the question asked; a survivor naming the
  // product answers the question that was actually asked.
  const ask = (reply: string, question: string) => {
    anthropic({ reply });
    return generateAutoReply("dm", question, "Candle by Qaaf", "Home fragrance", null, undefined, null, null, null, undefined, paidShipping()) as any;
  };

  it("A SURVIVOR WITH SUBSTANCE IS SENT", async () => {
    const r = await ask("Haan, Lavender candle available hai. Free shipping bhi hai!", "available hai?");
    expect(r.reply).toMatch(/available/i);
    expect(r.reply).not.toMatch(/free shipping/i);
  });

  it("A BARE YES IS NOT", async () => {
    const r = await ask("Yes! Free shipping on every order.", "do you ship free?");
    expect(r.reply).toBeNull();
  });

  it("AND NEITHER IS A BARE YES IN HINGLISH", async () => {
    const r = await ask("Haan bilkul! Free shipping hai.", "free shipping hai kya?");
    expect(r.reply).toBeNull();
  });

  it("the escalation quotes what was left, so the owner sees why", async () => {
    const r = await ask("Yes! Free shipping on every order.", "do you ship free?");
    expect(String(r.escalate)).toMatch(/Yes!/);
    expect(String(r.escalate)).toMatch(/nothing was sent/i);
  });

  it("nothing removed, nothing withheld — however short the reply", async () => {
    // A bare "Haan" with NO strip is a fine answer to a yes/no question
    // and must still go: the rule is about a removal, not about length.
    const r = await ask("Haan!", "available hai?");
    expect(r.reply).toBe("Haan!");
  });
});
