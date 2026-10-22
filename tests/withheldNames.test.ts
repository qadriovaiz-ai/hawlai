// NAMING SOMETHING THE WRITER WAS NOT GIVEN.
//
// THE FOUNDER'S AUDIT OF 2026-10-22. Three "unsupported claim leak"
// findings in three different fields, and his reading was that they are
// one bug: wherever a new field gets tested, the same leak appears. The
// audit confirmed it, and confirmed the variable is NOT the field —
// every check in the door already runs on every field, from one list of
// sentences.
//
//   salon-08  "Book your keratin treatment or haircut in Indore today"
//             in `message`. Keratin treatment was WITHHELD from that
//             piece. The extractor reports nothing, correctly, because
//             rule 3 says a call to action is not a claim — and the
//             scope filter can only judge claims that were reported.
//             introducedWords cannot see it either: it needs a capital.
//   salon-11  "Keratin Treatment — Ek Session, Smooth Finish" in
//             `title`. The name check abstains when most of a short
//             line is capitalised — a rule added for buttons — so every
//             title was permanently invisible to it.
//   dairy-06  "#FSSAICertified" in `hashtags`. expandHashtags needs a
//             lower-to-upper boundary, and an acronym has none, so the
//             tag reached every check as one opaque token.
//
// All three measured free, before any paid run.

import { describe, it, expect } from "vitest";
import { withheldNames } from "@/lib/content/withheldNames";
import { expandHashtags, isLabelField, copySentences } from "@/lib/content/copySentences";
import { introducedWords } from "@/lib/content/introducedWords";
import { code } from "./helpers/source";
import { contextFromFacts } from "@/lib/facts/getContext";
import { SALON } from "../scripts/eval/fixtures";

describe("1. the check nothing else performs", () => {
  const allowed = ["Shine Studio", "Salon and grooming", "broadcast in english about the haircut price", "Haircut"];

  it("CATCHES A WITHHELD PRODUCT NAMED INSIDE A CALL TO ACTION", () => {
    // The exact sentence salon-08 shipped. No capital on "keratin", and
    // no claim reported for it by anything.
    const found = withheldNames(
      ["Book your keratin treatment or haircut in Indore today"],
      ["Keratin treatment"],
      allowed
    );
    expect(found.length).toBe(1);
    expect(found[0].matched).toEqual(["keratin", "treatment"]);
  });

  it("does not care which field or what kind of sentence it is", () => {
    // A question, a bare label and an invitation all get the same
    // answer, because this check never asks what the sentence is.
    for (const s of ["Keratin treatment?", "Keratin Treatment", "Try our keratin treatment!"]) {
      expect(withheldNames([s], ["Keratin treatment"], allowed).length).toBe(1);
    }
  });

  it("LEAVES THE PERMITTED PRODUCT ALONE", () => {
    expect(withheldNames(["Haircut is 400 rupees, thirty minutes."], ["Keratin treatment"], allowed)).toEqual([]);
  });

  it("AND NEVER FIRES ON A WORD THE WRITER WAS GIVEN", () => {
    // A withheld name whose words are all allowed cannot fire at all,
    // and a true sentence about the permitted product must survive a
    // shared measurement. Deleting true copy is the costlier mistake
    // and this codebase has made it eight times.
    const dairy = ["Shree Dairy", "food", "post about our FSSAI licence", "Paneer 250g"];
    expect(withheldNames(["We also make fresh paneer every morning, 250g."], ["Desi ghee 500ml"], dairy)).toEqual([]);
    expect(withheldNames(["Paneer 250g is ready."], ["Paneer 250g"], dairy)).toEqual([]);
  });

  it("needs EVERY distinctive word, not any one of them", () => {
    // "treatment" alone is not the withheld product; a salon says it
    // about the one it was given.
    expect(withheldNames(["The treatment takes ninety minutes."], ["Keratin treatment"], allowed)).toEqual([]);
  });
});

