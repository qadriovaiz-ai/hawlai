// THE OWNER'S ASK FOR ONE PIECE BEATS THE SETTING.
//
// Founder's decision, 2026-10-16. salon-08 in the 13 October baseline:
// the brand language is Hinglish, the owner typed "broadcast in english
// about the haircut price", and the output came back in Hinglish. The
// reviewer refused to grade it and said it needed a decision, not a fix.
//
// The decision is that the ask wins. The setting is what the owner
// chose for everything; the ask is what they chose for this one, and
// the later, narrower instruction is the one they meant.

import { describe, it, expect } from "vitest";
import { languageAskedFor, languageFor, normaliseLanguage } from "@/lib/content/language";

describe("the language asked for in a piece", () => {
  it("THE ASK WINS OVER THE SETTING — the salon-08 case", () => {
    expect(languageFor("broadcast in english about the haircut price", "hinglish")).toBe("english");
  });

  it("the setting still decides when the piece asks for nothing", () => {
    expect(languageFor("broadcast about the haircut price", "hinglish")).toBe("hinglish");
    expect(languageFor("broadcast about the haircut price", "english")).toBe("english");
    // And the product's default survives an empty setting.
    expect(languageFor("a post", null)).toBe("hinglish");
  });

  it("reads the ask in the owner's own phrasings", () => {
    for (const topic of ["write in english", "english mein likho", "english me likho", "hindi mein post", "into hindi"]) {
      expect(languageAskedFor(topic), topic).not.toBeNull();
    }
    expect(languageAskedFor("english mein likho")).toBe("english");
    expect(languageAskedFor("hindi mein post")).toBe("hindi");
  });

  it("A LANGUAGE AS A SUBJECT IS NOT AN INSTRUCTION", () => {
    // The failure this narrowness prevents: a salon that teaches
    // English, or a shop that says it translates to Hindi, would have
    // every piece hijacked into that language.
    expect(languageAskedFor("post about our english classes")).toBeNull();
    expect(languageAskedFor("we translate everything to hindi")).toBeNull();
    expect(languageAskedFor("hinglish is how we talk to customers")).toBeNull();
  });

  it("says nothing when the topic is empty", () => {
    expect(languageAskedFor("")).toBeNull();
    expect(languageAskedFor(null)).toBeNull();
    expect(languageAskedFor(undefined)).toBeNull();
  });

  it("normaliseLanguage is unchanged — the setting path still works on its own", () => {
    expect(normaliseLanguage("English")).toBe("english");
    expect(normaliseLanguage("hi")).toBe("hindi");
    expect(normaliseLanguage(null)).toBe("hinglish");
  });
});
