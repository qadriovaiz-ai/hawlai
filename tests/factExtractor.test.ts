// STEP 1 OF THE PIVOT: facts, with where they came from.
//
// PLAN-FACT-BOUND-GENERATION §9.1. Deliberately the step with NO
// generation change — it takes rows that have already been fetched,
// returns records and readings, calls no model, writes nothing, and
// moves no row out of `business_story`.
//
// WHY THAT MATTERS FOR THIS FILE. Nothing depends on these records yet,
// so a mistake here is invisible in production and very expensive
// later: every citation the verifier checks resolves through this. So
// the tests go after the parts that would fail silently — id stability,
// tenant scope, and the difference between a QUOTE and a READING.

import { describe, it, expect } from "vitest";
import { factId, assertUniqueIds, resolveFactId, licensesFor, isUnlicensable, type FactRecord } from "@/lib/facts/factRecord";
import { classifySentence, needsCitation, isReportedBelief } from "@/lib/facts/sentenceKind";
import { readingsFor, normaliseDigits } from "@/lib/facts/readings";
import { extractFromKnowledge, readingsToConfirm } from "@/lib/facts/extract";
import { code } from "./helpers/source";

const TENANT = "d_qaaf";
const OTHER_TENANT = "d_other";

/**
 * The nine FACT rows, as the founder described them on 2026-10-11.
 * Hinglish where his are Hinglish — that is the point of several of
 * these tests.
 */