describe("2. the door runs it, in code, before any model is asked", () => {
  const src = code("src/lib/content/generateCopy.ts");

  it("IS WIRED INTO THE SHARED CHECK, NOT INTO ONE SURFACE", () => {
    expect(src).toMatch(/withheldNames\(sentences\.map\(\(s\) => s\.analysed\), withheldSubjects, allowedSubjects\)/);
  });

  it("AND BEFORE THE EXTRACTOR, so its finding never depends on a model call", () => {
    const atWithheld = src.indexOf("withheldNames(sentences.map");
    const atExtract = src.indexOf("extractClaims(sentences.map");
    expect(atWithheld).toBeGreaterThan(-1);
    expect(atWithheld).toBeLessThan(atExtract);
  });

  it("removes the sentence and tells the owner why", () => {
    expect(src).toMatch(/withheldNoteText = withheldNote/);
    expect(src).toMatch(/parsed = withoutSentences\(parsed, sentences, \[\.\.\.new Set\(withheld\.map/);
    expect(src).toMatch(/\[notCopyNoteText, withheldNoteText, introducedNoteText, factBoundNote\]/);
  });

  it("TREATS UNREADABLE RECORDS AS A REASON TO MARK, NEVER AS A REASON TO DELETE", () => {
    // When the slice did not narrow on purpose, `slice.products` can be
    // empty — and then every product in the business would read as
    // withheld and every true sentence in the piece would go. F-01's
    // lesson: a failed read is a state, not a verdict about the copy.
    expect(src).toMatch(/ctx\.slice\.narrowedByTopic/);
  });
});

describe("3. a label field is not prose, and a title is a label", () => {
  // THE REAL SLICED VOCABULARY, NOT A HAND-WRITTEN ONE. My first
  // version of this test listed three strings by hand and reported
  // "Session" as an invented name — because the record it comes from,
  // "Ninety minutes, one session", was missing from my fixture. A check
  // measured against a vocabulary poorer than the door's own invents
  // failures, which is the mirror of the records box showing the grader
  // a record set the pipeline did not have.
  const ctx = contextFromFacts("biz", SALON.facts as any, { kind: "page_text", topic: "Keratin treatment" });
  const vocab = [
    ...ctx.records.map((r) => `${r.key.replace(/[._]/g, " ")} ${r.recordedText} ${r.value ?? ""}`),
    "Shine Studio",
    "Keratin treatment",
  ];

  it("THE ABSTENTION ON A TITLE IS DELIBERATE, AND COSTS A KNOWN GAP", () => {
    // Asked with namesAnywhere the check DOES see salon-11's title:
    // "Smooth" and "Finish" are on no record.
    const couldSee = introducedWords(["Keratin Treatment — Ek Session, Smooth Finish"], vocab, [true]);
    expect(couldSee.map((f) => f.word).sort()).toEqual(["finish", "smooth"]);

    // THE DOOR DOES NOT ASK IT THAT WAY, and this records why rather
    // than leaving a capability that looks wired and is not. Swept over
    // the 127 sentences the current runs shipped, widening it to label
    // fields removed four lines and one was true copy: "2 BHK Flat at
    // Sunrise Heights" — "flat" is on no record, and a 2 BHK in a
    // housing project is a flat. Separating that from "Smooth Finish"
    // needs a list of quality words, which is trade vocabulary and is
    // barred here.
    expect(code("src/lib/content/generateCopy.ts")).toMatch(/sentences\.map\(\(s\) => s\.field === "hashtags"\)/);
  });

  it("SO THE SHEET PUTS EVERY LABEL TO THE GRADER AS A CLAIM INSTEAD", () => {
    // The title is not silently published: it stops being labelled
    // "feeling" and the founder is asked to rule on it.
    expect(code("scripts/eval/harness.ts")).toMatch(/isLabelField\(field\) \? "factual"/);
    expect(isLabelField("title")).toBe(true);
  });

  it("AND A CAPITALISED DETERMINER IS NOT AN INVENTED NAME", () => {
    // The same title without the benefit claim must survive whole.
    // Deleting it for "Ek" — Hinglish for "one" — would be B9.
    expect(introducedWords(["Keratin Treatment — Ek Session"], vocab, [true])).toEqual([]);
  });

  it("prose keeps the abstention the buttons needed", () => {
    expect(isLabelField("text")).toBe(false);
    expect(isLabelField("message")).toBe(false);
    expect(isLabelField("description")).toBe(false);
    expect(isLabelField("highlights")).toBe(false);
    expect(isLabelField("title")).toBe(true);
    expect(isLabelField("hashtags")).toBe(true);
  });
});

describe("4. an acronym tag is words too", () => {
  it("SPLITS AT A BOUNDARY WITH NO LOWER-CASE BEFORE IT", () => {
    expect(expandHashtags("#FSSAICertified")).toBe("FSSAI Certified");
    expect(expandHashtags("#ISOApproved")).toBe("ISO Approved");
  });

  it("without breaking the tags that already worked", () => {
    expect(expandHashtags("#FreshPaneer")).toBe("Fresh Paneer");
    expect(expandHashtags("#candlebyqaaf")).toBe("candlebyqaaf");
    expect(expandHashtags("#BilonaGhee")).toBe("Bilona Ghee");
    expect(expandHashtags("#Soy_Wax_Only")).toBe("Soy Wax Only");
  });

  it("AND THE OPENED TAG IS THEN CHECKABLE, which is the point", () => {
    // "Certified" is on no record. Before the split it was one token
    // that no check could read.
    const dairyVocab = ["statement FSSAI licence 11223344556677", "Shree Dairy"];
    const s = copySentences({ hashtags: ["#FSSAICertified"] } as any);
    expect(s[0].analysed).toBe("FSSAI Certified");
    const found = introducedWords([s[0].analysed], dairyVocab, [isLabelField(s[0].field)]);
    expect(found.map((f) => f.word)).toContain("certified");
  });
});
