// The provenance rule reaches real copy, not just its own unit tests.
//
// WHY THIS FILE IS SEPARATE from narrativeProvenance.test.ts: that one
// proves the rule. This one proves the WIRING, and the wiring is where
// this product has gone wrong before — finding F-16 was that every
// protection lived inside a generator, so each new path started
// unguarded and nobody noticed until something went out.
//
// So the rule is wired into guardOrMark, the single place all eight
// generators already pass through, and into the chat's own prose, which
// reaches no generator at all.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { guardOrMark } from "@/lib/claims/factsGate";
import { guardNarrative } from "@/lib/claims/narrativeProvenance";
import { checkReplyClaims } from "@/lib/chat/replyClaims";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Test Business",
    category: "home fragrance",
    categoryKnown: true,
    city: "Lucknow",
    ownerFacts: [
      { category: "business_story", title: "The mistake I learnt from", content: "Ek baar poora batch kharab kiya tha. Ab 24 ghante cure karti hoon." },
    ],
    products: [{ name: "Lavender jar", description: "Soy wax, 200g", price: 450 }],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: null, products: [] },
    brand: {} as any,
    last30: {} as any,
    allTime: {} as any,
    businessModels: { models: [], inferred: false },
    shipping: null,
    ...over,
  } as unknown as BusinessFacts;
}

const INVENTED = "We started this in a tiny kitchen with one borrowed saucepan.";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guardOrMark runs it, so every generator gets it", () => {
  it("AN INVENTED FOUNDING STORY IS WITHHELD FROM A GENERATED PIECE", async () => {
    const r = guardOrMark({ text: INVENTED }, facts(), "publish");
    expect(r.narrative).toHaveLength(1);
    expect((r.output as any).text).toBe("");
    expect((r.output as any)._claimsNote).toMatch(/nothing in your records says it/);
  });

  it("and the honest part of the same piece survives", () => {
    const r = guardOrMark({ text: `Lavender jar, 200g. ${INVENTED} Soy wax.` }, facts(), "publish");
    expect((r.output as any).text).toContain("Lavender jar, 200g.");
    expect((r.output as any).text).toContain("Soy wax.");
    expect((r.output as any).text).not.toContain("borrowed saucepan");
  });

  it("the owner's OWN recorded story passes through the gate untouched", () => {
    // The floor. If this ever fails, the guard is deleting the owner's
    // real words and must come out.
    const real = "Ek baar poora batch kharab kiya tha — ab 24 ghante cure karti hoon.";
    const r = guardOrMark({ text: real }, facts(), "publish");
    expect(r.narrative).toHaveLength(0);
    expect((r.output as any).text).toBe(real);
  });

  it("IT ALSO RUNS WHEN THE RECORDS COULD NOT BE READ", () => {
    // F-01's exact mistake was `facts ? guard() : skip`. Both branches of
    // guardOrMark have to carry this, or a transient read error turns it
    // off — which is the moment it matters most.
    const r = guardOrMark({ text: INVENTED }, null, "publish");
    expect(r.state).toBe("FACTS_UNAVAILABLE");
    expect(r.narrative).toHaveLength(1);
    expect((r.output as any).text).toBe("");
  });

  it("a draft keeps the sentence and names it; a publish loses it", () => {
    const draft = guardOrMark({ text: INVENTED }, facts(), "draft");
    const publish = guardOrMark({ text: INVENTED }, facts(), "publish");
    expect((draft.output as any).text).toBe(INVENTED);
    expect((publish.output as any).text).toBe("");
    expect(draft.narrative).toHaveLength(1);
  });

  it("the note joins the claims note rather than replacing it", () => {
    // Two separate findings must not silently overwrite each other's
    // explanation — the owner needs both.
    const r = guardOrMark(
      { text: `Rated 4.9 by 200 customers. ${INVENTED}` },
      facts(),
      "publish"
    );
    const note = String((r.output as any)._claimsNote ?? "");
    // BOTH explanations, named. A mutation that replaced the claims note
    // with the story note was caught only by the type-checker, which is
    // luck rather than a test — asserting the length proved nothing.
    expect(note).toMatch(/star rating/);
    expect(note).toMatch(/nothing in your records says it/);
  });
});

describe("it walks a whole generated object, not one string", () => {
  it("EVERY FIELD IS CHECKED, however deep", () => {
    const piece = {
      headline: "Lavender jar",
      sections: [{ body: INVENTED }, { body: "Soy wax, 200g." }],
    };
    const r = guardNarrative(piece, facts(), "publish");
    expect(r.findings).toHaveLength(1);
    // The item whose only text was the invented story goes with it.
    expect(r.output.sections).toHaveLength(1);
    expect(r.output.sections[0].body).toBe("Soy wax, 200g.");
  });

  it("Hawlai's own notes are not treated as copy", () => {
    // A `_` field is Hawlai talking to itself. Checking it would mean a
    // note about a withheld story could itself be withheld.
    const r = guardNarrative({ text: "Lavender jar.", _storyNote: INVENTED }, facts(), "publish");
    expect(r.findings).toHaveLength(0);
    expect((r.output as any)._storyNote).toBe(INVENTED);
  });
});

describe("the chat's own prose (4.10)", () => {
  // A caption the model writes in its own reply never reaches a
  // generator, so guardOrMark never sees it. Everything else in
  // checkReplyClaims checks FACTS, and an invented story carries no fact
  // to check.
  it("AN INVENTED STORY IN A CHAT REPLY IS NAMED", () => {
    const r = checkReplyClaims(`Here's a caption. ${INVENTED}`, facts());
    expect(r.note).toMatch(/nothing in your records says it/);
  });

  it("but it is NOT deleted — this is a conversation", () => {
    // Silently removing half an explanation reads as a bug. Draft mode
    // keeps the words and says what cannot be backed up.
    const r = checkReplyClaims(`Here's a caption. ${INVENTED}`, facts());
    expect(r.reply).toContain("borrowed saucepan");
    expect(r.note).toMatch(/can't back up/);
  });

  it("an invented customer quote in a reply is named too", () => {
    const r = checkReplyClaims("One customer told us it changed her evenings.", facts());
    expect(r.note).toMatch(/customer/);
  });

  it("IT STILL RUNS WHEN THE FACTS COULD NOT BE READ", () => {
    const r = checkReplyClaims(INVENTED, null);
    expect(r.note).toMatch(/nothing in your records says it/);
  });

  it("ordinary advice is left completely alone", () => {
    // The commonest false positive to fear: chat talking shop.
    const plain = "I'd lead with the 200g jar and put the price in the first line.";
    const r = checkReplyClaims(plain, facts());
    expect(r.reply).toBe(plain);
    expect(r.note).toBeNull();
  });

  it("the owner's own recorded story is quotable back to them", () => {
    const r = checkReplyClaims("Ek baar poora batch kharab kiya tha — that's the detail I'd use.", facts());
    expect(r.note).toBeNull();
  });

  it("A CLAIMS NOTE AND A STORY NOTE BOTH SURVIVE", () => {
    // Before this, the claims branch returned early and the story note
    // was dropped on the floor.
    const r = checkReplyClaims(`Rated 4.9 by 200 customers. ${INVENTED}`, facts());
    expect(r.note).toMatch(/left out of that reply/);
    expect(r.note).toMatch(/nothing in your records says it/);
  });

  it("an empty reply is not narrative", () => {
    expect(checkReplyClaims("", facts()).note).toBeNull();
    expect(checkReplyClaims("   ", facts()).note).toBeNull();
  });
});
