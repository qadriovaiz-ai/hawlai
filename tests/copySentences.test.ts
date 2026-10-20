// A HASHTAG IS COPY, AND IT GOES THROUGH THE SAME CHECKS.
//
// The founder's direction of 2026-10-20, after two social sheets came
// back clean with claims sitting in their tags. Three symptoms, one
// cause: a hashtag was analysed as opaque prose.

import { describe, it, expect } from "vitest";
import { copySentences, withoutSentences, expandHashtags } from "@/lib/content/copySentences";

describe("a hashtag goes through the same checks as body text", () => {
  // THE FOUNDER'S DIRECTION OF 2026-10-20, after the social sheets came
  // back clean. It looked like three separate faults and it is one: a
  // hashtag was being ANALYSED AS OPAQUE PROSE.
  //
  //   the grading sheet   classifySentence("#SoyWaxOnly") is "feeling",
  //                       so 26 of the 29 hashtag rows told the human
  //                       grader they were not claims. Nobody was ever
  //                       asked to rule on "#HandPouredInShahjahanpur"
  //   the extractor       got one unreadable token instead of words
  //   the removal         blanked an array element instead of dropping
  //                       it, so a refused tag published as an empty one
  //
  // His own summing-up: three small fixes, one root cause, and both
  // places can be fixed at once.

  it("OPENS A TAG INTO THE WORDS IT IS MADE OF", () => {
    expect(expandHashtags("#SoyWaxOnly")).toBe("Soy Wax Only");
    expect(expandHashtags("#HandPouredInShahjahanpur")).toBe("Hand Poured In Shahjahanpur");
    expect(expandHashtags("#BestInIndore")).toBe("Best In Indore");
    expect(expandHashtags("#soy_wax_only")).toBe("soy wax only");
  });

  it("AND LEAVES ORDINARY COPY ALONE", () => {
    expect(expandHashtags("Soy wax candles, hand-poured.")).toBe("Soy wax candles, hand-poured.");
    // No case boundary to split on, so nothing is invented.
    expect(expandHashtags("#candlebyqaaf")).toBe("candlebyqaaf");
  });

  it("EVERY SENTENCE CARRIES BOTH FORMS — published and analysed", () => {
    const out = { text: "Soy wax candles.", hashtags: ["#PureSoy", "#HandPoured"] };
    const s = copySentences(out as any);
    const tag = s.find((x) => x.field === "hashtags" && x.text === "#PureSoy")!;
    expect(tag.text).toBe("#PureSoy");
    expect(tag.analysed).toBe("Pure Soy");
  });

  it("OPENING THE TAG HELPS THE CLASSIFIER, WHERE IT HAS A CUE", async () => {
    const { classifySentence } = await import("@/lib/facts/sentenceKind");
    // Unopened, every one of these is a "feeling" - one unreadable
    // token with no cue in it at all.
    expect(classifySentence("#BestInIndore")).toBe("feeling");
    // Opened, the cues land: a rank, a process, a policy.
    expect(classifySentence(expandHashtags("#BestInIndore"))).toBe("factual");
    expect(classifySentence(expandHashtags("#HandPouredInShahjahanpur"))).toBe("factual");
    expect(classifySentence(expandHashtags("#FreeShipping"))).toBe("factual");
  });

  it("BUT IT IS NOT SUFFICIENT, AND THE SHEET DOES NOT RELY ON IT", async () => {
    // MEASURED RATHER THAN HOPED FOR. "Soy Wax Only" and "Pure Soy"
    // still classify as feelings once expanded, because the classifier
    // has no cue for a bare material or a bare booster — and those two
    // are exactly the tags that matter.
    //
    // So the grading sheet does not ask the classifier about a hashtag
    // at all: the FIELD decides, and every hashtag row goes to the
    // grader as a claim. A harmless tag costs one glance; a tag with a
    // claim in it costs a false publication.
    const { classifySentence } = await import("@/lib/facts/sentenceKind");
    expect(classifySentence(expandHashtags("#SoyWaxOnly"))).toBe("feeling");
    expect(classifySentence(expandHashtags("#PureSoy"))).toBe("feeling");

    const { code } = await import("./helpers/source");
    const harness = code("scripts/eval/harness.ts");
    expect(harness).toMatch(/field === "hashtags" \? "factual" : classifySentence\(expandHashtags\(s\)\)/);
  });

  it("AND A REFUSED TAG IS DROPPED, not published empty", () => {
    const out = { text: "Soy wax candles.", hashtags: ["#PureSoy", "#HandPoured"] };
    const s = copySentences(out as any);
    const i = s.findIndex((x) => x.text === "#PureSoy");
    const after = withoutSentences(out as any, s, [i]);
    expect(after.hashtags).toEqual(["#HandPoured"]);
  });

  it("but a string field that loses everything is still empty, not missing", () => {
    // The rule the array change must not break: a caller has to be able
    // to SEE that a subject lost its text.
    const out = { subject: "Pure soy.", text: "Soy wax candles." };
    const s = copySentences(out as any);
    const i = s.findIndex((x) => x.field === "subject");
    const after = withoutSentences(out as any, s, [i]);
    expect(after).toHaveProperty("subject");
    expect(after.subject).toBe("");
  });
});
