// Onboarding intent routing.
//
// NOT a verbatim restoration — the original harness was written in an
// earlier session and deleted. Equivalent coverage derived from the
// module's current behaviour, including the three real bugs that
// harness found: "leads called" not reaching calling, a strong signal
// being treated as tied with a weak one, and "what are others doing"
// needing to reach research.

import { describe, it, expect } from "vitest";
import { routeIntent, MODE_LABELS, MODE_DESCRIPTIONS, ACTIVATION_EVENT } from "@/lib/onboarding/intentRouter";

describe("clear intent", () => {
  const cases: [string, string][] = [
    ["I want to call my leads automatically", "calling"],
    ["set up an ai receptionist to answer calls", "calling"],
    ["I need more customers from instagram", "marketing"],
    ["run facebook ads for my showroom", "marketing"],
    ["automate my whatsapp follow up", "automation"],
    ["put my replies on autopilot", "automation"],
    ["research my competitors", "research"],
    ["I need a website for my store", "website"],
    ["build me an online store to sell online", "website"],
  ];

  for (const [text, expected] of cases) {
    it(`routes "${text}" to ${expected}`, () => {
      const result = routeIntent(text);
      expect(result.mode).toBe(expected);
      expect(result.needsClarification).toBe(false);
    });
  }
});

describe("bugs the original harness caught", () => {
  it('reaches calling from "leads called" — the past tense', () => {
    // A word-boundary match on the stem "call" cannot reach "called",
    // and "I need my leads called" is a completely natural request.
    // This routed to marketing before the fix, on the word "leads".
    const result = routeIntent("I need my leads called");
    expect(result.mode).toBe("calling");
  });

  it("does not treat a strong signal as tied with a weak one", () => {
    // "automate my whatsapp follow up" has a strong automation signal
    // and a weak calling one ("follow up"). It was flagged ambiguous.
    const result = routeIntent("automate my whatsapp follow up");
    expect(result.mode).toBe("automation");
    expect(result.needsClarification).toBe(false);
  });

  it('asks rather than guessing on "what are others in my market doing"', () => {
    // The third finding, and the one whose RESOLUTION matters most.
    // The strong signal is the literal phrase "what are others doing";
    // inserting "in my market" breaks the substring, so this does not
    // match research. The original harness expected it to, and the
    // conclusion was that the TEST was wrong, not the router:
    // contorting the keyword list to catch one paraphrase makes the
    // matcher worse everywhere else, and asking a vague question is
    // the right behaviour anyway.
    //
    // Asserted as-is so nobody "fixes" this later by adding the
    // keyword and quietly making the router guess more.
    const result = routeIntent("what are others in my market doing");
    expect(result.needsClarification).toBe(true);
    expect(result.mode).toBeNull();
  });

  it("routes the phrase the keyword actually covers", () => {
    expect(routeIntent("what are others doing in this industry").mode).toBe("research");
  });
});

describe("ambiguity", () => {
  it("asks rather than guessing when there is no signal", () => {
    const result = routeIntent("hello");
    expect(result.needsClarification).toBe(true);
    expect(result.mode).toBeNull();
  });

  it("asks rather than guessing on a single weak keyword", () => {
    // One weak keyword is not intent — guessing here sends someone
    // into the wrong product mode on a coin flip.
    const result = routeIntent("sales");
    expect(result.needsClarification).toBe(true);
  });

  it("offers candidates to choose from when it asks", () => {
    const result = routeIntent("I want to reach more people and also call them");
    if (result.needsClarification) {
      expect(result.candidates.length).toBeGreaterThan(0);
    } else {
      // Confidently resolved is also an acceptable outcome; what must
      // never happen is an unclear result with nothing to offer.
      expect(result.mode).not.toBeNull();
    }
  });

  it("handles empty input without throwing", () => {
    expect(() => routeIntent("")).not.toThrow();
    expect(routeIntent("").needsClarification).toBe(true);
  });
});

describe("robustness", () => {
  it("is case-insensitive", () => {
    expect(routeIntent("RESEARCH MY COMPETITORS").mode).toBe("research");
  });

  it("ignores punctuation", () => {
    expect(routeIntent("research my competitors!!! please...").mode).toBe("research");
  });

  it("never resolves to full from a phrase", () => {
    // "full" is the explicit show-me-everything choice and the
    // fallback for existing accounts, not something text resolves to.
    const phrases = ["everything", "all of it", "the full thing", "I want it all"];
    for (const p of phrases) expect(routeIntent(p).mode).not.toBe("full");
  });

  it("reports what it matched on, so a wrong route is diagnosable", () => {
    const result = routeIntent("call my leads");
    expect(result.matchedOn.length).toBeGreaterThan(0);
  });
});

describe("mode metadata", () => {
  it("has a label, description and activation event for every mode", () => {
    for (const mode of Object.keys(MODE_LABELS) as (keyof typeof MODE_LABELS)[]) {
      expect(MODE_LABELS[mode]).toBeTruthy();
      expect(MODE_DESCRIPTIONS[mode]).toBeTruthy();
      expect(ACTIVATION_EVENT[mode]).toBeTruthy();
    }
  });
});
