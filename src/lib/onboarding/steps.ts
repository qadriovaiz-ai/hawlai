// THE ONBOARDING STEP ORDER — one list, and the count comes from it.
//
// WHY A REGISTRY RATHER THAN A STEP UNION AND SOME LITERALS. The
// redesign's screens say "Step X of 5". The flow is NOT five steps:
// the founder kept the four brand-voice questions (2 November), so the
// five design screens are followed by the questions that decide how
// Hawlai writes. A hardcoded "of 5" would have told every new customer
// the setup was nearly over four screens before it was.
//
// So the number is DERIVED, here, from the same list that decides the
// order. The two cannot disagree, and `stepsProgressIsDerived` in
// tests/onboardingSteps.test.ts fails if a literal total ever appears
// in the progress component.
//
// ONE STEP IS CONDITIONAL. `language_notes` is only asked when the
// owner has chosen Hinglish, so the total is a function of the answers
// so far rather than a constant. 9 normally, 10 for Hinglish.
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
  // Not a step: the end screen, which is not counted or shown on the bar.
  | "done";

/** The order, and the only place it is written down. */
export const STEP_ORDER: StepKey[] = [
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

/** Steps that are only asked for some answers. */
const CONDITIONAL: Partial<Record<StepKey, (a: StepAnswers) => boolean>> = {
  // Only worth asking someone who writes in both languages.
  language_notes: (a) => a.preferredLanguage === "hinglish",
};

/** What the wizard knows so far, as far as the step order cares. */
export type StepAnswers = {
  presence?: OnlinePresence | null;
  preferredLanguage?: "hindi" | "english" | "hinglish" | null;
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
 * asking the wrong question, and a silent 0 would render "Step 0 of 9".
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
