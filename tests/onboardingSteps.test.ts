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
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  MAX_BRAND_COLORS,
  TONE_TAGS,
  addBrandColor,
  cleanBrandColors,
  cleanToneTags,
  composeToneOfVoice,
  hinglishFrom,
  isPreferredLanguage,
  normaliseHexColor,
} from "@/lib/onboarding/brand";
import {
  MAX_PHOTOS,
  MAX_RAW_BYTES,
  MIN_PHOTOS,
  decodedByteLength,
  enoughPhotos,
  isAcceptedImageType,
  photoStoragePath,
  readDataUrl,
  roomForMore,
} from "@/lib/onboarding/photos";
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
    // THE CAP TIGHTENS EVERY PHASE and is now ZERO: `describe` left in
    // P2 and `language` in P4, so every step in the built flow is one
    // the redesign asked for. The list may never grow again.
    expect(TRANSITIONAL.length).toBe(0);
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
    // READ OFF STEP_ORDER, NOT TYPED HERE. This assertion used to say
    // `toBe(9)`, which made the test carry a hardcoded count — the very
    // thing it exists to forbid — so I4's two approved steps broke a
    // test whose subject had not changed. Restated, it is stronger: the
    // total must equal what the built flow actually holds, minus the
    // conditional step this owner is not asked.
    expect(totalSteps(ONE_LANGUAGE)).toBe(STEP_ORDER.length - 1);
  });

  it("AND GROWS BY ONE FOR SOMEONE WHO WRITES IN BOTH, because that step is only asked then", () => {
    expect(totalSteps(BOTH_LANGUAGES)).toBe(totalSteps(ONE_LANGUAGE) + 1);
    expect(totalSteps(BOTH_LANGUAGES)).toBe(STEP_ORDER.length);
    expect(stepsFor(BOTH_LANGUAGES)).toContain("language_notes");
  });

  it("AND THE CONDITIONAL STEP IS ABSENT, NOT JUST UNCOUNTED, OTHERWISE", () => {
    expect(stepsFor(ONE_LANGUAGE)).not.toContain("language_notes");
    expect(stepNumber("language_notes", ONE_LANGUAGE)).toBeNull();
    // Its position comes from the order too, for the same reason.
    expect(stepNumber("language_notes", BOTH_LANGUAGES)).toBe(STEP_ORDER.indexOf("language_notes") + 1);
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
    expect(nextStep("confirm")).toBe("brand");
    expect(nextStep("brand")).toBe("photos");
    expect(nextStep("formality", ONE_LANGUAGE)).toBe("personality");
    expect(nextStep("formality", BOTH_LANGUAGES)).toBe("language_notes");
  });

  it("and back goes back over the same gap", () => {
    expect(previousStep("personality", ONE_LANGUAGE)).toBe("formality");
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

describe("12. STEP 4 — tone pills that do not break what already reads tone", () => {
  // tone_of_voice is FREE TEXT that prompts read directly, all over
  // this codebase. Replacing it with an array would quietly change
  // what every agent sees, so step 4 writes both.

  it("THE OWNER'S WORDS BECOME THE SENTENCE EVERY PROMPT READS", () => {
    expect(composeToneOfVoice(["Modern"], "drafted")).toBe("Modern.");
    expect(composeToneOfVoice(["Modern", "Warm"], "drafted")).toBe("Modern and Warm.");
    expect(composeToneOfVoice(["Modern", "Warm", "Premium"], "drafted")).toBe("Modern, Warm and Premium.");
  });

  it("AND THE DRAFTED SENTENCE SURVIVES WHEN HE PICKED NOTHING", () => {
    // It is richer than a list of adjectives and it is the only thing
    // there. Composing an empty list into an empty tone_of_voice would
    // have blanked what the analysis worked out.
    expect(composeToneOfVoice([], "Trustworthy, no hard-sell")).toBe("Trustworthy, no hard-sell");
    expect(composeToneOfVoice([], null)).toBe("");
    expect(composeToneOfVoice(["  "], "drafted")).toBe("drafted");
  });

  it("AND HIS WORDS ARE NOT BLENDED WITH THE MODEL'S", () => {
    // An owner who picked "Minimal" and a model that inferred "warm and
    // chatty" would otherwise both end up in the prompt, contradicting
    // each other.
    const composed = composeToneOfVoice(["Minimal"], "Warm, chatty and playful");
    expect(composed).not.toMatch(/chatty/);
    expect(composed).toBe("Minimal.");
  });

  it("ONLY THE WORDS WE OFFERED ARE STORED", () => {
    expect(cleanToneTags(["Modern", "Premium"])).toEqual(["Modern", "Premium"]);
    expect(cleanToneTags(["modern", "PREMIUM"])).toEqual(["Modern", "Premium"]);
    // Anything else is dropped rather than written through.
    expect(cleanToneTags(["Modern", "Luxury", "<script>"])).toEqual(["Modern"]);
    expect(cleanToneTags("Modern")).toEqual([]);
    expect(cleanToneTags(null)).toEqual([]);
    // De-duplicated, and in the order they were offered.
    expect(cleanToneTags(["Premium", "Modern", "Premium"])).toEqual(["Modern", "Premium"]);
  });

  it("AND NO TONE WORD NAMES A TRADE, A PRODUCT OR A CATEGORY", () => {
    // CLAUDE.md rule 3. These six go to every business of every kind.
    for (const tag of TONE_TAGS) {
      expect(tag, tag).toMatch(/^[A-Z][a-z]+$/);
      for (const word of [/shop/i, /store/i, /salon/i, /candle/i, /sweet/i, /clinic/i, /coaching/i, /jewel/i]) {
        expect(tag, `${tag} ${word}`).not.toMatch(word);
      }
    }
  });
});

describe("13. a colour is stored in one spelling, or not at all", () => {
  it("SHORTHAND, CASE AND PADDING ALL BECOME ONE STRING", () => {
    // #FFF, #ffffff and #FFFFFF are the same colour. Storing all three
    // would make "is this colour already in the list?" unanswerable.
    expect(normaliseHexColor("#FFF")).toBe("#ffffff");
    expect(normaliseHexColor("#FFFFFF")).toBe("#ffffff");
    expect(normaliseHexColor("  #4F46E5  ")).toBe("#4f46e5");
  });

  it("AND ANYTHING THAT IS NOT A COLOUR RETURNS NULL, not a guess", () => {
    for (const bad of ["", "   ", "red", "#12", "#1234", "#gggggg", "4f46e5", "#4f46e5aa"]) {
      expect(normaliseHexColor(bad), bad).toBeNull();
    }
  });

  it("THE LIST IS DE-DUPLICATED AND CAPPED", () => {
    expect(cleanBrandColors(["#FFF", "#ffffff", "#000000"])).toEqual(["#ffffff", "#000000"]);
    const many = Array.from({ length: 20 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`);
    expect(cleanBrandColors(many)).toHaveLength(MAX_BRAND_COLORS);
    expect(cleanBrandColors("#ffffff")).toEqual([]);
    expect(cleanBrandColors(null)).toEqual([]);
  });

  it("ADDING ONE GIVES BACK THE LIST THAT WILL BE STORED", () => {
    // AS DATA, NOT AS A GREP. The first version searched BrandStep for
    // `cleanBrandColors(` and a mutation that appended raw survived it,
    // because the cleaner was still called elsewhere in the file. A
    // swatch that appears on screen and vanishes on save is the
    // instrument telling a false story.
    expect(addBrandColor([], "#FFF")).toEqual(["#ffffff"]);
    expect(addBrandColor(["#ffffff"], "#FFFFFF")).toEqual(["#ffffff"]);
    expect(addBrandColor(["#ffffff"], "not a colour")).toEqual(["#ffffff"]);
    const full = ["#000001", "#000002", "#000003", "#000004", "#000005", "#000006"];
    expect(addBrandColor(full, "#000007")).toEqual(full);
  });

  it("AND THE SCREEN ADDS THROUGH IT, while the API stores through the same cleaners", () => {
    const src = code("src/components/onboarding/BrandStep.tsx");
    expect(src).toMatch(/addBrandColor\(current, draftColor\)/);
    const route = code("src/app/api/brand-profile/route.ts");
    expect(route).toMatch(/cleanBrandColors\(brand_colors\)/);
    expect(route).toMatch(/cleanToneTags\(tone_tags\)/);
  });

  it("AND NO COLOUR IS PRE-FILLED", () => {
    // The mockup shows three swatches already chosen. Nothing in this
    // product extracts colours from a website, so they would have had
    // to come from somewhere — the same class of thing as step 3's
    // "pulled from your website".
    const src = code("src/components/onboarding/BrandStep.tsx");
    expect(src).toMatch(/useState<string\[\]>\(\[\]\)/);
  });
});

describe("14. LANGUAGE IS ASKED ONCE, AND NO LONGER ASSUMED", () => {
  // THE BUG THIS PHASE FIXES. The flow asked "do you mix Hindi and
  // English?", stored the answer in brand_voice.hinglish_ok, and then
  // wrote `preferred_language: "hinglish"` for EVERY business in the
  // same save. The question was asked and the field it belonged to was
  // hardcoded.

  it("THE SAVE NO LONGER HARDCODES A LANGUAGE", () => {
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).not.toMatch(/preferred_language: "hinglish"/);
    expect(card).toMatch(/preferred_language: language/);
  });

  it("AND THE BRAND-VOICE FLAG IS DERIVED FROM THE SAME ANSWER", () => {
    // Two fields answering one question is how they came to disagree.
    expect(hinglishFrom("hinglish")).toBe(true);
    expect(hinglishFrom("hindi")).toBe(false);
    expect(hinglishFrom("english")).toBe(false);
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).toMatch(/hinglish_ok: hinglishFrom\(language\)/);
    expect(card).not.toMatch(/hinglishOk/);
  });

  it("THE API REFUSES A LANGUAGE IT DOES NOT KNOW", () => {
    // It used to take this field on trust, and the only caller that set
    // it sent the same value for everyone.
    const route = code("src/app/api/brand-profile/route.ts");
    expect(route).toMatch(/isPreferredLanguage/);
    expect(route).toMatch(/Unknown language/);
    expect(isPreferredLanguage("hinglish")).toBe(true);
    expect(isPreferredLanguage("urdu")).toBe(false);
    expect(isPreferredLanguage(null)).toBe(false);
    expect(LANGUAGES).toEqual(["hindi", "english", "hinglish"]);
    expect(isPreferredLanguage(DEFAULT_LANGUAGE)).toBe(true);
  });

  it("AND THE CONDITIONAL STEP FOLLOWS THE PILLS, not a separate question", () => {
    expect(stepsFor({ hinglish: hinglishFrom("hinglish") })).toContain("language_notes");
    expect(stepsFor({ hinglish: hinglishFrom("english") })).not.toContain("language_notes");
  });

  it("AND THE STEP AFTER STEP 4 IS WALKED FROM THE ANSWER JUST GIVEN", () => {
    // Reading it back out of React state would walk a Hinglish answer
    // as though it were not: setState has not applied yet.
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).toMatch(/hinglishFrom\(answer\.language\)/);
  });
});

describe("15. the order is walked, not guessed", () => {
  it("STEP 4 IS BOTH NUMBERED AND REACHED", () => {
    // THE PAIRING IS THE PROPERTY. A step in STEP_ORDER with nothing
    // rendering it is counted on the bar and never shown; a screen with
    // no entry in the order is shown and never counted. The first
    // version of the test below only checked that goAfter and nextStep
    // were used, so removing `brand` from the order failed a totals
    // assertion somewhere else instead of this one.
    expect(STEP_ORDER).toContain("brand");
    expect(stepNumber("brand")).toBe(4);
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).toMatch(/if \(step === "brand"\)/);
    expect(card).toMatch(/<BrandStep/);
  });

  it("TRANSITIONS COME FROM THE REGISTRY", () => {
    // A step inserted into STEP_ORDER must actually be reached, not
    // counted on the bar and skipped — which is how P4 would have
    // numbered `brand` and never shown it.
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    expect(card).toMatch(/function goAfter\(/);
    expect(card).toMatch(/nextStep\(current, \{ presence, hinglish: hinglishFrom\(language\) \}\)/);
    expect(card).toMatch(/<BrandStep/);
  });

  it("AND MIGRATION 213 KEEPS BOTH COLUMNS AS ARRAYS", () => {
    const migration = sql("supabase/migrations/213_brand_colors_tone_tags.sql");
    expect(migration).toMatch(/add column if not exists brand_colors jsonb not null default/);
    expect(migration).toMatch(/add column if not exists tone_tags jsonb not null default/);
    // A reader that maps over this must not be handed an object.
    expect(migration).toMatch(/jsonb_typeof\(brand_colors\) = 'array'/);
    expect(migration).toMatch(/jsonb_typeof\(tone_tags\) = 'array'/);
    // tone_of_voice is not replaced by either of them.
    expect(migration).not.toMatch(/drop column/);
  });
});

describe("16. STEP 5 — one photo before setup can continue", () => {
  it("THE GATE IS ONE PHOTO, AND ZERO IS NOT ENOUGH", () => {
    expect(MIN_PHOTOS).toBe(1);
    expect(enoughPhotos(0)).toBe(false);
    expect(enoughPhotos(1)).toBe(true);
    expect(enoughPhotos(15)).toBe(true);
    // A count that is not a number is not a photo.
    expect(enoughPhotos(NaN)).toBe(false);
  });

  it("AND THERE IS A CEILING, counted rather than assumed", () => {
    expect(MAX_PHOTOS).toBe(15);
    expect(roomForMore(14)).toBe(true);
    expect(roomForMore(15)).toBe(false);
    expect(roomForMore(99)).toBe(false);
    // The API counts it too: a second tab would walk past a screen that
    // merely stops offering the button.
    const route = code("src/app/api/business-photos/route.ts");
    expect(route).toMatch(/count: "exact", head: true/);
    expect(route).toMatch(/roomForMore\(count \?\? 0\)/);
  });

  it("THE GATE IS ON THE BUTTON, not only in the copy", () => {
    const src = code("src/components/onboarding/PhotosStep.tsx");
    expect(src).toMatch(/const ready = enoughPhotos\(count\)/);
    expect(src).toMatch(/disabled=\{!ready/);
  });

  it("and the list starts as unknown rather than as empty", () => {
    // Starting at [] would tell someone who already has fifteen photos
    // that they need one, for as long as the first fetch takes.
    const src = code("src/components/onboarding/PhotosStep.tsx");
    expect(src).toMatch(/useState<Photo\[\] \| null>\(null\)/);
  });
});

describe("17. the bytes, which are a platform limit and not a preference", () => {
  // A serverless request body is capped at about 4.5 MB, base64 adds
  // roughly a third, and a phone photo is commonly 3-5 MB. Untouched,
  // most uploads from the people this screen exists for would fail as a
  // platform error with nothing useful on the screen.

  it("EVERY IMAGE IS SHRUNK BEFORE IT IS SENT", () => {
    const src = code("src/components/onboarding/PhotosStep.tsx");
    expect(src).toMatch(/await shrink\(file\)/);
    expect(src).toMatch(/MAX_EDGE_PX \/ Math\.max\(bitmap\.width, bitmap\.height\)/);
  });

  it("AND THE CEILING IS WELL UNDER THE PLATFORM'S", () => {
    expect(MAX_RAW_BYTES).toBeLessThan(4_500_000 / 1.34);
    const route = code("src/app/api/business-photos/route.ts");
    expect(route).toMatch(/decodedByteLength\(read\.base64\) > MAX_RAW_BYTES/);
  });

  it("the decoded size is measured from the payload, not guessed", () => {
    // 4 base64 characters carry 3 bytes.
    expect(decodedByteLength("AAAA")).toBe(3);
    expect(decodedByteLength("AAAAAAAA")).toBe(6);
    expect(decodedByteLength("AAA=")).toBe(2);
    expect(decodedByteLength("")).toBe(0);
  });
});

describe("18. what a photo IS comes from the bytes, not from its name", () => {
  it("AN UNREADABLE OR UNWANTED TYPE IS REFUSED, NOT DEFAULTED", () => {
    // An earlier upload route in this codebase defaults a missing type
    // to image/jpeg. A PNG stored as a JPEG renders as a broken image
    // and nothing says why.
    expect(readDataUrl("data:image/png;base64,AAAA")).toEqual({ mime: "image/png", base64: "AAAA" });
    expect(readDataUrl("data:image/jpeg;base64,AAAA")?.mime).toBe("image/jpeg");
    expect(readDataUrl("data:image/webp;base64,AAAA")?.mime).toBe("image/webp");
    for (const bad of [
      "",
      "AAAA",
      "data:image/gif;base64,AAAA",
      "data:application/pdf;base64,AAAA",
      "data:text/html;base64,AAAA",
      "data:image/png;base64,",
    ]) {
      expect(readDataUrl(bad), bad).toBeNull();
    }
  });

  it("AND THE STORED EXTENSION FOLLOWS THE TYPE, not the filename", () => {
    expect(photoStoragePath("d1", "shopfront.jpg", "image/png", new Date(1000))).toBe(
      "business-photos/d1/shopfront-1000.png"
    );
    expect(photoStoragePath("d1", "whatever.png", "image/jpeg", new Date(1000))).toBe(
      "business-photos/d1/whatever-1000.jpg"
    );
  });

  it("THE OWNER'S FILENAME CANNOT DECIDE WHERE THE FILE LANDS", () => {
    // A name with a slash or a traversal is a name, not a path.
    const traversal = photoStoragePath("d1", "../../etc/passwd", "image/jpeg", new Date(1000));
    expect(traversal).toBe("business-photos/d1/etcpasswd-1000.jpg");
    expect(traversal).not.toMatch(/\.\./);
    expect(traversal.startsWith("business-photos/d1/")).toBe(true);
    // A name made entirely of characters we drop still produces a path.
    expect(photoStoragePath("d1", "   ", "image/jpeg", new Date(1000))).toBe("business-photos/d1/photo-1000.jpg");
    // A NAME IN ANY NON-LATIN SCRIPT. The first version of the function
    // kept the hyphen and produced "--1000.jpg", because the "photo"
    // fallback only covered a completely empty stem.
    expect(photoStoragePath("d1", "मेरी-दुकान.jpg", "image/jpeg", new Date(1000))).toBe(
      "business-photos/d1/photo-1000.jpg"
    );
    expect(photoStoragePath("d1", "___.png", "image/png", new Date(1000))).toBe(
      "business-photos/d1/photo-1000.png"
    );
    // And a very long one is cut rather than carried.
    const long = photoStoragePath("d1", "a".repeat(300) + ".jpg", "image/jpeg", new Date(1000));
    expect(long.length).toBeLessThan(90);
  });

  it("only the three types a phone actually produces are accepted", () => {
    expect(isAcceptedImageType("image/jpeg")).toBe(true);
    expect(isAcceptedImageType("IMAGE/PNG")).toBe(true);
    expect(isAcceptedImageType("image/gif")).toBe(false);
    expect(isAcceptedImageType("image/svg+xml")).toBe(false);
    expect(isAcceptedImageType(null)).toBe(false);
  });
});

describe("19. the row and the file cannot get out of step", () => {
  const route = code("src/app/api/business-photos/route.ts");

  it("A FAILED INSERT TAKES THE FILE BACK OUT", () => {
    // A file in storage with no row is a photo nothing can find, and it
    // makes the gate's count wrong in the direction that blocks the
    // owner.
    expect(route).toMatch(/if \(insertError\) \{/);
    expect(route).toMatch(/remove\(\[storagePath\]\)/);
  });

  it("AND DELETE IS SCOPED TO THIS BUSINESS IN THE QUERY", () => {
    // The service client bypasses RLS, so the scoping has to be written
    // into the query or it is not there at all.
    expect(route).toMatch(/\.eq\("id", id\)\n\s*\.eq\("dealership_id", resolved\.dealershipId\)/);
  });

  it("AND THE BUSINESS COMES FROM THE SESSION, never from the body", () => {
    expect(route).toMatch(/owner_id", user\.id/);
    expect(route).not.toMatch(/dealership_id \} = await request\.json/);
  });

  it("AND MIGRATION 214 KEEPS ONE ROW PER FILE", () => {
    const migration = sql("supabase/migrations/214_business_photos.sql");
    expect(migration).toMatch(/storage_path text not null unique/);
    expect(migration).toMatch(/enable row level security/);
    expect(migration).toMatch(/dealership_id in \(select id from dealerships where owner_id = auth\.uid\(\)\)/);
    // `kind` stays free text: a CHECK here would be this product
    // deciding which kinds of business exist (rule 3).
    expect(migration).not.toMatch(/check \(kind/);
  });
});

describe("20. the five design screens are all built", () => {
  it("THE BUILT FLOW NOW MATCHES THE TARGET EXACTLY", () => {
    // The end of the gap TRANSITIONAL was tracking.
    expect(STEP_ORDER).toEqual(TARGET_ORDER);
    expect(TRANSITIONAL).toHaveLength(0);
  });

  it("AND EVERY ONE OF THEM IS BOTH NUMBERED AND REACHED", () => {
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    for (const step of ["presence", "connect", "confirm", "brand", "photos"] as const) {
      expect(STEP_ORDER, step).toContain(step);
      expect(card, step).toMatch(new RegExp(`if \\(step === "${step}"\\)`));
    }
    // The bar is on every one of them, and on the questions after.
    expect((card.match(/<Progress \/>/g) ?? []).length).toBeGreaterThanOrEqual(STEP_ORDER.length);
  });
});
