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

  it("catches an invented name IN A PLACE POSITION, and says what it gives up", () => {
    // NARROWED 19 October, and the cost is worth naming. Run 10 removed
    // "Khush Aamdeed — aap sahi jagah aaye!" because "Aamdeed" is a
    // capitalised Hinglish word mid-greeting, and capitalisation alone
    // cannot tell "Aamdeed" from "Indore".
    //
    // Position can. The fault this check exists for is LOCATION
    // invention, and an invented place follows a preposition in English
    // or precedes a postposition in Hinglish.
    expect(introducedWords(["Our wax comes from Golden Brands."], ALLOWED).map((f) => f.word)).toContain("golden");

    // WHAT IT NO LONGER CATCHES: a name in no place position. Never an
    // observed failure, and the claim extractor still sees it as a
    // material claim with nothing to cite.
    expect(introducedWords(["Golden Brands wax, hand-poured."], ALLOWED)).toEqual([]);
  });

  it("A GREETING IS NOT A PLACE", () => {
    // The sentence run 10 removed, in full.
    expect(introducedWords(["Khush Aamdeed — aap sahi jagah aaye!"], ALLOWED)).toEqual([]);
    expect(introducedWords(["Shukriya Ji, aap aaye."], ALLOWED)).toEqual([]);
  });

  it("AND A PLACE IS, in either language's grammar", () => {
    const noCity = ["Lavender candle = 999", "Candle by Qaaf"];
    expect(introducedWords(["We make it right here in Indore."], noCity).map((f) => f.word)).toEqual(["indore"]);
    expect(introducedWords(["Yeh Indore mein banti hai."], noCity).map((f) => f.word)).toEqual(["indore"]);
    expect(introducedWords(["Flat 50, wherever you are in India."], noCity).map((f) => f.word)).toEqual(["india"]);
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
    // THE CALL TAKES A THIRD ARGUMENT SINCE 2026-10-21: a per-sentence
    // flag saying which sentences are hashtags, where a capitalised
    // word anywhere is an introduced name.
    expect(src).toMatch(/introducedWords\(\s*sentences\.map/);
    // STILL HASHTAGS, AND MEASURED RATHER THAN ASSUMED. On 2026-10-22 I
    // widened this to every label field, because the Title-Case
    // abstention makes titles invisible to the name check and that is
    // how "Smooth Finish" published. Swept over the 127 sentences the
    // current runs shipped, it removed four lines and one of them was
    // true: "2 BHK Flat at Sunrise Heights". Narrowed back, with the
    // title gap recorded in the door's own comment instead of pretended
    // away.
    expect(src).toMatch(/sentences\.map\(\(s\) => s\.field === "hashtags"\)/);
    // It must run before the extractor, or its findings would depend on
    // a model call that can fail.
    // The call is formatted across lines now that it takes three
    // arguments, so this looks for the call rather than one spelling
    // of it — my own assertion broke on whitespace, which is not a
    // property worth testing.
    const atCheck = src.indexOf("introducedWords(");
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

describe("a button label is not prose", () => {
  // The run of 19 October removed FOUR button labels — "Slot Book
  // Karo", "Candle Dekho", "Book a Consultation" — because Title Case
  // capitalises every word after the first, so each looked like a name
  // the writer had invented. They are not claims; they are what the
  // reader clicks. Capitalisation only signals a name in prose.
  const ALLOWED_SALON = ["Keratin treatment = 3500", "Shine Studio", "welcome email"];

  it("A TITLE-CASED LABEL IS NOT SEARCHED FOR NAMES", () => {
    expect(introducedWords(["Slot Book Karo"], ALLOWED_SALON)).toEqual([]);
    expect(introducedWords(["Candle Dekho"], ALLOWED_SALON)).toEqual([]);
    expect(introducedWords(["Book a Consultation"], ALLOWED_SALON)).toEqual([]);
    expect(introducedWords(["Appointment Book Karo"], ALLOWED_SALON)).toEqual([]);
  });

  it("BUT AN INTENSIFIER IN A LABEL IS STILL CAUGHT", () => {
    // The abstention is about capitalisation, not about claims. A
    // button saying "Purest Ghee" is still a claim.
    expect(introducedWords(["Purest Ghee Here"], ALLOWED_SALON).map((f) => f.word)).toEqual(["purest"]);
  });

  it("AND PROSE IS STILL SEARCHED — the abstention must not swallow a sentence", () => {
    // A real sentence has mostly lower-case words, so an invented name
    // in it still stands out.
    expect(introducedWords(["We make it right here in Indore."], ALLOWED_SALON).map((f) => f.word)).toEqual(["indore"]);
    // And a long title-cased line is prose enough to check: the
    // abstention is for short labels.
    const long = "We Make It Right Here In Indore Every Single Morning For You";
    expect(introducedWords([long], ALLOWED_SALON).map((f) => f.word)).toContain("indore");
  });
});

describe("the two faults run 9 found", () => {
  const ALLOWED = ["Lavender candle = 999", "material.soy", "Candle by Qaaf", "welcome email"];

  it("A LIST MARKER IS NOT THE FIRST WORD", () => {
    // Run 9 removed two bullets, reporting "har" and "ek" as invented
    // names: the hyphen took the sentence-initial slot, so the real
    // first word was checked — and in Hinglish the first word of a line
    // is routinely a capitalised determiner.
    expect(introducedWords(["- Har candle hand-poured hai, small batches mein"], ALLOWED)).toEqual([]);
    expect(introducedWords(["- Ek candle jal sakti hai 40 hours tak"], ALLOWED)).toEqual([]);
    for (const marker of ["*", "•", "1.", "2)", "—"]) {
      expect(introducedWords([`${marker} Har candle hand-poured hai`], ALLOWED), marker).toEqual([]);
    }
  });

  it("AND A NAME LATER IN A BULLET IS STILL CAUGHT", () => {
    // Stripping the marker must not excuse the rest of the line.
    expect(introducedWords(["- Har candle banti hai Indore mein"], ALLOWED).map((f) => f.word)).toEqual(["indore"]);
  });

  it("THE ALLOWED VOCABULARY HOLDS NO MODEL-WRITTEN PROSE", () => {
    // "Pure desi ghee, made in Indore" survived run 9 because the
    // Select model had written "pure" into a claim's intent, which put
    // the word in the allowed set. A check measured against text a
    // model wrote is the model marking its own work.
    const src = code("src/lib/content/generateCopy.ts");
    const vocab = src.slice(src.indexOf("const allowedVocabulary"), src.indexOf("const introduced ="));
    expect(vocab).not.toMatch(/c\.intent/);
    // What stays: figures and the product name, each matched to a
    // record in step 2, plus the records themselves and the owner's
    // own words.
    expect(vocab).toMatch(/c\.value/);
    expect(vocab).toMatch(/factRecords/);
    expect(vocab).toMatch(/req\.topic/);
  });

  it("so a booster in an intent no longer authorises itself", () => {
    // The same situation, at the unit level: the intent is not passed,
    // so "pure" is not in the vocabulary and the sentence is caught.
    const recordsOnly = ["process.traditional the ghee is made by the bilona method", "Shree Dairy"];
    expect(introducedWords(["Pure desi ghee, made here."], recordsOnly).map((f) => f.word)).toContain("pure");
  });
});

describe("6. a superlative that ranks the reader, not the offering", () => {
  // S2a's second WhatsApp run removed salon-08's whole call to action:
  //   Removed "Book your slot whenever suits you best 💇‍♂️"
  //     — it says "best", and nothing on record says that.
  // Nothing on record needs to. "best" there is an adverb about
  // whatever time suits the reader, not a boast about the salon.
  //
  // The sixth time in this sequence that a check of mine fired on
  // something true or harmless, and the fourth narrowing of this file.
  // Named as such rather than presented as a feature.

  it("A CLAUSE-FINAL SUPERLATIVE AFTER \"you\" IS NOT A CLAIM", () => {
    expect(introducedWords(["Book your slot whenever suits you best 💇‍♂️"], ["A Salon"])).toEqual([]);
  });

  it("nor in Hinglish", () => {
    expect(introducedWords(["Slot book karo jab aapko best lage"], ["A Salon"])).toEqual([]);
    expect(introducedWords(["Jo time tumhe best lage"], ["A Salon"])).toEqual([]);
  });

  it("BUT A SUPERLATIVE WITH A NOUN AFTER IT STILL IS", () => {
    // The direction that must not loosen. Second person right before it
    // changes nothing when there is still something for it to qualify.
    expect(introducedWords(["Aapko premium candle milegi"], ["A Business"])).toEqual([
      { sentenceIndex: 0, word: "premium", kind: "intensifier" },
    ]);
    expect(introducedWords(["You get the best price in town"], ["A Business"])).toEqual([
      { sentenceIndex: 0, word: "best", kind: "intensifier" },
    ]);
  });

  it("and a boast that merely ends a clause is still caught", () => {
    // No second-person pronoun before it, so nothing about the reader
    // is being ranked — this is the salon ranking itself.
    expect(introducedWords(["Our candles are the finest."], ["A Business"])).toEqual([
      { sentenceIndex: 0, word: "finest", kind: "intensifier" },
    ]);
    expect(introducedWords(["Shahjahanpur mein sabse behtareen"], ["A Business"])).toHaveLength(2);
  });

  it("THE FRAME IS READ INSIDE ITS CLAUSE, not against the whole sentence", () => {
    // Mutation M3 of this change survived my first attempt at this
    // test, which asserted something true either way. Fixing the test,
    // not the report — CLAUDE.md rule 2.
    //
    // The clause split is what makes a reader frame recognisable when
    // the sentence carries on past it. "Jab aapko best lage, order kar
    // dena" is ordinary Hinglish, and measured against the whole
    // sentence "best" has four words after it, so the frame disappears
    // and the courtesy is removed as a boast.
    expect(introducedWords(["Jab aapko best lage, order kar dena."], ["A Business"])).toEqual([]);
    expect(introducedWords(["Whenever suits you best, just message us."], ["A Business"])).toEqual([]);
    // And in the other direction a boast is not excused by a courtesy
    // that happens to follow it in the next clause.
    expect(introducedWords(["The purest ghee in town, whatever suits you best."], ["A Business"])).toEqual([
      { sentenceIndex: 0, word: "purest", kind: "intensifier" },
    ]);
  });

  it("the word is still refused when the records do not have it, in every other frame", () => {
    // Nothing above weakened the ordinary case.
    expect(introducedWords(["Pure desi ghee, roz banta hai."], ["A Business", "ghee"])).toEqual([
      { sentenceIndex: 0, word: "pure", kind: "intensifier" },
    ]);
  });
});

describe("7. B16 — a word that makes a figure sound small", () => {
  // The founder's blind grading of run 14, 20 October 2026. The message
  // said "We deliver to your door in Indore for just ₹50", and he
  // marked it false for two reasons. One was the delivery area. The
  // other was "just" — a judgement that ₹50 is a little, which no
  // record makes. The intensifier class holds purity and superlative
  // words, so nothing looked at it.
  //
  // He named it a new shape and an extension of B10, which is the right
  // reading: a boosting word and a minimising word are the same move in
  // opposite directions.

  it("THE SENTENCE HE GRADED F IS CAUGHT", () => {
    // "Indore" is in the allowed list because business.city puts it
    // there in the real pipeline — the city record was added on 19
    // October for exactly this reason. Leaving it out would make this
    // test pass on the wrong finding.
    const found = introducedWords(["We deliver to your door in Indore for just ₹50 — flat rate, same for everyone."], ["Shree Dairy", "business city Indore"]);
    expect(found).toEqual([{ sentenceIndex: 0, word: "just", kind: "minimiser" }]);
  });

  it("in either language, and with or without the currency word", () => {
    for (const s of ["Sirf ₹50 mein delivery.", "Bas 400 mein haircut.", "Only Rs 999 for the candle.", "Just 50 for delivery.", "Keval ₹120."]) {
      expect(introducedWords([s], ["A Business"]), s).toHaveLength(1);
    }
  });

  it("A FIGURE MUST BE THERE — this is the whole reason it may be a list", () => {
    // "only" and "sirf" were kept OUT of the intensifier class because
    // "soy wax only" is often the record's own phrasing, and a flat
    // word match emptied true sentences twice. Those stay safe.
    expect(introducedWords(["Soy wax only, no paraffin."], ["A Business"])).toEqual([]);
    expect(introducedWords(["Sirf soy wax use karti hoon."], ["A Business"])).toEqual([]);
    expect(introducedWords(["Just message us and we will book you in."], ["A Business"])).toEqual([]);
    expect(introducedWords(["Simply reply to this message."], ["A Business"])).toEqual([]);
  });

  it("AND A PRICE STATED PLAINLY IS NOT TOUCHED", () => {
    // The direction that must not loosen. The figure is the owner's and
    // reporting it is the entire job.
    expect(introducedWords(["Delivery is ₹50, flat rate."], ["A Business"])).toEqual([]);
    expect(introducedWords(["₹120 for 250g."], ["A Business"])).toEqual([]);
    expect(introducedWords(["The candle costs ₹999."], ["A Business"])).toEqual([]);
  });

  it("the owner is told it is their call, not a fact", () => {
    const sentences = ["Delivery for just ₹50."];
    const note = introducedNote(introducedWords(sentences, ["A Business"]), sentences);
    expect(note).toMatch(/says the amount is small, and that is your call to make/);
  });

  it("A MINIMISER THE OWNER TYPED IN THE SAME FRAME IS THEIRS", () => {
    // What the owner put in the brief is not something the model
    // introduced — but for a minimiser the exemption is the FRAME, not
    // the word, so the owner has to have put it in front of a figure.
    expect(introducedWords(["Delivery for just ₹50."], ["just ₹50 likho isme"])).toEqual([]);
  });

  it("BUT THE SAME WORD USED ELSEWHERE DOES NOT EXCUSE IT", () => {
    // Found by the adversarial set on 2026-10-20, free, before any paid
    // run: the restaurant's row says "dine-in ONLY after 9 pm", so
    // "only" was in the vocabulary and that bare word match licensed
    // "Lunch thali only ₹199".
    //
    // The claim a minimiser makes is not about the word, it is about
    // THIS AMOUNT, and "dine-in only after 9 pm" says nothing about
    // ₹199.
    expect(introducedWords(["Lunch thali only ₹199 on weekdays."], ["Forty seats, dine-in only after 9 pm."])).toEqual([
      { sentenceIndex: 0, word: "only", kind: "minimiser" },
    ]);
    // And an intensifier keeps the ordinary word-level exemption,
    // because if the record says "pure", the owner has said "pure".
    expect(introducedWords(["Pure soy wax."], ["the owner wrote: pure soy wax only"])).toEqual([]);
  });
});
