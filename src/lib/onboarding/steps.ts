// THE ONBOARDING STEP ORDER — one list, and the count comes from it.
//
// WHY A REGISTRY RATHER THAN A STEP UNION AND SOME LITERALS. The
// redesign's screens say "Step X of 5". The flow is NOT five steps:
// the founder kept the four brand-voice questions (2 November), so the
// five design screens are followed by the questions that decide how
// Hawlai writes. A hardcoded "of 5" would have told every new customer
// the setup was nearly over four screens before it was.
//
// TWO LISTS, AND P0 GOT THIS WRONG. P0 wrote only the destination, so
// the total counted three screens that did not exist yet and the bar
// could not be wired to anything without lying about how much was
// left. `STEP_ORDER` is now the flow AS BUILT and is what every count
// comes from; `TARGET_ORDER` is where the redesign is going, and a
// test holds that the built steps appear in the target's relative
// order. The gap between them shrinks visibly, phase by phase, instead
// of being a comment somebody has to trust.
//
// ONE STEP IS CONDITIONAL. `language_notes` is only asked when the
// owner writes in both languages, so the total is a function of the
// answers so far rather than a constant.
//
// NOTHING HERE IS CLIENT- OR SERVER-ONLY: pure data and pure
// functions, so the step order can be asserted without rendering
// anything and a client component can import it.

/** Where the business already lives online — the redesign's step 1. */
export type OnlinePresence = "website" | "maps" | "social" | "none";

export const ONLINE_PRESENCES: OnlinePresence[] = ["website", "maps", "social", "none"];

/**
 * What step 2 asks, decided by step 1's answer.
 *
 * BRANCHED ON THE STORED VALUE, never on a guess about it: the
 * founder's instruction was explicit that step 2 must follow step 1's
 * selection rather than be hardcoded.
 *
 * `url`      a website to read
 * `listing`  a Google Maps listing, plus a couple of sentences
 * `handle`   an Instagram or Facebook handle, plus a couple of sentences
 * `describe` nothing to read: the owner's own words
 *
 * WHY maps AND social ALSO ASK FOR WORDS. A Maps listing and an
 * Instagram profile are both JavaScript-rendered and bot-gated, so
 * `analyzeWebsite` gets almost no readable text from either and throws.
 * Capturing the link alone would land the owner on step 3 with an empty
 * form, so those two branches collect the link AND two sentences —
 * approved 2 November.
 */
export type ConnectKind = "url" | "listing" | "handle" | "describe";

const CONNECT_FOR: Record<OnlinePresence, ConnectKind> = {
  website: "url",
  maps: "listing",
  social: "handle",
  none: "describe",
};

/** What step 2 asks for, given step 1. Every presence has an answer. */
export function connectKindFor(presence: OnlinePresence): ConnectKind {
  return CONNECT_FOR[presence];
}

/** Whether this branch can read anything from the link it collects. */
export function branchCanAnalyseLink(kind: ConnectKind): boolean {
  return kind === "url";
}

export type StepKey =
  // The five screens of the redesign.
  | "presence"
  | "connect"
  | "confirm"
  | "brand"
  | "photos"
  // The brand-voice questions, kept on the founder's instruction of
  // 2 November: these are what make Hawlai's writing sound like this
  // business rather than like every business.
  | "business_model"
  | "formality"
  | "language_notes"
  | "personality"
  | "avoid_words"
  // Not a step: the end screen, which is not counted and has no bar.
  | "done";

/**
 * WHERE THE REDESIGN IS GOING. Not used for any count — it exists so
 * the built order cannot drift out of the design's sequence, and so
 * the remaining work is readable from the code rather than from a
 * plan document nobody opens.
 */
export const TARGET_ORDER: StepKey[] = [
  "presence",
  "connect",
  "confirm",
  "brand",
  "photos",
  "business_model",
  "formality",
  "language_notes",
  "personality",
  "avoid_words",
];

/**
 * THE FLOW AS BUILT. Every number the owner sees comes from this.
 *
 * P1 (2 November): `presence` replaces the old free-text-only intent
 * screen.
 * P2 (2 November): `connect` replaces `describe` — one box for every
 * business became four branches chosen by step 1's answer.
 * P3 (2 November): `confirm` is new. Nothing used to show the owner
 * what the analysis had decided about his business before it was used.
 * P4 (2 November): `brand` is new and `language` is gone — its pills
 * answer the language question once, instead of a yes/no step whose
 * answer was then overwritten by a hardcoded "hinglish".
 */
export const STEP_ORDER: StepKey[] = [
  "presence",
  "connect",
  "confirm",
  "brand",
  "business_model",
  "formality",
  "language_notes",
  "personality",
  "avoid_words",
];

/**
 * Steps that are in the built flow but not in the redesign, each with
 * the phase that removes it. **Nothing new goes on this list** — it
 * only shrinks, and a step still here after its phase is a visible
 * debt rather than a forgotten one.
 */
export const TRANSITIONAL: { step: StepKey; until: string; why: string }[] = [
  // EMPTY SINCE P4, and that is the whole point of the list: every step
  // in the built flow is now a step the redesign asked for. It may
  // never grow again.
];

/** What the wizard knows so far, as far as the step order cares. */
export type StepAnswers = {
  presence?: OnlinePresence | null;
  /** True when the owner writes in both languages. Set by the language step. */
  hinglish?: boolean | null;
};

/** Steps that are only asked for some answers. */
const CONDITIONAL: Partial<Record<StepKey, (a: StepAnswers) => boolean>> = {
  // Only worth asking someone who writes in both languages.
  language_notes: (a) => a.hinglish === true,
};

/** The steps this owner will actually be asked, in order. */
export function stepsFor(answers: StepAnswers = {}): StepKey[] {
  return STEP_ORDER.filter((key) => {
    const when = CONDITIONAL[key];
    return when ? when(answers) : true;
  });
}

/** How many steps this owner has. Derived; never a literal. */
export function totalSteps(answers: StepAnswers = {}): number {
  return stepsFor(answers).length;
}

/**
 * Which step this is, 1-based, or null when it is not a counted step.
 *
 * NULL RATHER THAN 0 OR A GUESS. "done" is not a step, and a skipped
 * conditional step is not one either — a caller that asks about one is
 * asking the wrong question, and a silent 0 would render "Step 0 of 8".
 */
export function stepNumber(key: StepKey, answers: StepAnswers = {}): number | null {
  const index = stepsFor(answers).indexOf(key);
  return index === -1 ? null : index + 1;
}

/** The step after this one, or null at the end. */
export function nextStep(key: StepKey, answers: StepAnswers = {}): StepKey | null {
  const steps = stepsFor(answers);
  const index = steps.indexOf(key);
  if (index === -1 || index === steps.length - 1) return null;
  return steps[index + 1];
}

/** The step before this one, or null at the start. */
export function previousStep(key: StepKey, answers: StepAnswers = {}): StepKey | null {
  const steps = stepsFor(answers);
  const index = steps.indexOf(key);
  if (index <= 0) return null;
  return steps[index - 1];
}