const ROWS = [
  { id: "r1", category: "business_story", title: "How it's made, step by step", content: "Wax double boiler mein melt karti hoon. Phir fragrance milati hoon." },
  { id: "r2", category: "business_story", title: "The part that takes longest", content: "Fragrance ko 65 degrees par milana padta hai." },
  { id: "r3", category: "business_story", title: "The detail people notice", content: "Top bilkul smooth hota hai." },
  { id: "r4", category: "business_story", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." },
  { id: "r5", category: "business_story", title: "What people get wrong", content: "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai." },
  { id: "r6", category: "business_story", title: "Something I can stand behind", content: "Paraffin-free, soy wax only. Hand-poured in small batches." },
  { id: "r7", category: "business_story", title: "Materials and suppliers", content: "Lavender isliye choose ki kyunki kaam ke baad khud stressed rehti thi. Soy wax Kanpur ke supplier se aata hai." },
  // The three STORY rows and the PRIVATE one, which must not produce facts.
  { id: "r8", category: "business_story", title: "How it started", content: "Maine 2019 mein shuru kiya." },
  { id: "r9", category: "business_story", title: "The first customers", content: "Pehle customers mere padosi the." },
  { id: "r10", category: "business_story", title: "How you talk about the work", content: "Main ise apna kaam kehti hoon." },
  { id: "r11", category: "business_story", title: "What a customer actually said", content: "Ek customer ne likha ki unke husband ka accident ho gaya tha, aur hospital mein intezaar ki raat mein unhone meri candle jalayi." },
];

// ---------------------------------------------------------------------
// 1. IDS — stable, or every citation breaks on the next regeneration
// ---------------------------------------------------------------------

describe("1. fact ids", () => {
  it("THE SAME FACT GIVES THE SAME ID, run after run", () => {
    // A citation written in one run has to resolve in the next, or a
    // regenerated draft silently loses its evidence.
    const a = factId(TENANT, "business_knowledge:r1#material.soy", "Paraffin-free, soy wax only.");
    const b = factId(TENANT, "business_knowledge:r1#material.soy", "Paraffin-free, soy wax only.");
    expect(a).toBe(b);
  });

  it("AN EDITED SENTENCE GIVES A DIFFERENT ID, which is correct", () => {
    // An edited sentence is a different fact and must not inherit the
    // old citation.
    const a = factId(TENANT, "ref", "40 hour burn.");
    const b = factId(TENANT, "ref", "50 hour burn.");
    expect(a).not.toBe(b);
  });

  it("TWO TENANTS NEVER SHARE AN ID for the same words", () => {
    const a = factId(TENANT, "ref", "Soy wax only.");
    const b = factId(OTHER_TENANT, "ref", "Soy wax only.");
    expect(a).not.toBe(b);
  });

  it("whitespace and case do not make a new fact", () => {
    expect(factId(TENANT, "ref", "  Soy   wax only. ")).toBe(factId(TENANT, "ref", "soy wax only."));
  });

  it("A COLLISION THROWS, because two facts sharing a citation means one licenses the other", () => {
    const base: FactRecord = {
      id: "f_dup", dealershipId: TENANT, key: "a", value: 1, source: "owner_stated",
      sourceRef: "x", confidence: "observed", licenses: ["existence"], recordedText: "one", observedAt: "now",
    };
    expect(() => assertUniqueIds([base, { ...base, recordedText: "two" }])).toThrow(/collision/i);
    // The same record twice is not a collision.
    expect(() => assertUniqueIds([base, { ...base }])).not.toThrow();
  });
});

describe("2. resolving a citation checks the tenant", () => {
  const records: FactRecord[] = [{
    id: "f_1", dealershipId: TENANT, key: "material.soy", value: true, source: "owner_stated",
    sourceRef: "x", confidence: "observed", licenses: ["existence"], recordedText: "soy wax only", observedAt: "now",
  }];

  it("IT RESOLVES FOR THE OWNING BUSINESS", () => {
    expect(resolveFactId(records, TENANT, "f_1")?.key).toBe("material.soy");
  });

  it("AND RETURNS NULL ACROSS TENANTS — a leak, not a bad citation", () => {
    expect(resolveFactId(records, OTHER_TENANT, "f_1")).toBeNull();
  });

  it("an unknown id is null", () => {
    expect(resolveFactId(records, TENANT, "f_nope")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 3. LICENCES — the mechanism that replaces a regex for "sleep better"
// ---------------------------------------------------------------------

describe("3. what each source may license", () => {
  it("NOTHING IN THE SYSTEM LICENSES A BENEFIT OR A SAFETY CLAIM", () => {
    // This is the pivot in one assertion. "Sleep better" and "safe for
    // babies" need a test or a study; there is no source for one, so
    // they are refused by the ABSENCE of a licence rather than by a
    // pattern someone has to think of first.
    expect(isUnlicensable("benefit")).toBe(true);
    expect(isUnlicensable("safety")).toBe(true);
  });

  it("and the licences that DO exist are granted", () => {
    expect(isUnlicensable("value")).toBe(false);
    expect(isUnlicensable("existence")).toBe(false);
    expect(isUnlicensable("policy")).toBe(false);
    expect(isUnlicensable("process")).toBe(false);
  });

  it("AN OWNER'S SENTENCE MAY NOT LICENSE A NUMBER", () => {
    // A price must come from the row checkout reads, not from prose.
    expect(licensesFor("owner_stated")).not.toContain("value");
    expect(licensesFor("owner_stated")).toEqual(expect.arrayContaining(["existence", "policy", "process"]));
  });

  it("the catalogue and checkout may", () => {
    expect(licensesFor("catalogue")).toContain("value");
    expect(licensesFor("shipping_config")).toContain("policy");
  });

  it("the returned list is a copy, so a caller cannot edit the table", () => {
    const l = licensesFor("catalogue");
    l.push("benefit");
    expect(licensesFor("catalogue")).not.toContain("benefit");
  });
});

// ---------------------------------------------------------------------
// 4. SENTENCE KIND — over-inclusive on purpose, and that direction
//    is the design
// ---------------------------------------------------------------------

describe("4. classifying a sentence", () => {
  it("A NUMBER MAKES IT FACTUAL, in either script", () => {
    expect(classifySentence("40 hours burn hota hai.")).toBe("factual");
    expect(classifySentence("४० घंटे जलती है।")).toBe("factual");
  });

  it("SO DOES A POLICY WORD, A COMPOSITION RELATION OR A PROCESS", () => {
    expect(classifySentence("Free shipping on every order.")).toBe("factual");
    expect(classifySentence("Made with beeswax.")).toBe("factual");
    expect(classifySentence("Hand-poured in small batches.")).toBe("factual");
  });

  it("AND A CLAIMED EFFECT, so the missing licence can refuse it", () => {
    expect(classifySentence("You will sleep better.")).toBe("factual");
    expect(classifySentence("Non-toxic and safe for babies.")).toBe("factual");
  });

  it("A FEELING IS A FEELING, and needs no citation", () => {
    expect(classifySentence("Evenings get loud.")).toBe("feeling");
    expect(classifySentence("The room slows down.")).toBe("feeling");
    expect(needsCitation("feeling")).toBe(false);
  });

  it("a question asserts nothing", () => {
    expect(classifySentence("Shaam shaant chahiye?")).toBe("question");
  });

  it("A MIXED SENTENCE IS FACTUAL, not a CTA — the claim is what needs checking", () => {
    expect(classifySentence("Order now and get free shipping.")).toBe("factual");
  });

  it("a plain instruction is a cta", () => {
    expect(classifySentence("Order on the store page.")).toBe("cta");
  });

  it("ONLY `factual` NEEDS A CITATION", () => {
    expect(needsCitation("factual")).toBe(true);
    for (const k of ["feeling", "cta", "question"] as const) expect(needsCitation(k)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 5. READINGS — one fact, two languages
// ---------------------------------------------------------------------

describe("5. reading a sentence as a typed fact", () => {
  it("DEVANAGARI DIGITS NORMALISE", () => {
    expect(normaliseDigits("४० घंटे")).toContain("40");
  });

  it("THE HINGLISH AND THE ENGLISH SENTENCE PRODUCE THE SAME KEY", () => {
    // The whole reason Hinglish stops being a licensing problem: a
    // record is key+value, not a phrase, so no synonym table can be
    // incomplete.
    const hinglish = readingsFor("Kabhi sasta paraffin wax mix nahi karti.");
    const english = readingsFor("Paraffin-free, soy wax only.");
    expect(hinglish.map((r) => r.key)).toContain("material.paraffin");
    expect(english.map((r) => r.key)).toContain("material.paraffin");
    expect(hinglish.find((r) => r.key === "material.paraffin")?.value).toBe(false);
    expect(english.find((r) => r.key === "material.paraffin")?.value).toBe(false);
  });

  it("A NEGATION IS NEVER READ AS AN AFFIRMATION", () => {
    const r = readingsFor("No paraffin, ever.");
    expect(r.find((x) => x.key === "material.paraffin")?.value).toBe(false);
  });

  it("THE MATERIAL IS CAPTURED, NOT ENUMERATED — so every trade works", () => {
    // multiTenantVocabulary.test.ts refused the first version, which
    // named soy, paraffin, beeswax, cotton, silk. These three trades
    // share no vocabulary and all read correctly with no new code.
    expect(readingsFor("No preservatives, ever.").map((r) => r.key)).toContain("material.preservatives");
    expect(readingsFor("Made with pure silk.").map((r) => r.key)).toContain("material.silk");
    expect(readingsFor("No ammonia in any of it.").map((r) => r.key)).toContain("material.ammonia");
  });

  it("A FUNCTION WORD IS NOT A MATERIAL", () => {
    // "without any compromise" must not mint `material.compromise`.
    const keys = readingsFor("Without any compromise.").map((r) => r.key);
    expect(keys).not.toContain("material.compromise");
    expect(readingsFor("No extra charges.").map((r) => r.key)).not.toContain("material.charges");
  });

  it("THE VERB DECIDES WHICH DURATION IT IS", () => {
    // "24 ghante set hoti hai" is a CURE time. Reading it as a burn
    // time would license "burns for 24 hours" — a four-fold
    // performance claim out of a true sentence.
    expect(readingsFor("Har candle 24 ghante set hoti hai.").map((r) => r.key)).toContain("process.cure_hours");
    expect(readingsFor("40 hours burn hota hai.").map((r) => r.key)).toContain("product.burn_hours");
    expect(readingsFor("Har candle 24 ghante set hoti hai.").map((r) => r.key)).not.toContain("product.burn_hours");
  });

  it("A DURATION WITH NO VERB WE KNOW PRODUCES NOTHING, rather than a guess", () => {
    expect(readingsFor("Bees ghante ka kaam hai.").map((r) => r.key)).not.toContain("product.burn_hours");
  });

  it("a Hinglish number word is read", () => {
    const r = readingsFor("Chalees ghante jalti hai.");
    expect(r.find((x) => x.key === "product.burn_hours")?.value).toBe(40);
  });

  it("a temperature is a process measurement", () => {
    const r = readingsFor("Fragrance ko 65 degrees par milana padta hai.");
    expect(r.find((x) => x.key === "process.temperature")?.value).toBe(65);
  });

  it("a process is read as a process", () => {
    expect(readingsFor("Hand-poured in small batches.").map((r) => r.key)).toEqual(
      expect.arrayContaining(["process.hand_poured", "process.small_batch"])
    );
  });

  it("a sentence it cannot type returns nothing, which is not a failure", () => {
    expect(readingsFor("Top bilkul smooth hota hai.")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 6. THE EXTRACTOR, end to end over the real rows
// ---------------------------------------------------------------------

describe("6. extracting from the recorded rows", () => {
  const x = extractFromKnowledge(TENANT, ROWS);

  it("THE PRIVATE ROW PRODUCES NOTHING AT ALL", () => {
    // A real customer whose husband was in an accident. Not a
    // low-confidence fact — not evidence.
    const all = JSON.stringify(x.records);
    expect(all).not.toMatch(/accident/i);
    expect(all).not.toMatch(/hospital/i);
    expect(x.skipped.some((s) => s.reason === "private")).toBe(true);
  });

  it("THE THREE STORY ROWS PRODUCE NOTHING", () => {
    const all = JSON.stringify(x.records);
    expect(all).not.toMatch(/2019/);
    expect(all).not.toMatch(/padosi/i);
    expect(x.skipped.filter((s) => s.reason === "story")).toHaveLength(3);
  });

  it("THE MOTIVE SENTENCE IS DROPPED AND ITS ROW'S FACTS SURVIVE", () => {
    // Row 7 is the health-claim seed plus a real supplier fact.
    expect(x.droppedMotive.some((d) => /stressed/i.test(d.text))).toBe(true);
    expect(JSON.stringify(x.records)).toMatch(/Kanpur/);
    expect(JSON.stringify(x.records)).not.toMatch(/stressed/i);
  });

  it("THE PRODUCT FACTS ARE ALL THERE", () => {
    const keys = x.records.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining([
      "material.paraffin",
      "process.hand_poured",
      "process.small_batch",
      "process.temperature",
      "product.burn_hours",
    ]));
  });

  it("EVERY RECORD IS owner_stated, AND NONE LICENSES A NUMBER", () => {
    for (const r of x.records) {
      expect(r.source, r.key).toBe("owner_stated");
      expect(r.licenses, r.key).not.toContain("value");
      expect(r.licenses, r.key).not.toContain("benefit");
      expect(r.licenses, r.key).not.toContain("safety");
    }
  });

  it("A READING IS `inferred`; A QUOTED STATEMENT IS `observed`", () => {
    // The difference that decides what needs the owner's sign-off.
    const reading = x.records.find((r) => r.key === "material.paraffin")!;
    expect(reading.confidence).toBe("inferred");
    const quoted = x.records.find((r) => r.key.startsWith("statement."))!;
    expect(quoted.confidence).toBe("observed");
    expect(quoted.licenses).toEqual(["existence"]);
  });

  it("EVERY FACTUAL SENTENCE IS CITABLE, typed or not", () => {
    for (const s of x.sentences) {
      if (s.kind !== "factual") continue;
      expect(s.factIds.length, s.text).toBeGreaterThan(0);
    }
  });

  it("A FEELING SENTENCE IS QUOTED, NEVER TYPED", () => {
    // THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-10-20: that a feeling
    // sentence mints NO record. It was changed on the founder's
    // explicit instruction, not to make a change of mine fit, and the
    // distinction matters because CLAUDE.md rule 7 forbids the second.
    //
    // WHAT HE DECIDED, and why. Three of the eval fixtures' ten owner
    // rows were classifying as `feeling` and therefore minting nothing:
    // a batch size, a refusal about peanut oil in a kitchen, and a
    // supplier country. All three then read as invented when copy
    // stated them, because the record they should have cited did not
    // exist. His words: if this is happening to other owner notes too,
    // they will all look invented when they are in fact right.
    //
    // THE ASYMMETRY WAS REASONED ABOUT IN ONE DIRECTION ONLY.
    // sentenceKind says "when in doubt: factual" because in the
    // VERIFICATION direction a misread fact escapes citation. In the
    // EXTRACTION direction the same misread loses the owner's fact
    // entirely, and nothing had been written down about that.
    //
    // SO THE SAFETY HALF IS WHAT THIS NOW PINS, and it has more teeth
    // than the old assertion did: a feeling sentence is QUOTED, with
    // `existence` only and `observed` confidence, and it is never
    // given a typed reading. A quoted sentence can license the owner's
    // own words and nothing else — no number, no policy, no process.
    // MUTATION M42 STILL SURVIVES, AND I AM SAYING SO RATHER THAN
    // CLAIMING OTHERWISE. Letting readingsFor run on feeling sentences
    // changes nothing observable, because the classifier's `feeling`
    // bucket and readingsFor's typeable set do not currently overlap:
    // every sentence readings.ts can type carries a cue that makes the
    // classifier call it factual first.
    //
    // So this assertion documents the INTENT and guards a future change
    // to readings.ts — it is not evidence that the guard bites today. A
    // test whose mutation survives is worth keeping when the property
    // matters and worth labelling honestly, which is what this comment
    // is for.
    const risky = extractFromKnowledge(TENANT, [
      { id: "f1", category: "general", title: "Batch size", content: "Har batch mein maximum twelve students." },
    ] as any);
    const quoted = risky.records;
    expect(quoted.length).toBe(1);
    expect(quoted[0].key).toMatch(/^statement\./);
    expect(quoted[0].licenses).toEqual(["existence"]);

    const feelings = x.sentences.filter((s) => s.kind === "feeling");
    expect(feelings.length).toBeGreaterThan(0);
    for (const f of feelings) {
      expect(f.readings, f.text).toEqual([]);
      for (const id of f.factIds) {
        const record = x.records.find((r) => r.id === id)!;
        expect(record.key, f.text).toMatch(/^statement\./);
        expect(record.licenses, f.text).toEqual(["existence"]);
        expect(record.confidence, f.text).toBe("observed");
      }
    }
  });

  it("A QUESTION AND A CALL TO ACTION ARE ACCOUNTED FOR, not vanished", () => {
    // MUTATION M41 SURVIVED my first version of this, which walked the
    // shared fixture — and after the fix above every sentence in that
    // fixture mints a record, so the loop had nothing to check. A test
    // that cannot fail is not a test. Fixing the test, not the report.
    //
    // These two kinds still mint nothing, by design, and the point is
    // that they must now SAY SO. Before 2026-10-20 a sentence the
    // classifier called `cta` or `question` appeared in no list at all.
    const only = extractFromKnowledge(TENANT, [
      { id: "q1", category: "general", title: "Our hours", content: "Kya aap khule ho?" },
      { id: "q2", category: "general", title: "How to order", content: "Order it on the store page." },
    ] as any);
    expect(only.records).toEqual([]);
    expect(only.skipped.map((k) => k.reason).sort()).toEqual(["cta", "question"]);
  });

  it("AND NOTHING LEAVES WITHOUT AN ACCOUNT OF ITSELF", () => {
    // The fault that hid the one above. A sentence that minted no
    // record used to appear in no list at all — not skipped, not
    // droppedMotive, not droppedBelief — so a misclassified fact left
    // no trace anywhere. F-01 in the record layer.
    for (const s of x.sentences) {
      if (s.factIds.length) continue;
      const accounted =
        x.skipped.some((k) => k.rowTitle === s.rowTitle) ||
        x.droppedMotive.some((d) => d.text === s.text) ||
        x.droppedBelief.some((d) => d.text === s.text);
      expect(accounted, `${s.text} (${s.kind}) produced no record and no account`).toBe(true);
    }
  });

  it("every record belongs to the business it was extracted for", () => {
    for (const r of x.records) expect(r.dealershipId).toBe(TENANT);
  });

  it("the ids are unique across the whole extraction", () => {
    expect(() => assertUniqueIds(x.records)).not.toThrow();
  });

  it("NO ROW IS MOVED, READ OR WRITTEN — this step only reads what it is handed", () => {
    // The function takes rows and returns data. If it ever grows a
    // supabase argument, the owner-confirmation step has been skipped.
    // code(), not readFileSync — rule 8. A source grep is defeated by a
    // comment ABOUT the thing it looks for, and this file's header
    // explains at length that it touches no database.
    const src = code("src/lib/facts/extract.ts");
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\.update\(|\.insert\(|\.delete\(/);
  });

  it("empty input is empty output, not a throw", () => {
    const e = extractFromKnowledge(TENANT, []);
    expect(e.records).toEqual([]);
    expect(e.sentences).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 7. THE TABLE THE OWNER CONFIRMS
// ---------------------------------------------------------------------

describe("7. the readings to confirm", () => {
  const table = readingsToConfirm(extractFromKnowledge(TENANT, ROWS));

  it("IT SHOWS EVERY INFERRED READING, with the words that produced it", () => {
    expect(table.length).toBeGreaterThan(3);
    for (const row of table) {
      expect(row.sentence, row.key).toBeTruthy();
      expect(row.because, row.key).toBeTruthy();
      expect(row.factId, row.key).toMatch(/^f_/);
    }
  });

  it("THE HINGLISH AND THE ENGLISH ROW BOTH APPEAR, under the SAME key", () => {
    // My first version used `find`, which returned whichever came
    // first, and then asserted the sentence was the Hinglish one. That
    // missed the actual point: TWO rows state the same fact in two
    // languages, so there are two records with one key and two
    // provenances. The owner confirms each reading, not the key.
    const paraffin = table.filter((r) => r.key === "material.paraffin");
    expect(paraffin.length).toBe(2);
    expect(paraffin.every((r) => r.value === false)).toBe(true);
    expect(paraffin.some((r) => /nahi karti/.test(r.sentence))).toBe(true);
    expect(paraffin.some((r) => /Paraffin-free/.test(r.sentence))).toBe(true);
    // Different records, so a note can quote the right one back.
    expect(new Set(paraffin.map((r) => r.factId)).size).toBe(2);
  });

  it("A QUOTED STATEMENT IS NOT IN IT — the owner's own sentence needs no sign-off", () => {
    expect(table.every((r) => !r.key.startsWith("statement."))).toBe(true);
  });

  it("nothing from a story row or the private row appears", () => {
    const all = JSON.stringify(table);
    expect(all).not.toMatch(/2019|padosi|accident|hospital|stressed/i);
  });
});

// ---------------------------------------------------------------------
// 8. THE CLASSIFIER WAS ENGLISH-BIASED, which is the same asymmetry
//    in a new place
// ---------------------------------------------------------------------
//
// Found while writing section 6: THREE of the owner's four recorded
// Hinglish fact sentences classified as FEELING and minted no record at
// all, because the English cues were far richer than the Hinglish ones.
//
// A classifier that reads English facts and hears Hinglish feelings
// would have under-recorded this owner's whole evidence set — the exact
// failure the pivot exists to remove, arriving by a new route. The
// synonym gap the founder found was the same shape one layer up.

describe("8. a Hinglish fact is a fact", () => {
  it("A REFUSAL IS FACTUAL", () => {
    expect(classifySentence("Kabhi sasta paraffin wax mix nahi karti.")).toBe("factual");
    expect(classifySentence("Use nahi karte hum.")).toBe("factual");
  });

  it("AN ACTION ON THE PRODUCT IS FACTUAL", () => {
    expect(classifySentence("Wax double boiler mein melt karti hoon.")).toBe("factual");
    expect(classifySentence("Phir fragrance milati hoon.")).toBe("factual");
  });

  it("AND IN DEVANAGARI", () => {
    expect(classifySentence("पैराफिन नहीं करती।")).toBe("factual");
  });

  it("THE REFUSAL ROW NOW MINTS ITS RECORD — it minted none before", () => {
    const x = extractFromKnowledge(TENANT, [
      { id: "r4", category: "business_story", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." },
    ]);
    expect(x.records.map((r) => r.key)).toContain("material.paraffin");
    expect(x.records.find((r) => r.key === "material.paraffin")?.value).toBe(false);
  });

  it("A JUDGEMENT IS STILL A FEELING, in either language", () => {
    // The cost side: being generous with Hinglish must not make every
    // descriptive sentence a claim that needs evidence.
    expect(classifySentence("Top bilkul smooth hota hai.")).toBe("feeling");
    expect(classifySentence("The scent is soft.")).toBe("feeling");
    expect(classifySentence("Shaam shaant ho jaati hai.")).toBe("feeling");
  });
});

// ---------------------------------------------------------------------
// 9. A REPORTED BELIEF IS NOT A FACT — found by the confirmation table
// ---------------------------------------------------------------------
//
// The intake asks "What do people get wrong?", and the answer is, by
// design, a false claim followed by its correction:
//
//   "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai."
//
// The extractor read both numbers and minted product.burn_hours = 10
// beside product.burn_hours = 40. A row whose whole purpose is to DENY
// a false claim became the evidence FOR it — a false citation sourced
// from the truth layer itself.
//
// The owner-confirmation table is what surfaced it, before anything
// cited these records. That is the argument for printing the table
// rather than trusting the extractor.

describe("9. the misconception in a 'what people get wrong' row", () => {
  const ROW = [{ id: "r5", category: "business_story", title: "What people get wrong", content: "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai." }];

  it("THE FALSE NUMBER IS NOT RECORDED", () => {
    const x = extractFromKnowledge(TENANT, ROW);
    const burns = x.records.filter((r) => r.key === "product.burn_hours").map((r) => r.value);
    expect(burns).not.toContain(10);
  });

  it("AND THE CORRECTION BESIDE IT IS", () => {
    // Dropping the row whole would lose the true fact, which is the
    // same mistake as deleting the story category.
    const x = extractFromKnowledge(TENANT, ROW);
    expect(x.records.filter((r) => r.key === "product.burn_hours").map((r) => r.value)).toContain(40);
  });

  it("THE DROP IS REPORTED, not silent", () => {
    const x = extractFromKnowledge(TENANT, ROW);
    expect(x.droppedBelief).toHaveLength(1);
    expect(x.droppedBelief[0].text).toMatch(/Log sochte hain/);
  });

  it("the frames it recognises, both languages", () => {
    for (const s of [
      "People think it burns for ten hours.",
      "Most people assume it is paraffin.",
      "A common myth is that soy wax is weak.",
      "Log sochte hain ki yeh mehnga hai.",
      "Aksar log samajhte hain ki 10 ghante chalti hai.",
      "लोग सोचते हैं कि यह सस्ता है।",
    ]) {
      expect(isReportedBelief(s), s).toBe(true);
    }
  });

  it("AND A PLAIN FACT IS NOT MISTAKEN FOR ONE — the cost side", () => {
    for (const s of [
      "40 hours burn hota hai.",
      "Paraffin-free, soy wax only.",
      "We think carefully about the wick.",
      "I expect the order by Friday.",
    ]) {
      expect(isReportedBelief(s), s).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// 10. THE NEGATED MATERIAL IS THE MATERIAL, NOT THE VERB NEXT TO "NAHI"
//
// Found by the reviewer in the baseline grading of 13 October 2026. The
// salon's recorded row says "Ammonia wale products use nahi karte", and
// the extractor minted `material.use = false`: the Hinglish negation
// shape captured the word immediately before "nahi", which here is a
// verb. So the salon's one real composition fact was recorded as
// nonsense, and "ammonia-free" in the generated email came out
// unverifiable — reviewer-graded F — when the owner had in fact written
// it down.
//
// In Hinglish the material is routinely separated from the negation by
// the thing it qualifies: "X wale products use nahi karte", "X wali
// cheez istemaal nahi karte". The word beside "nahi" is the verb.
// ---------------------------------------------------------------------
describe("10. a negated material, separated from its negation", () => {
  const keys = (s: string) => readingsFor(s).map((r) => `${r.key}=${r.value}`);

  it("'Ammonia wale products use nahi karte' MEANS material.ammonia = false", () => {
    const r = readingsFor("Ammonia wale products use nahi karte.");
    expect(r.find((x) => x.key === "material.ammonia")?.value).toBe(false);
  });

  it("AND IT DOES NOT MINT A VERB AS A MATERIAL", () => {
    // The actual bug. A reading of material.use is worse than no
    // reading: it is a fact about a substance called "use".
    expect(keys("Ammonia wale products use nahi karte.")).not.toContain("material.use=false");
    expect(keys("Sulphate wale shampoo istemaal nahi karte.")).not.toContain("material.istemaal=false");
    expect(keys("Sulphate wale shampoo istemaal nahi karte.")).toContain("material.sulphate=false");
  });

  it("the shapes that already worked still work — this is not a swap", () => {
    expect(keys("Kabhi sasta paraffin wax mix nahi karti.")).toContain("material.paraffin=false");
    expect(keys("Ammonia nahi use karte.")).toContain("material.ammonia=false");
    expect(keys("Paraffin-free, soy wax only.")).toContain("material.paraffin=false");
    expect(keys("Paraffin-free, soy wax only.")).toContain("material.soy=true");
  });

  it("'wale' alone is not a negation — an affirmative keeps its meaning", () => {
    // "We use ammonia-based products" is not a claim that they do not.
    const r = keys("Ammonia wale products use karte hain.");
    expect(r).not.toContain("material.ammonia=false");
  });

  it("A HINGLISH VERB IS NEVER A MATERIAL, whatever shape it arrives in", () => {
    // Asserted on the stopword list itself, so a new shape that happens
    // to capture a verb cannot reintroduce the bug quietly.
    for (const verb of ["use", "istemaal", "karte", "karti", "karta", "lagate", "milate", "dete", "rakhte", "banate"]) {
      expect(keys(`${verb} nahi karte.`), verb).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------
// 11. A RECORDED PROCESS, TYPED RATHER THAN QUOTED.
//
// The S1 exit run of 2026-10-16 refused "the ghee is made using the
// traditional hand-churned method" — true, and recorded as "Haath se
// churn karte hain". It was kept only as a statement.* record, which
// licenses nothing but its own existence, so a process claim resting on
// it was refused at selection; Select reached for a coarser record and
// the judge then refused "hand-churned" for not being in it.
//
// My first fix widened statement.* to the full owner_stated licences,
// which tests/factExtractor.test.ts section 5 pins against — rightly:
// an unparsed sentence is quoted, not understood. So the fact is typed
// instead.
// ---------------------------------------------------------------------
describe("11. hand-churning is a recorded process", () => {
  it("READS THE OWNER'S HINGLISH AS A TYPED PROCESS", () => {
    const r = readingsFor("Haath se churn karte hain.");
    expect(r.map((x) => x.key)).toContain("process.hand_churned");
    expect(r.find((x) => x.key === "process.hand_churned")?.value).toBe(true);
  });

  it("and the English forms too", () => {
    for (const s of ["Hand-churned, the old way.", "We hand churn the curd.", "Hand churning takes longer."]) {
      expect(readingsFor(s).map((x) => x.key), s).toContain("process.hand_churned");
    }
  });

  it("A TYPED PROCESS RECORD CARRIES THE PROCESS LICENCE, which prose does not", () => {
    const x = extractFromKnowledge(TENANT, [
      { id: "d1", category: "general", title: "How it's made, step by step", content: "Bilona method se banate hain. Haath se churn karte hain." },
    ]);
    const typed = x.records.find((r) => r.key === "process.hand_churned");
    expect(typed?.licenses).toContain("process");
    // The statement record beside it is still existence-only. Both
    // exist, and that is the point: one is understood, one is quoted.
    const quoted = x.records.find((r) => r.key.startsWith("statement."));
    if (quoted) expect(quoted.licenses).toEqual(["existence"]);
  });

  it("does not fire on churn used as anything else", () => {
    expect(readingsFor("Customer churn is a problem for us.").map((x) => x.key)).not.toContain("process.hand_churned");
  });
});
