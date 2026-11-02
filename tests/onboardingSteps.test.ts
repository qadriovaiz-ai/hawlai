// ONBOARDING — the step order, and the number on the bar.
//
// The redesign's screens say "Step X of 5". The flow is NOT five
// steps: the founder kept the four brand-voice questions after the
// five design screens (2 November), because those are what make
// Hawlai's writing sound like this business. So the dangerous failure
// is a bar that tells a new customer the setup is nearly over several
// screens before it is — and the guard is that the total is DERIVED
// from the order rather than written next to it.
//
// P1 CORRECTED P0 HERE. P0's registry held only the DESTINATION, so
// the total counted three screens that did not exist and the bar could
// not be wired to anything without lying. Now STEP_ORDER is the flow
// as built, every count comes from it, TARGET_ORDER is where the
// redesign is going, and TRANSITIONAL names each step that is in the
// built flow but not the design — with the phase that removes it. The
// tests below were rewritten for that, not loosened: they gained the
// built-vs-target relationship and the shrinking-debt check.
//
// One step is conditional, so the total is a function of the answers
// and not a constant.

import { describe, it, expect } from "vitest";
import {
  ONLINE_PRESENCES,
  STEP_ORDER,
  TARGET_ORDER,
  TRANSITIONAL,
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
import { BRANCHES, MIN_DESCRIPTION, branchAsksForWords, normaliseSiteUrl } from "@/components/onboarding/ConnectStep";
import { provenanceLabel, resolveField, sourceOf, valueOf } from "@/lib/onboarding/provenance";
import { REQUIRED_FIELDS } from "@/components/onboarding/ConfirmBusinessStep";
import { code, sql } from "./helpers/source";

const ONE_LANGUAGE = { hinglish: false };
const BOTH_LANGUAGES = { hinglish: true };

describe("1. the built flow, and where it is heading", () => {
  it("STARTS WHERE THE DESIGN STARTS", () => {
    expect(STEP_ORDER[0]).toBe("presence");
    expect(TARGET_ORDER[0]).toBe("presence");
  });

  it("THE TARGET IS THE DESIGN'S FIVE SCREENS, THEN THE QUESTIONS", () => {
    expect(TARGET_ORDER.slice(0, 5)).toEqual(["presence", "connect", "confirm", "brand", "photos"]);
    const after = TARGET_ORDER.slice(5);
    // Dropping these would measurably flatten what Hawlai writes. The
    // founder said keep them; this is what holds that.
    for (const q of ["business_model", "formality", "personality", "avoid_words"]) {
      expect(after, q).toContain(q as StepKey);
    }
  });

  it("EVERY BUILT STEP IS EITHER IN THE TARGET OR DECLARED TRANSITIONAL", () => {
    // A step that is in neither is a step nobody decided to have.
    const transitional = new Set(TRANSITIONAL.map((t) => t.step));
    for (const key of STEP_ORDER) {
      const known = TARGET_ORDER.includes(key) || transitional.has(key);
      expect(known, `${key} is in neither TARGET_ORDER nor TRANSITIONAL`).toBe(true);
    }
  });

  it("AND THE BUILT STEPS KEEP THE TARGET'S RELATIVE ORDER", () => {
    // So a phase cannot land a screen in the wrong place and have the
    // bar agree with it.
    const builtTargets = STEP_ORDER.filter((k) => TARGET_ORDER.includes(k));
    const positions = builtTargets.map((k) => TARGET_ORDER.indexOf(k));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("THE TRANSITIONAL LIST ONLY SHRINKS, and every entry says which phase and why", () => {
    // Nothing new goes on this list. A step still here after its phase
    // is visible debt rather than a forgotten one.
    // THE CAP TIGHTENS EVERY PHASE. P1 allowed two; `describe` left the
    // flow in P2, so two would now let one quietly come back.
    expect(TRANSITIONAL.length).toBeLessThanOrEqual(1);
    for (const entry of TRANSITIONAL) {
      expect(entry.until, entry.step).toMatch(/^P\d$/);
      expect(entry.why.length, entry.step).toBeGreaterThan(20);
      expect(STEP_ORDER, `${entry.step} is listed but not in the flow`).toContain(entry.step);
    }
  });

  it("no step is listed twice, and the end screen is not a step", () => {
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
    expect(STEP_ORDER).not.toContain("done");
    expect(TARGET_ORDER).not.toContain("done");
    expect(stepNumber("done")).toBeNull();
  });
});

describe("2. THE TOTAL IS DERIVED, SO IT CANNOT SAY FIVE", () => {
  it("IS NOT FIVE — the number the design's screens print", () => {
    // The failure this whole file is about: "Step 1 of 5" on a flow
    // that is longer than five.
    expect(totalSteps(ONE_LANGUAGE)).toBeGreaterThan(5);
    expect(totalSteps(ONE_LANGUAGE)).toBe(8);
  });

  it("AND GROWS BY ONE FOR SOMEONE WHO WRITES IN BOTH, because that step is only asked then", () => {
    expect(totalSteps(BOTH_LANGUAGES)).toBe(9);
    expect(stepsFor(BOTH_LANGUAGES)).toContain("language_notes");
  });

  it("AND THE CONDITIONAL STEP IS ABSENT, NOT JUST UNCOUNTED, OTHERWISE", () => {
    expect(stepsFor(ONE_LANGUAGE)).not.toContain("language_notes");
    expect(stepNumber("language_notes", ONE_LANGUAGE)).toBeNull();
    expect(stepNumber("language_notes", BOTH_LANGUAGES)).toBe(7);
  });

  it("matches the list it came from, for every step and both answers", () => {
    for (const answers of [ONE_LANGUAGE, BOTH_LANGUAGES]) {
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
    expect(src).not.toMatch(/of \d/);
    expect(src).not.toMatch(/aria-valuemax=\{\d/);
  });

  it("and it refuses to draw a bar for something that is not a step", () => {
    const src = code("src/components/onboarding/OnboardingProgress.tsx");
    expect(src).toMatch(/current === null/);
    expect(src).toMatch(/return null/);
  });

  it("AND IT IS ACTUALLY ON THE SCREEN, not just written", () => {
    // P0 left it unwired because the total would have counted screens
    // that did not exist. That reason is gone, so the absence of a bar
    // is now a bug rather than a decision.
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).toMatch(/<OnboardingProgress/);
    // AND IN EVERY STEP BLOCK, not just defined once. The first
    // version of this test only checked that the component was
    // REFERENCED — and a mutation that took the bar off the screens
    // survived it, because the reference lives inside the little
    // <Progress /> wrapper and stays there whether anything renders it
    // or not. One rendering per built step is the actual property.
    const rendered = (card.match(/<Progress \/>/g) ?? []).length;
    expect(rendered).toBeGreaterThanOrEqual(STEP_ORDER.length);
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

  it("AND STEP 1 RENDERS A CARD FOR EVERY PRESENCE, from the list", () => {
    // Listed separately, a fifth presence would silently have no card.
    const src = code("src/components/onboarding/PresenceStep.tsx");
    expect(src).toMatch(/ONLINE_PRESENCES\.map/);
    for (const presence of ONLINE_PRESENCES) {
      expect(src, presence).toMatch(new RegExp(`${presence}:\\s*\\{`));
    }
  });
});

describe("4. walking the flow", () => {
  it("SKIPS THE CONDITIONAL STEP RATHER THAN LANDING ON IT", () => {
    expect(nextStep("presence")).toBe("connect");
    expect(nextStep("connect")).toBe("confirm");
    expect(nextStep("language", ONE_LANGUAGE)).toBe("personality");
    expect(nextStep("language", BOTH_LANGUAGES)).toBe("language_notes");
  });

  it("and back goes back over the same gap", () => {
    expect(previousStep("personality", ONE_LANGUAGE)).toBe("language");
    expect(previousStep("personality", BOTH_LANGUAGES)).toBe("language_notes");
  });

  it("the first step has nothing before it and the last nothing after", () => {
    expect(previousStep("presence")).toBeNull();
    const steps = stepsFor(ONE_LANGUAGE);
    expect(nextStep(steps[steps.length - 1], ONE_LANGUAGE)).toBeNull();
  });

  it("a step that is not in the flow has no neighbours", () => {
    expect(nextStep("done")).toBeNull();
    expect(nextStep("language_notes", ONE_LANGUAGE)).toBeNull();
  });
});

describe("5. PRODUCT MODE SURVIVES THE REDESIGN", () => {
  // The design has no "what do you want from Hawlai" screen, and
  // product_mode decides which dashboard sections appear and is read by
  // the pricing tiers. Dropping it would have landed every new customer
  // on the same dashboard. The founder's call of 2 November: keep it,
  // on step 1, above the cards.
  const src = code("src/components/onboarding/PresenceStep.tsx");

  it("STEP 1 STILL ASKS WHAT THE OWNER CAME FOR", () => {
    expect(src).toMatch(/routeIntent\(/);
    expect(src).toMatch(/productMode/);
  });

  it("AND NEVER GUESSES A MODE IT IS NOT SURE OF", () => {
    // routeIntent returning needsClarification must not be rounded to
    // a mode: that silently routes someone into the wrong workflow.
    expect(src).toMatch(/needsClarification/);
    expect(src).toMatch(/setChips\(/);
  });

  it("AND AN UNSURE ANSWER DOES NOT BLOCK SETUP", () => {
    // The presence answer is the one step 2 needs. product_mode stays
    // null, which already means "never asked" everywhere that reads it.
    expect(src).toMatch(/go\(null\)/);
    expect(src).toMatch(/productMode: ProductMode \| null/);
  });

  it("and nothing typed is not an ambiguous answer", () => {
    expect(src).toMatch(/if \(!intentText\) return go\(null\)/);
  });
});

describe("6. the presence answer is stored, and validated where the DB would refuse it", () => {
  const route = code("src/app/api/dealership/route.ts");

  it("THE API ACCEPTS AND WRITES IT", () => {
    expect(route).toMatch(/online_presence/);
    expect(route).toMatch(/online_presence_detail/);
  });

  it("AND REJECTS A VALUE MIGRATION 212 WOULD REJECT", () => {
    // A bad value should fail with a sentence on the first screen of
    // someone's first session, not as a Postgres constraint violation.
    expect(route).toMatch(/VALID_ONLINE_PRESENCES/);
    expect(route).toMatch(/Unknown online presence/);
  });

  it("AND IT IS A DIFFERENT COLUMN FROM product_mode", () => {
    // Overloading product_mode would change what every new customer's
    // dashboard shows. Two questions, two columns.
    expect(route).toMatch(/VALID_PRODUCT_MODES/);
    // THROUGH sql(), NOT code(). code() strips // and block comments,
    // which a .sql file does not use — so 212's header, which explains
    // at length WHY NOT product_mode and names it, stayed in the text
    // this grep searched and failed the assertion. The 2026-10-09
    // incident, in miniature, and in the harmless direction: a correct
    // migration looked wrong. The reverse is what sql() is for.
    const migration = sql("supabase/migrations/212_online_presence.sql");
    expect(migration).toMatch(/add column if not exists online_presence text/);
    expect(migration).toMatch(/add column if not exists online_presence_detail text/);
    // NO STATEMENT TOUCHES product_mode. The bare word is still in the
    // file after stripping, inside a `comment on column` STRING that
    // says "NOT the same as product_mode" — a string is not a comment,
    // so sql() rightly keeps it. The assertion has to be about the
    // DDL, which is what mattered all along.
    expect(migration).not.toMatch(/alter table dealerships[^;]*product_mode/);
    expect(migration).not.toMatch(/drop column/);
  });
});

describe("7. MULTI-TENANT — nothing here belongs to one business", () => {
  it("NO TRADE, PRODUCT OR INDUSTRY WORD IN THE STEP ORDER OR STEP 1", () => {
    // CLAUDE.md rule 3. The reference design carried one business's
    // name, its category and a city as sample text; none of it reaches
    // the code, placeholders included.
    const files = [
      "src/lib/onboarding/steps.ts",
      "src/components/onboarding/PresenceStep.tsx",
      "src/components/onboarding/OnboardingProgress.tsx",
    ];
    const words = [/candle/i, /fragrance/i, /sweet/i, /mithai/i, /salon/i, /coaching/i, /realty/i, /shahjahanpur/i, /qaaf/i];
    for (const file of files) {
      const src = code(file);
      for (const word of words) expect(src, `${file} ${word}`).not.toMatch(word);
    }
  });

  it("and the step keys say what is asked, not who is asking", () => {
    for (const key of [...STEP_ORDER, ...TARGET_ORDER]) {
      expect(key, key).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("8. STEP 2 — four branches, and only one of them can read a link", () => {
  const src = code("src/components/onboarding/ConnectStep.tsx");

  it("THE BRANCH COMES FROM STEP 1, not from anything written here", () => {
    expect(src).toMatch(/connectKindFor\(presence\)/);
    // No branch decided by reading the presence value directly.
    expect(src).not.toMatch(/presence === "website"/);
    expect(src).not.toMatch(/presence === "maps"/);
  });

  it("AND EVERY BRANCH HAS A SCREEN", () => {
    // AS DATA, NOT AS A GREP. The first version searched the source for
    // `${kind}: {`, and renaming `handle` to `xhandle` survived it —
    // the pattern still matched inside the renamed key. A ConnectKind
    // without an entry renders undefined copy.
    expect(Object.keys(BRANCHES).sort()).toEqual(["describe", "handle", "listing", "url"]);
    for (const kind of ["url", "listing", "handle", "describe"] as const) {
      expect(BRANCHES[kind].title.length, kind).toBeGreaterThan(5);
      expect(BRANCHES[kind].blurb.length, kind).toBeGreaterThan(20);
    }
  });

  it("THE TWO BRANCHES THAT CANNOT BE READ SAY SO, ON THE SCREEN", () => {
    // Not a comment: the sentence the owner reads. Claiming to have
    // read a Maps listing or an Instagram profile would be a false
    // sentence on his second screen — analyzeWebsite gets almost no
    // text from either and throws.
    const saysItCannot = src.match(/cannot read directly/g) ?? [];
    expect(saysItCannot.length).toBe(2);
  });

  it("AND A BRANCH THAT CANNOT READ ITS LINK ALWAYS ASKS FOR WORDS", () => {
    // THE INVARIANT, and the one the first version missed. It asserted
    // that `wantsWords: true` and `wantsWords: false` both appeared
    // somewhere in the source, which says nothing about which branch
    // has which — so a mutation that stopped the Maps branch asking
    // for words survived. Without words, that branch reaches step 3
    // with an empty form and nothing to explain it.
    for (const kind of ["url", "listing", "handle", "describe"] as const) {
      if (!branchCanAnalyseLink(kind)) {
        expect(branchAsksForWords(kind), kind).toBe(true);
      }
    }
    // And the one branch that CAN read its link does not ask twice.
    expect(branchCanAnalyseLink("url")).toBe(true);
    expect(branchAsksForWords("url")).toBe(false);
    expect(branchAsksForWords("listing")).toBe(true);
    expect(branchAsksForWords("handle")).toBe(true);
    expect(branchAsksForWords("describe")).toBe(true);
  });

  it("A SITE THAT CANNOT BE READ IS NOT A DEAD END", () => {
    // Without this the owner is stuck on step 2 of his first session
    // whenever his site is down, blocks us, or is one JavaScript
    // bundle.
    expect(src).toMatch(/setFellBack\(true\)/);
    expect(src).toMatch(/fellBack \? "describe" : kind/);
  });

  it("AND THE LINK IS KEPT EVEN THEN", () => {
    // It is the owner's record of where his business is, not a
    // by-product of successfully reading it.
    expect(src).toMatch(/const detail = link\.trim\(\) \|\| null/);
  });

  it("A BARE DOMAIN IS MADE INTO A URL, because the API refuses one without a scheme", () => {
    // analyzeWebsite returns 400 for anything not matching ^https?://,
    // and the reference design's own screen shows a domain typed
    // without one.
    expect(normaliseSiteUrl("yourbusiness.com")).toBe("https://yourbusiness.com");
    expect(normaliseSiteUrl("  yourbusiness.com  ")).toBe("https://yourbusiness.com");
    // Already a URL, left alone — including http, which is not ours to upgrade.
    expect(normaliseSiteUrl("https://a.example")).toBe("https://a.example");
    expect(normaliseSiteUrl("http://a.example")).toBe("http://a.example");
    expect(normaliseSiteUrl("HTTPS://A.example")).toBe("HTTPS://A.example");
    // Nothing in, nothing out: never the string "https://".
    expect(normaliseSiteUrl("   ")).toBe("");
  });

  it("AND THE DESCRIPTION FLOOR MATCHES THE API'S OWN", () => {
    // analyzeDescription throws under 10 characters. A screen that
    // accepted less would send a request it knows will fail.
    expect(MIN_DESCRIPTION).toBe(10);
    expect(src).toMatch(/>= MIN_DESCRIPTION/);
  });

  it("THE URL IS NEVER SAVED AS THE BUSINESS DESCRIPTION", () => {
    // business_description is the source the brand voice came from
    // (migration 159). A link is not a description of a business.
    expect(src).toMatch(/description: fromWebsite \? "" : words\.trim\(\)/);
  });

  it("and it introduces no model call of its own", () => {
    // Both endpoints already existed, already log their usage and
    // already refuse to save defaults when the AI is down.
    expect(src).toMatch(/analyze-website/);
    expect(src).toMatch(/analyze-description/);
    expect(src).not.toMatch(/anthropic/i);
  });

  it("AND IT IS WHAT STEP 2 ACTUALLY RENDERS", () => {
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).toMatch(/<ConnectStep/);
    expect(card).toMatch(/presence=\{presence \?\? "none"\}/);
    // The box it replaced is gone, along with its one-trade placeholder.
    expect(card).not.toMatch(/handleDescribe/);
    expect(card).not.toMatch(/jewelry/i);
  });
});

describe("9. STEP 3 — every field says where it actually came from", () => {
  // The reference design headed this screen "Pulled from your
  // website". For two of its three fields that was false: the
  // extractor returned a category but no name and no city, so those
  // were the owner's own signup typing shown back to him as an
  // analysis — on the one screen whose whole job is to be checked.

  it("THE ANALYSIS IS THE SOURCE ONLY WHEN IT SAID SOMETHING", () => {
    expect(sourceOf("A Name", "Typed At Signup")).toBe("analysis");
    expect(sourceOf("", "Typed At Signup")).toBe("signup");
    expect(sourceOf(null, "Typed At Signup")).toBe("signup");
    expect(sourceOf(undefined, "Typed At Signup")).toBe("signup");
    expect(sourceOf("", "")).toBe("none");
    expect(sourceOf(null, null)).toBe("none");
  });

  it("AND WHITESPACE IS NOT AN ANSWER FROM EITHER", () => {
    // An extractor that returns " " would otherwise be credited with
    // having read something, and the field would render blank with a
    // label claiming a source.
    expect(sourceOf("   ", "Typed At Signup")).toBe("signup");
    expect(sourceOf("   ", "   ")).toBe("none");
    expect(valueOf("  A Name  ", "Typed")).toBe("A Name");
    expect(valueOf("", "  Typed  ")).toBe("Typed");
    expect(valueOf("", "")).toBe("");
  });

  it("A FIELD NOBODY HAS ANSWERED CLAIMS NO SOURCE", () => {
    // A provenance label on an empty field claims a source for a value
    // that does not exist.
    for (const kind of ["url", "listing", "handle", "describe"] as const) {
      expect(provenanceLabel("none", kind), kind).toBeNull();
    }
  });

  it("AND A SIGNUP VALUE IS NEVER DESCRIBED AS AN ANALYSIS", () => {
    for (const kind of ["url", "listing", "handle", "describe"] as const) {
      const label = provenanceLabel("signup", kind);
      expect(label, kind).toMatch(/signed up/);
      expect(label, kind).not.toMatch(/website|listing|profile/i);
    }
  });

  it("THE LABEL NEVER NAMES A SOURCE THAT BRANCH COULD NOT READ", () => {
    // THE LOAD-BEARING ONE. Step 2 tells the owner it cannot read a
    // Maps listing or a social profile; saying "from your website" or
    // "from your listing" here would be a second false sentence two
    // screens later.
    for (const kind of ["listing", "handle", "describe"] as const) {
      const label = provenanceLabel("analysis", kind);
      expect(label, kind).toBe("from what you told me");
      expect(label, kind).not.toMatch(/website|listing|profile/i);
    }
    // And the one branch that did read a website says so.
    expect(provenanceLabel("analysis", "url")).toBe("from your website");
  });

  it("resolveField puts the value, the source and the label together", () => {
    expect(resolveField("From Site", "From Signup", "url")).toEqual({
      value: "From Site",
      source: "analysis",
      label: "from your website",
    });
    expect(resolveField("", "From Signup", "url").source).toBe("signup");
    expect(resolveField("", "", "url")).toEqual({ value: "", source: "none", label: null });
  });

  it("A NAME AND A TYPE ARE REQUIRED; A CITY IS NOT", () => {
    // Plenty of businesses are not in one place, and an online-only
    // shop asked to name a city would either guess or be stuck.
    expect(REQUIRED_FIELDS).toEqual(["name", "category"]);
    expect(REQUIRED_FIELDS).not.toContain("city");
  });

  it("AND THE SCREEN READS THE PROVENANCE RATHER THAN ASSUMING IT", () => {
    const src = code("src/components/onboarding/ConfirmBusinessStep.tsx");
    expect(src).toMatch(/resolveField\(/);
    // Three fields, three resolutions: none of them hardcoded.
    expect((src.match(/resolveField\(/g) ?? []).length).toBe(3);
    expect(src).not.toMatch(/Pulled from your website/);
  });
});

describe("10. the extractor may now say the name and the city, and may not invent them", () => {
  const agent = code("src/lib/agents/businessIntelligenceAgent.ts");

  it("IT ASKS FOR BOTH", () => {
    expect(agent).toMatch(/"business_name"/);
    expect(agent).toMatch(/"city"/);
  });

  it("AND TELLS THE MODEL TO LEAVE THEM EMPTY RATHER THAN GUESS", () => {
    // A guessed city on a confirmation screen is worse than a blank
    // one: the owner is being asked to confirm it.
    expect(agent).toMatch(/Empty string if the source does not state a name/);
    expect(agent).toMatch(/Empty string if the source does not state one/);
    expect(agent).toMatch(/never inferred from a phone code/);
  });

  it("THE PROMPT CARRIES NO EXAMPLE NAME OR CITY", () => {
    // CLAUDE.md rule 3 covers prompts, not just code. The schema's
    // business_category examples pre-date this and are left alone; the
    // two fields added here carry none.
    const schema = agent.slice(agent.indexOf("const RESPONSE_SCHEMA"));
    const addition = schema.slice(schema.indexOf('"business_name"'), schema.indexOf('"business_category"'));
    expect(addition.length).toBeGreaterThan(50);
    expect(addition).not.toMatch(/e\.g\./);
  });

  it("AND THE FALLBACK IS EMPTY, not a placeholder", () => {
    // A fallback is what the owner sees when the model failed, and is
    // exactly where another business's words have leaked before.
    expect(agent).toMatch(/business_name: "",/);
    expect(agent).toMatch(/city: "",/);
  });

  it("the values are trimmed and never null, so one check answers every caller", () => {
    expect(agent).toMatch(/parsed\.business_name\.trim\(\) : ""/);
    expect(agent).toMatch(/parsed\.city\.trim\(\) : ""/);
  });
});

describe("11. the category is written once, by the owner", () => {
  it("THE FINAL SAVE NO LONGER OVERWRITES IT WITH THE MODEL'S VERSION", () => {
    // A latent bug this phase would otherwise have introduced: step 3
    // lets the owner correct the category, and the combined save at the
    // end used to PATCH draft.business_category over it. Two writers,
    // and the second wins without anybody choosing that.
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).not.toMatch(/business_category: draft\.business_category/);
    expect(card).toMatch(/business_category: confirmed\.category/);
  });

  it("AND THE API WILL TAKE THE CORRECTION", () => {
    const route = code("src/app/api/dealership/route.ts");
    expect(route).toMatch(/dealership_name/);
    expect(route).toMatch(/Enter your business name/);
    // The name is read all over the product: changeable, never blankable.
    expect(route).toMatch(/dealership_name\.trim\(\)\.length < 2/);
    // A city may be cleared, which is not the same as not answering.
    expect(route).toMatch(/city\.trim\(\) \? city\.trim\(\) : null/);
  });
});
