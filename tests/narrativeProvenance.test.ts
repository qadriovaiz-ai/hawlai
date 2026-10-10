// A backstory nobody told Hawlai.
//
// Every claim check in src/lib/claims asks "is this FACT on record".
// None asked "is this STORY on record", so a sentence carrying no
// checkable fact could be wholly invented and pass everything.
//
// The two sentences at the top of the first describe block went out
// publicly on 8 October 2026. They are fixtures here, not examples: if
// either stops being caught, this file fails.

import { describe, it, expect } from "vitest";
import {
  checkNarrative,
  narrativeNote,
  recordedText,
  tracesToRecord,
  distinctiveWords,
} from "@/lib/claims/narrativeProvenance";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/**
 * A business whose owner HAS written things down — so an unsupported
 * sentence cannot be excused by "there was nothing to check against".
 */
function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Test Business",
    category: "home fragrance",
    ownerFacts: [
      {
        category: "business_story",
        title: "The mistake I learnt from",
        content: "Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha. Ab 24 ghante cure karti hoon.",
      },
      {
        category: "business_story",
        title: "How we work",
        content: "Wax Kanpur ke supplier se aata hai.",
      },
    ],
    products: [{ name: "Lavender jar", description: "Soy wax, 200g" }],
    offers: [],
    pillars: [],
    site: null,
    brand: {} as any,
    ...over,
  } as unknown as BusinessFacts;
}

const NO_RECORD = facts({ ownerFacts: [], products: [], pillars: [], brand: {} as any });

describe("THE TWO SENTENCES THAT WENT OUT", () => {
  // Neither names a number, a price or a material, so the claims guard
  // had nothing to say about either. That is the gap this closes.
  it("the unnamed-alternative comparison is withheld", () => {
    const r = checkNarrative(
      "If you're used to synthetic candles that fade in an hour, this is something that performs.",
      facts()
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].kind).toBe("comparative");
    expect(r.text).toBe("");
  });

  it("the performance comparison is withheld", () => {
    const r = checkNarrative(
      "It fills the room slowly rather than hitting you at the door.",
      facts()
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].kind).toBe("comparative");
  });

  it("and the sentences around them survive", () => {
    // The point of withholding by sentence: the honest copy is kept.
    const r = checkNarrative(
      "Lavender jar, 200g. If you're used to synthetic candles, this performs. Soy wax.",
      facts()
    );
    expect(r.text).toContain("Lavender jar, 200g.");
    expect(r.text).toContain("Soy wax.");
    expect(r.text).not.toContain("synthetic candles");
  });
});

describe("an invented history", () => {
  it("A FOUNDING STORY WITH NOTHING BEHIND IT IS WITHHELD", () => {
    const r = checkNarrative("We started this in a tiny kitchen with one borrowed saucepan.", facts());
    expect(r.findings[0]?.kind).toBe("history");
    expect(r.text).toBe("");
  });

  it("the owner's OWN recorded story passes untouched", () => {
    // This is the floor. A guard that deletes the owner's real words
    // would be removed within a week, and it would deserve to be.
    const real = "Ek baar jaldi mein poora batch kharab kiya tha — ab 24 ghante cure karti hoon.";
    const r = checkNarrative(real, facts());
    expect(r.findings).toHaveLength(0);
    expect(r.text).toBe(real);
  });

  it("a recorded detail in an English sentence still passes", () => {
    // "Kanpur" is in the records; the sentence is a history and is fine.
    const r = checkNarrative("Years ago we found our wax supplier in Kanpur.", facts());
    expect(r.findings).toHaveLength(0);
  });

  it("a year the business never mentioned is withheld", () => {
    const r = checkNarrative("Back in 2019 the whole thing was a weekend hobby.", facts());
    expect(r.findings[0]?.kind).toBe("history");
  });

  it("A SENTENCE WITH NOTHING DISTINCTIVE IN IT IS NOT SUPPORTED", () => {
    // "It all started here." has no word that could trace to anything,
    // and it is still asserting a history. Treating it as supported
    // because it contains no evidence would be backwards.
    const r = checkNarrative("It all started here.", facts());
    expect(r.findings).toHaveLength(1);
  });
});

describe("words put in a customer's mouth", () => {
  it("AN INVENTED CUSTOMER QUOTE IS WITHHELD", () => {
    const r = checkNarrative("One customer told us it changed her evenings completely.", facts());
    expect(r.findings[0]?.kind).toBe("attributed");
    expect(r.text).toBe("");
  });

  it("a claim about what customers say is withheld", () => {
    expect(checkNarrative("Customers keep asking for this one.", facts()).findings).toHaveLength(1);
    expect(checkNarrative("Everyone says it smells like a real garden.", facts()).findings).toHaveLength(1);
  });

  it("a count-shaped claim about customers is caught here too", () => {
    expect(checkNarrative("Most of our customers buy two at a time.", facts()).findings).toHaveLength(1);
  });

  it("a REAL recorded customer comment passes", () => {
    const withQuote = facts({
      ownerFacts: [
        { category: "business_story", title: "What a customer said", content: "Ek customer ne kaha tha ki khushboo bilkul asli mogra jaisi hai." },
      ] as any,
    });
    const r = checkNarrative("A customer told us the khushboo is like asli mogra.", withQuote);
    expect(r.findings).toHaveLength(0);
  });
});

