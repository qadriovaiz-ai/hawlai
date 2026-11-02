// ONBOARDING P0 — the step order, and the number on the bar.
//
// The redesign's screens say "Step X of 5". The flow is NOT five
// steps: the founder kept the four brand-voice questions after the
// five design screens (2 November), because those are what make
// Hawlai's writing sound like this business. So the dangerous failure
// here is a bar that tells a new customer the setup is nearly over
// four screens before it is — and the guard is that the total is
// DERIVED from the order rather than written next to it.
//
// One step is conditional, so the total is a function of the answers
// and not a constant. Nine normally, ten for Hinglish.

import { describe, it, expect } from "vitest";
import {
  ONLINE_PRESENCES,
  STEP_ORDER,
  branchCanAnalyseLink,
  connectKindFor,
  nextStep,
  previousStep,
  stepNumber,
  stepsFor,
  totalSteps,
  type OnlinePresence,
  type StepKey,
} from "@/lib/onboarding/steps";
import { code } from "./helpers/source";

const HINGLISH = { preferredLanguage: "hinglish" as const };
const ENGLISH = { preferredLanguage: "english" as const };

describe("1. the order is the design's, and the questions follow it", () => {
  it("THE FIVE DESIGN SCREENS COME FIRST, IN THE DESIGN'S ORDER", () => {
    expect(STEP_ORDER.slice(0, 5)).toEqual(["presence", "connect", "confirm", "brand", "photos"]);
  });

  it("AND THE BRAND-VOICE QUESTIONS COME AFTER THEM, NOT INSTEAD OF THEM", () => {
    // Dropping these would measurably flatten what Hawlai writes. The
    // founder said keep them; this is what holds that.
    const after = STEP_ORDER.slice(5);
    expect(after).toContain("formality");
    expect(after).toContain("personality");
    expect(after).toContain("avoid_words");
    expect(after).toContain("business_model");
  });

  it("and no step is listed twice", () => {
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
  });

  it("the end screen is not a step", () => {
    // "done" is not counted and has no bar: see OnboardingProgress.
    expect(STEP_ORDER).not.toContain("done");
    expect(stepNumber("done")).toBeNull();
  });
});

