// THE HASHTAGS WENT OUT TWICE.
//
// Live, 2026-10-11, on the publish confirmation. Nothing was broken and
// nobody edited anything — there were simply TWO SOURCES and no dedupe:
//
//   the prompt asked for "2-3 relevant hashtags at the end" of the
//   caption TEXT (socialMediaAgent, and every social content type in
//   lib/departments/content.ts)
//
//   and the shape ALSO has a `hashtags` field, which composePost
//   appends as its own block
//
// A model that did both produced both. The same shape as the 8 October
// incident this file's header already records: two functions each
// producing "the text", and only one of them knowing about hashtags.
//
// FIXED ON BOTH SIDES, because either alone leaves it half-done: the
// prompts now say the field ONLY, and compose dedupes whatever arrives.
// The prompt is a request; the dedupe is the guarantee.

import { describe, it, expect } from "vitest";
import { composePost } from "@/lib/chat/socialPost";
import { code } from "./helpers/source";

describe("a tag the caption already says is not appended again", () => {
  it("THE LIVE SHAPE: same tag in the body and in the field", () => {
    const r = composePost({
      text: "Evenings get loud. Lavender candle, 999. #candlebyqaaf",
      hashtags: ["#candlebyqaaf"],
    });
    expect(r.text.match(/#candlebyqaaf/gi)).toHaveLength(1);
  });

  it("CASE DOES NOT MATTER — a model repeats a tag in another case", () => {
    const r = composePost({
      text: "Evenings get loud. #CandleByQaaf",
      hashtags: ["#candlebyqaaf"],
    });
    expect(r.text.match(/#candlebyqaaf/gi)).toHaveLength(1);
  });

  it("AND A DUPLICATE INSIDE THE FIELD IS DROPPED TOO", () => {
    const r = composePost({
      text: "Evenings get loud.",
      hashtags: ["#candles", "#Candles", "#candles"],
    });
    expect(r.text.match(/#candles/gi)).toHaveLength(1);
  });

  it("the tags the caption does NOT say are still appended", () => {
    const r = composePost({
      text: "Evenings get loud. #candlebyqaaf",
      hashtags: ["#candlebyqaaf", "#soywax", "#shahjahanpur"],
    });
    expect(r.text.match(/#candlebyqaaf/gi)).toHaveLength(1);
    expect(r.text).toContain("#soywax");
    expect(r.text).toContain("#shahjahanpur");
  });

  it("nothing in the body means the field is appended whole", () => {
    const r = composePost({ text: "Evenings get loud.", hashtags: ["#soywax", "#candles"] });
    expect(r.text).toContain("#soywax #candles");
  });

  it("A HINGLISH CAPTION TAGS IN BOTH SCRIPTS, and both dedupe", () => {
    // \b does not work on Devanagari, which is why the tag pattern uses
    // an explicit script range instead.
    const r = composePost({
      text: "Shaam shaant. #मोमबत्ती #candlebyqaaf",
      hashtags: ["#मोमबत्ती", "#candlebyqaaf", "#soywax"],
    });
    expect(r.text.match(/#मोमबत्ती/g)).toHaveLength(1);
    expect(r.text.match(/#candlebyqaaf/gi)).toHaveLength(1);
    expect(r.text).toContain("#soywax");
  });

  it("A '#1' IN PROSE IS NOT A TAG — the card must not list it as one", () => {
    // "#1" is a rank, not a tag. My first version of this test asserted
    // that "#candles" still got appended, which it does either way - so
    // a mutation removing the digit exclusion passed. The detectable
    // consequence is the CARD: a broad pattern reports "#1" to the
    // owner as one of their hashtags.
    const r = composePost({ text: "Your #1 evening ritual.", hashtags: ["#candles"] });
    expect(r.text).toContain("#candles");
    expect(r.hashtags).toEqual(["#candles"]);
    expect(r.hashtags).not.toContain("#1");
  });

  it("but a tag that merely STARTS with a digit is still a tag", () => {
    // "#100percentsoy" is a real tag; only a digits-only token is not.
    const r = composePost({ text: "Soy only. #100percentsoy", hashtags: ["#candles"] });
    expect(r.hashtags.map((h) => h.toLowerCase())).toContain("#100percentsoy");
  });
});

describe("what the card shows is what gets published", () => {
  it("THE RETURNED LIST IS EVERY TAG THE READER SEES, body included", () => {
    // The 8 October incident was a card and a payload disagreeing. A
    // tag written inside the caption is published, so the card must
    // show it as a tag too.
    const r = composePost({
      text: "Evenings get loud. #candlebyqaaf",
      hashtags: ["#soywax"],
    });
    expect(r.hashtags.map((h) => h.toLowerCase())).toEqual(["#candlebyqaaf", "#soywax"]);
  });

  it("and every tag in the list appears exactly once in the text", () => {
    const r = composePost({
      text: "Evenings get loud. #candlebyqaaf #soywax",
      hashtags: ["#candlebyqaaf", "#soywax", "#shahjahanpur"],
    });
    for (const tag of r.hashtags) {
      expect(r.text.match(new RegExp(tag.replace("#", "#"), "gi")), tag).toHaveLength(1);
    }
  });
});

describe("the prompts stopped asking for them inline", () => {
  it("THE CAPTION PROMPT SENDS THEM TO THE FIELD", () => {
    const agent = code("src/lib/agents/socialMediaAgent.ts");
    expect(agent).toMatch(/hashtags.{0,40}field ONLY/i);
    expect(agent).not.toMatch(/hashtags at the end/i);
  });

  it("AND SO DOES EVERY SOCIAL CONTENT TYPE", () => {
    // Four types asked for hashtags while the shape also had the field.
    const types = code("src/lib/departments/content.ts");
    for (const key of ["instagram_post", "linkedin_post", "twitter_post", "facebook_post"]) {
      const line = types.split("\n").find((l) => l.includes(`"${key}"`))!;
      expect(line, key).toBeDefined();
      expect(line, key).toMatch(/separate hashtags field/);
    }
  });
});