describe("Hinglish and Hindi, not only English", () => {
  // Hawlai's default register is Hinglish. A pattern list in English
  // only would be a guard that works on the copy this product writes
  // least.
  it("A HINGLISH FOUNDING STORY IS CAUGHT", () => {
    expect(checkNarrative("Humne ye kaam ek chhoti si dukaan se shuru kiya.", facts()).findings).toHaveLength(1);
  });

  it("hinglish attributed speech is caught", () => {
    expect(checkNarrative("Log kehte hain ki isse behtar kuch nahi.", facts()).findings).toHaveLength(1);
  });

  it("a hinglish comparison with nobody named is caught", () => {
    expect(checkNarrative("Doosre brands jaisa nahi hai ye.", facts()).findings).toHaveLength(1);
  });

  it("DEVANAGARI IS CAUGHT TOO", () => {
    expect(checkNarrative("हमारी शुरुआत एक छोटे कमरे से हुई थी।", facts()).findings).toHaveLength(1);
  });
});

describe("what it deliberately does NOT do", () => {
  it("ordinary product copy is left completely alone", () => {
    const plain = "Lavender jar, 200g. Soy wax. 450 rupees. Order on the store page.";
    const r = checkNarrative(plain, facts());
    expect(r.findings).toHaveLength(0);
    expect(r.text).toBe(plain);
  });

  it("a comparison that NAMES what it compares to is not this check's business", () => {
    // Naming paraffin is a material claim, which stripUnsupported reads
    // the record for. Catching it here as well would mean two guards
    // arguing about one sentence.
    const r = checkNarrative("Soy wax rather than paraffin.", facts());
    expect(r.findings).toHaveLength(0);
  });

  it("it does not rewrite a sentence, only drops it whole", () => {
    const r = checkNarrative("We started small. Lavender jar, 200g.", facts());
    expect(r.text).toBe("Lavender jar, 200g.");
  });
});

describe("with no facts at all it fails CLOSED", () => {
  // F-01's lesson: `facts ? guard() : skip` turned the whole layer off on
  // a transient read error. With nothing on record, a story is
  // unsupported BY DEFINITION — the records are what could have excused
  // it.
  it("EVERY NARRATIVE SENTENCE IS WITHHELD WHEN THE RECORDS COULD NOT BE READ", () => {
    expect(checkNarrative("We started in a tiny kitchen.", null).findings).toHaveLength(1);
    expect(checkNarrative("We started in a tiny kitchen.", undefined).findings).toHaveLength(1);
    expect(checkNarrative("We started in a tiny kitchen.", NO_RECORD).findings).toHaveLength(1);
  });

  it("but plain copy with no narrative in it still passes", () => {
    // Fail-closed must not mean fail-everything: this check has one job.
    const r = checkNarrative("Lavender jar, 200g.", null);
    expect(r.findings).toHaveLength(0);
    expect(r.text).toBe("Lavender jar, 200g.");
  });
});