describe("2. THE TOTAL IS DERIVED, SO IT CANNOT SAY FIVE", () => {
  it("IS NOT FIVE — the number the design's screens print", () => {
    // The failure this whole file is about: "Step 1 of 5" on a flow
    // with nine steps.
    expect(totalSteps(ENGLISH)).toBeGreaterThan(5);
    expect(totalSteps(ENGLISH)).toBe(9);
  });

  it("AND GROWS BY ONE FOR HINGLISH, because that step is only asked then", () => {
    expect(totalSteps(HINGLISH)).toBe(10);
    expect(stepsFor(HINGLISH)).toContain("language_notes");
  });

  it("AND THE CONDITIONAL STEP IS ABSENT, NOT JUST UNCOUNTED, OTHERWISE", () => {
    expect(stepsFor(ENGLISH)).not.toContain("language_notes");
    expect(stepNumber("language_notes", ENGLISH)).toBeNull();
    // And it is a real step for someone who does write in both.
    expect(stepNumber("language_notes", HINGLISH)).toBe(8);
  });

  it("matches the list it came from, for every step and both answers", () => {
    for (const answers of [ENGLISH, HINGLISH]) {
      const steps = stepsFor(answers);
      expect(totalSteps(answers)).toBe(steps.length);
      steps.forEach((key, i) => expect(stepNumber(key, answers)).toBe(i + 1));
    }
  });

  it("THE PROGRESS COMPONENT WRITES NO TOTAL OF ITS OWN", () => {
    // Read through code(), so a comment explaining the rule cannot be
    // mistaken for the rule holding (CLAUDE.md rule 8). The component's
    // own header talks about "of 5" while explaining why it must not
    // say it.
    const src = code("src/components/onboarding/OnboardingProgress.tsx");
    expect(src).toMatch(/totalSteps\(/);
    expect(src).toMatch(/stepNumber\(/);
    // No digit standing in for a step count anywhere in the markup.
    expect(src).not.toMatch(/of \d/);
    expect(src).not.toMatch(/aria-valuemax=\{\d/);
  });

  it("and it refuses to draw a bar for something that is not a step", () => {
    const src = code("src/components/onboarding/OnboardingProgress.tsx");
    expect(src).toMatch(/current === null/);
    expect(src).toMatch(/return null/);
  });
});

describe("3. STEP 2 FOLLOWS STEP 1, and is not hardcoded", () => {
  it("EVERY PRESENCE HAS A BRANCH", () => {
    // A fifth option added to step 1 without a branch would render an
    // empty screen. This is the test that fails instead.
    for (const presence of ONLINE_PRESENCES) {
      expect(connectKindFor(presence), presence).toBeTruthy();
    }
    expect(ONLINE_PRESENCES).toHaveLength(4);
  });

  it("AND THE FOUR ASK DIFFERENT THINGS", () => {
    const kinds = ONLINE_PRESENCES.map(connectKindFor);
    expect(new Set(kinds).size).toBe(4);
    expect(connectKindFor("website")).toBe("url");
    expect(connectKindFor("maps")).toBe("listing");
    expect(connectKindFor("social")).toBe("handle");
    expect(connectKindFor("none")).toBe("describe");
  });

  it("ONLY THE WEBSITE BRANCH CLAIMS IT CAN READ THE LINK", () => {
    // A Google Maps listing and an Instagram profile are both
    // JavaScript-rendered and bot-gated, so analyzeWebsite gets almost
    // no readable text from either and throws. Saying otherwise would
    // land the owner on step 3 with an empty form and no explanation.
    expect(branchCanAnalyseLink(connectKindFor("website"))).toBe(true);
    for (const presence of ["maps", "social", "none"] as OnlinePresence[]) {
      expect(branchCanAnalyseLink(connectKindFor(presence)), presence).toBe(false);
    }
  });
});

describe("4. walking the flow", () => {
  it("SKIPS THE CONDITIONAL STEP RATHER THAN LANDING ON IT", () => {
    expect(nextStep("formality", ENGLISH)).toBe("personality");
    expect(nextStep("formality", HINGLISH)).toBe("language_notes");
  });

  it("and back goes back over the same gap", () => {
    expect(previousStep("personality", ENGLISH)).toBe("formality");
    expect(previousStep("personality", HINGLISH)).toBe("language_notes");
  });

  it("the first step has nothing before it and the last nothing after", () => {
    expect(previousStep("presence")).toBeNull();
    const last = stepsFor(ENGLISH)[totalSteps(ENGLISH) - 1];
    expect(nextStep(last, ENGLISH)).toBeNull();
  });

  it("a step that is not in the flow has no neighbours", () => {
    expect(nextStep("done")).toBeNull();
    expect(nextStep("language_notes", ENGLISH)).toBeNull();
  });
});

describe("5. MULTI-TENANT — nothing here belongs to one business", () => {
  it("NO TRADE, PRODUCT OR INDUSTRY WORD IN THE STEP ORDER", () => {
    // CLAUDE.md rule 3. The reference design carried one business's
    // name, its category and a city as sample text; none of it reaches
    // the code, placeholders included.
    const src = code("src/lib/onboarding/steps.ts");
    for (const word of [/candle/i, /fragrance/i, /sweet/i, /mithai/i, /car\b/i, /dealership.name/i, /salon/i, /coaching/i, /realty/i]) {
      expect(src, String(word)).not.toMatch(word);
    }
  });

  it("and the step keys say what is asked, not who is asking", () => {
    for (const key of STEP_ORDER) {
      expect(key, key).toMatch(/^[a-z_]+$/);
    }
  });
});
