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

describe("an invented product name inside a tag", () => {
  // THE FOUNDER'S GRADING OF 2026-10-21. dairy-03 and dairy-09 shipped
  // "#FreshPaneer" in pieces where the paneer record was EXPLICITLY
  // WITHHELD from the writer — the sheet's own records box says "(not
  // given to the writer for this piece: Paneer 250g)". dairy-02 and
  // dairy-06 did not, which is what made it look random.
  //
  // Nothing caught it. The name check was narrowed to words in a PLACE
  // POSITION on 19 October, to stop it deleting Hinglish greetings and
  // Title-Cased buttons, and I wrote the cost down at the time: an
  // invented name not in a place position is no longer caught, it has
  // never been observed, and the claim extractor would see it anyway.
  //
  // Two of those three turned out to be wrong on the same day.

  it("THE TAG THE FOUNDER FOUND IS CAUGHT", async () => {
    const { introducedWords } = await import("@/lib/content/introducedWords");
    // The vocabulary a dairy piece has when the paneer is withheld.
    const vocab = ["Shree Dairy", "Desi ghee 500ml Bilona method", "shipping is flat", "business city Indore"];
    expect(introducedWords(["Fresh Paneer"], vocab, [true])).toEqual([
      { sentenceIndex: 0, word: "paneer", kind: "name" },
    ]);
  });

  it("AND IS NOT CAUGHT WHEN THE RECORD IS THERE", async () => {
    // dairy-06 had the paneer and used it. The check must not fire on
    // the owner's own product.
    const { introducedWords } = await import("@/lib/content/introducedWords");
    const vocab = ["Shree Dairy", "product paneer 250g Paneer 250g: Made fresh every morning"];
    expect(introducedWords(["Fresh Paneer"], vocab, [true])).toEqual([]);
  });

  it("PROSE KEEPS THE NARROWING, so the greeting stays safe", async () => {
    const { introducedWords } = await import("@/lib/content/introducedWords");
    // The sentence run 10 deleted. In prose, position still decides.
    expect(introducedWords(["Khush Aamdeed — aap sahi jagah aaye!"], ["A Business"], [false])).toEqual([]);
    // And a Title-Cased button is still left alone in prose.
    expect(introducedWords(["Book A Slot Today"], ["A Business"], [false])).toEqual([]);
  });

  it("BUT A TITLE-CASED TAG IS NOT A BUTTON, so the abstention does not apply", async () => {
    const { introducedWords } = await import("@/lib/content/introducedWords");
    // Every hashtag is Title-Cased by construction. Abstaining on that
    // basis inside a tag would undo the whole fix.
    expect(introducedWords(["Book A Slot Today"], ["A Business"], [true]).length).toBeGreaterThan(0);
  });

  it("and the owner's own business name in a tag is theirs", async () => {
    const { introducedWords } = await import("@/lib/content/introducedWords");
    expect(introducedWords(["Shree Dairy"], ["Shree Dairy"], [true])).toEqual([]);
  });
});

describe("a run of tags in one string is still one tag per sentence", () => {
  // MUTATION M55 SURVIVED my first pass at this: I asserted splitTags()
  // directly and the only copySentences case used an array of single
  // tags, so removing the split from the door changed nothing any test
  // could see. Fixing the test, not the report.
  //
  // THE SHAPE THAT MATTERS, from the founder's grading of 2026-10-21:
  // dairy-09 shipped all three tags as ONE string while dairy-03
  // shipped three array items. The same three claims. In the first
  // shape a refusal would have taken all three out together — two of
  // them true — and the extractor would have seen one jumble instead
  // of three labels.

  const out = () => ({ text: "Bilona ghee.", hashtags: ["#ShreeDairy #BilonaGhee #FreshPaneer"] });

  it("THREE TAGS IN ONE STRING BECOME THREE SENTENCES", () => {
    const s = copySentences(out() as any);
    const tags = s.filter((x) => x.field === "hashtags");
    expect(tags.map((t) => t.text)).toEqual(["#ShreeDairy", "#BilonaGhee", "#FreshPaneer"]);
    expect(tags.map((t) => t.analysed)).toEqual(["Shree Dairy", "Bilona Ghee", "Fresh Paneer"]);
  });

  it("SO REFUSING ONE KEEPS THE OTHER TWO", () => {
    // The whole point. Two of those three tags are the owner's own
    // words; only the paneer one was invented.
    const o = out();
    const s = copySentences(o as any);
    const i = s.findIndex((x) => x.text === "#FreshPaneer");
    const after = withoutSentences(o as any, s, [i]);
    expect(after.hashtags).toEqual(["#ShreeDairy #BilonaGhee"]);
  });

  it("and a hashtags field that is not tags at all is left whole", () => {
    // The field is not always only hashtags, and splitting on "#" must
    // not mangle a sentence that happens to live there.
    const s = copySentences({ hashtags: ["no tags here"] } as any);
    expect(s.map((x) => x.text)).toEqual(["no tags here"]);
  });
});
