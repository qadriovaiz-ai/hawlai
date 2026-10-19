// WORDS THE WRITER BROUGHT THAT NOBODY GAVE IT.
//
// Founder's direction, 19 October 2026: stop patching symptoms. "pure"
// had been caught and re-fixed three times — after "asli" and
// "premium" — and every fix added a word to a list inside a PROMPT. The
// same rule caught "pure desi ghee" in one run and let it through in
// the next, because a prompt rule is applied unevenly by definition.
//
// So the check moved into code, where it runs every time, and it asks a
// structural question rather than consulting a longer list: does this
// word appear in anything the writer was actually given?
//
// Two classes can be decided by looking:
//   intensifier  a quality, purity or degree booster
//   name         a capitalised word the writer introduced — "Indore"
//                survived three times in one run with NO location record
//                anywhere in the context

import { describe, it, expect } from "vitest";
import { introducedWords, introducedNote } from "@/lib/content/introducedWords";
import { code, sourceWithComments } from "./helpers/source";

/** What a dairy's writer legitimately has in front of it. */
const ALLOWED = [
  "the ghee is made by the bilona method",
  "business.city the business is in Indore Indore",
  "Desi ghee 500ml = 850",
  "Shree Dairy",
  "Dairy and foods",
  "welcome email for the desi ghee",
];

describe("an intensifier nothing on record accounts for", () => {
  it("CATCHES \"pure\" — the third time it has had to be caught", () => {
    const found = introducedWords(["We make pure clarified butter."], ALLOWED);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ sentenceIndex: 0, word: "pure", kind: "intensifier" });
  });

  it("AND CATCHES THE ONES NOBODY HAS ADDED YET", () => {
    // The point of the change: a fourth booster fails the same check
    // without anyone editing a list.
    for (const word of ["genuine", "authentic", "finest", "premium", "best", "asli", "shudh", "unmatched"]) {
      const found = introducedWords([`We make ${word} butter.`], ALLOWED);
      expect(found.map((f) => f.word), word).toContain(word);
    }
  });

  it("LETS THROUGH A WORD THE RECORD ITSELF USES", () => {
    // "soy wax only" is the record's own wording. A check that refused
    // the record's words would be worse than no check.
    const allowed = ["Paraffin-free, soy wax only.", "material.soy"];
    expect(introducedWords(["The candles are made with soy wax only."], allowed)).toEqual([]);
  });

  it("TOTALITY WORDS ARE NOT IN THE CLASS, and my own tests are why", () => {
    // I had only/every/always/never/sirf/hi on the list, and two false
    // positives appeared within minutes: "Hi" (Hinglish "hi" as in
    // "sirf … hi") and "We never use cheap paraffin wax", which is a
    // fair reading of a record saying they do not use it.
    expect(introducedWords(["Hi!"], ALLOWED)).toEqual([]);
    expect(introducedWords(["We never use cheap paraffin wax."], ALLOWED)).toEqual([]);
    expect(introducedWords(["Every jar is sealed."], ALLOWED)).toEqual([]);
  });

  it("AN INTENSIFIER THE OWNER HERSELF RECORDED IS ALLOWED", () => {
    // Found by a surviving mutation: without the containment check the
    // class would fire on the owner's own word. If she has written
    // "pure desi ghee" in Business Knowledge, "pure" is hers to say —
    // and refusing it would be the guard calling her a liar, which is
    // the failure this codebase has a whole directory about.
    const ownerSaidPure = ["the owner wrote: \"Pure desi ghee, nothing added.\"", "Shree Dairy"];
    expect(introducedWords(["We make pure desi ghee."], ownerSaidPure)).toEqual([]);
    // And a DIFFERENT booster she did not write is still caught.
    expect(introducedWords(["We make the finest desi ghee."], ownerSaidPure).map((f) => f.word)).toEqual(["finest"]);
  });

  it("a word is reported once per sentence, however often it appears", () => {
    const found = introducedWords(["Pure ghee, pure butter, pure everything."], ALLOWED);
    expect(found.filter((f) => f.word === "pure")).toHaveLength(1);
  });
});