describe("draft mode keeps the sentence and names it", () => {
  it("A DRAFT IS FOR THE OWNER TO FIX, SO NOTHING IS SILENTLY DELETED", () => {
    // Byte-identical, whitespace included. A mutation check found that
    // asserting a trimmed single sentence proved nothing: draft mode
    // keeps every piece, so re-joining them produced the same string and
    // the test passed even with the draft branch removed. The only way
    // to prove the original is returned untouched is to hand it text
    // that re-joining WOULD change.
    const text = "\n  We started this in a tiny kitchen.  \n\n\n  Lavender jar, 200g.  \n";
    const r = checkNarrative(text, facts(), "draft");
    expect(r.text).toBe(text);
    expect(r.findings).toHaveLength(1);
  });

  it("publish mode and draft mode differ, and the note says which happened", () => {
    const text = "We started this in a tiny kitchen.";
    const draft = checkNarrative(text, facts(), "draft");
    const publish = checkNarrative(text, facts(), "publish");
    expect(draft.text).not.toBe(publish.text);
    expect(narrativeNote(draft.findings, "draft")).toMatch(/can't back up/);
    expect(narrativeNote(publish.findings, "publish")).toMatch(/took out/);
  });
});

describe("the note tells the owner what to do", () => {
  it("IT NAMES WHAT TO RECORD, not just what was removed", () => {
    const r = checkNarrative("One customer told us it changed her evenings.", facts());
    const note = narrativeNote(r.findings);
    expect(note).toMatch(/customer/);
    expect(note).toMatch(/Business Knowledge/);
  });

  it("nothing withheld, nothing said", () => {
    expect(narrativeNote([])).toBeNull();
  });

  it("two different kinds read as a list, not a repetition", () => {
    const r = checkNarrative("We started in a kitchen. Customers keep asking for it.", facts());
    const note = narrativeNote(r.findings)!;
    expect(r.findings).toHaveLength(2);
    expect(note).toMatch(/ and /);
  });
});

describe("the parts it is built from", () => {
  it("recordedText reads the catalogue as evidence, and ignores Hawlai's own titles", () => {
    const blob = recordedText(facts());
    expect(blob).toContain("kanpur");
    expect(blob).toContain("lavender jar");
    // "How we work" is the question Hawlai asked, not the owner's words.
    // storyEcho learnt this when a caption passed on the word "work".
    expect(blob).not.toContain("how we work");
  });

  it("no facts means no evidence, not a crash", () => {
    expect(recordedText(null)).toBe("");
    expect(recordedText(undefined)).toBe("");
  });

  it("filler words cannot support a sentence", () => {
    // Without this, "It was with that and this" would trace to any
    // record containing "that".
    expect(distinctiveWords("It was with that and this")).toEqual([]);
    expect(tracesToRecord("It was with that.", "anything at all")).toBe(false);
  });

  it("THE TRIGGER PHRASE IS NOT ITS OWN EVIDENCE", () => {
    // This test found a real hole before it shipped. "started" is a
    // distinctive word, so an owner who had recorded "I started in 2019
    // from home" would have licensed "We started in a tiny kitchen" —
    // on the word "started", with the kitchen invented.
    const startedSomewhere = facts({
      ownerFacts: [{ category: "business_story", title: "Beginning", content: "I started in 2019 from home." }] as any,
      products: [],
    });
    const r = checkNarrative("We started in a tiny kitchen with one borrowed saucepan.", startedSomewhere);
    expect(r.findings).toHaveLength(1);

    // And the rule itself, directly: with the trigger left in, the
    // sentence supports itself; with it removed, it does not.
    const trigger = /\bwe\s+started\b/i;
    expect(tracesToRecord("We started somewhere", "we started in 2019")).toBe(true);
    expect(tracesToRecord("We started somewhere", "we started in 2019", trigger)).toBe(false);
  });

  it("one distinctive word is enough, deliberately", () => {
    // Stated as a test because it is a judgment call, not an accident:
    // stripping a true story is worse than missing an invented one.
    expect(tracesToRecord("Kanpur ke supplier se.", recordedText(facts()))).toBe(true);
  });

  it("an empty string is not narrative", () => {
    expect(checkNarrative("", facts()).findings).toHaveLength(0);
    expect(checkNarrative("   ", facts()).text).toBe("   ");
  });
});

describe("THE OWNER'S OWN HABIT, from the live email", () => {
  // An email that went to a real lead on 10 October 2026 said "we light
  // one at night too". Nobody had told Hawlai that.
  //
  // The patterns before this covered the owner's HISTORY - started,
  // founded, years ago - and missed the present tense entirely, which
  // is the more persuasive form: it says the people who make this use
  // it themselves. A buyer acts on that.
  it("THE LIVE SENTENCE IS CAUGHT", () => {
    const r = checkNarrative("We light one at night too.", facts());
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].kind).toBe("history");
    expect(r.text).toBe("");
  });

  it("and its other forms", () => {
    for (const line of [
      "I use it myself every evening.",
      "We always light one before dinner.",
      "I light one every night.",
      "In our own home we keep two.",
      "Hum bhi raat ko ek jalate hain.",
    ]) {
      expect(checkNarrative(line, facts()).findings, line).toHaveLength(1);
    }
  });

  it("A RECORDED HABIT PASSES — it is the owner's to state", () => {
    const recorded = facts({
      ownerFacts: [
        { category: "business_story", title: "How we test", content: "Hum bhi raat ko ek jalate hain, warna pata nahi chalta." },
      ] as any,
    });
    const r = checkNarrative("Hum bhi raat ko ek jalate hain.", recorded);
    expect(r.findings).toHaveLength(0);
  });

  it("THE PATTERNS ARE TIGHT: ordinary first-person copy is untouched", () => {
    // "We" plus anything is the commonest shape in honest copy. These
    // need a habit MARKER - too, as well, ourselves, always, every
    // night - or they would flag every sentence a business writes about
    // itself.
    for (const line of [
      "We ship within two days.",
      "We make every candle in small batches.",
      "We are open on Sundays.",
      "We deliver across Lucknow.",
      "Order yours today.",
    ]) {
      expect(checkNarrative(line, facts()).findings, line).toHaveLength(0);
    }
  });

  it("the note names it in words the owner can act on", () => {
    const r = checkNarrative("We light one at night too.", facts());
    expect(narrativeNote(r.findings)).toMatch(/something you do yourselves/);
  });
});