describe("a name the writer introduced", () => {
  it("CATCHES AN INVENTED CITY WHEN NO LOCATION IS ON RECORD", () => {
    // The run of 19 October: "Indore" three times, with no location
    // record in the context at all. No list of cities could anticipate
    // that; "a name you were not given" can.
    const noCity = ["the ghee is made by the bilona method", "Shree Dairy", "welcome email"];
    const found = introducedWords(["We make it right here in Indore."], noCity);
    expect(found).toEqual([{ sentenceIndex: 0, word: "indore", kind: "name" }]);
  });

  it("AND LETS IT THROUGH WHEN THE CITY IS ON RECORD", () => {
    // Which is why getContext now mints business.city: a true location
    // claim has to remain sayable.
    expect(introducedWords(["We make it right here in Indore."], ALLOWED)).toEqual([]);
  });

  it("catches any name, not only a place", () => {
    const found = introducedWords(["Our wax comes from Golden Brands."], ALLOWED);
    expect(found.map((f) => f.word)).toEqual(expect.arrayContaining(["golden", "brands"]));
  });

  it("A SENTENCE'S FIRST WORD IS NOT A NAME", () => {
    // Every sentence starts with a capital. Treating that as a name
    // would flag all of them.
    expect(introducedWords(["Welcome, and thank you."], ALLOWED)).toEqual([]);
  });

  it("the business's own name, category and the owner's own words are allowed", () => {
    expect(introducedWords(["Shree Dairy is glad you are here."], ALLOWED)).toEqual([]);
    // A place the OWNER typed in the request is theirs, not the model's.
    const asked = [...ALLOWED, "write about our Jaipur stall"];
    expect(introducedWords(["Come to the Jaipur stall."], asked)).toEqual([]);
  });

  it("a number is not a name", () => {
    expect(introducedWords(["It is 100% of the jar."], ALLOWED).map((f) => f.word)).not.toContain("100");
  });

  it("DEVANAGARI HAS NO CASE, so this finds no names there — a stated limit", () => {
    // Written down rather than hidden: the check cannot see an invented
    // place in Devanagari, which is why the intensifier class carries
    // Hinglish words of its own.
    expect(introducedWords(["हम इंदौर में बनाते हैं।"], ["Shree Dairy"])).toEqual([]);
    expect(sourceWithComments("src/lib/content/introducedWords.ts")).toMatch(/Devanagari has no case/i);
  });
});

describe("what the owner reads", () => {
  it("names the word and quotes the sentence", () => {
    const sentences = ["We make pure clarified butter."];
    const note = introducedNote(introducedWords(sentences, ALLOWED), sentences)!;
    expect(note).toMatch(/Removed "We make pure clarified butter\."/);
    expect(note).toMatch(/it says "pure", and nothing on record says that/);
  });

  it("says it differently for a name, because the fix is different", () => {
    const sentences = ["We make it in Indore."];
    const note = introducedNote(introducedWords(sentences, ["Shree Dairy"]), sentences)!;
    expect(note).toMatch(/it names "indore", which is nowhere in your records/);
  });

  it("nothing found means nothing said", () => {
    expect(introducedNote([], ["x"])).toBeNull();
  });
});

describe("it is a code check, not a prompt rule", () => {
  it("THE DOOR RUNS IT BEFORE ASKING ANY MODEL ANYTHING", () => {
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/introducedWords\(sentences\.map/);
    // It must run before the extractor, or its findings would depend on
    // a model call that can fail.
    const atCheck = src.indexOf("introducedWords(sentences.map");
    const atExtract = src.indexOf("extractClaims(sentences.map");
    expect(atCheck).toBeGreaterThan(-1);
    expect(atCheck).toBeLessThan(atExtract);
  });

  it("the vocabulary it checks against is what the writer was given", () => {
    const src = code("src/lib/content/generateCopy.ts");
    for (const source of ["validated.approved", "factRecords", "req.businessName", "req.topic"]) {
      expect(src, source).toContain(source);
    }
  });

  it("the class names no trade, material or place", () => {
    // What makes a list legitimate here where a list of materials would
    // not be: multiTenantVocabulary permits a grammatical class.
    const src = code("src/lib/content/introducedWords.ts");
    for (const forbidden of ["candle", "ghee", "paneer", "keratin", "soy", "paraffin", "indore"]) {
      expect(src.toLowerCase(), forbidden).not.toContain(`"${forbidden}"`);
    }
  });
});
