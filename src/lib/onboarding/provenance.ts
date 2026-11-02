// WHERE EACH FIELD ON THE CONFIRM SCREEN ACTUALLY CAME FROM.
//
// WHY THIS FILE EXISTS. The reference design's third screen is headed
// "Is this your business?" with the line "Pulled from your website".
// For two of its three fields that was false: `analyzeWebsite` returned
// a category but no business name and no city, so those came from what
// the owner typed at signup. The screen would have told him his own
// typing was an analysis — on the one screen whose entire job is to ask
// him to check it.
//
// P3 taught the extractor to return a name and a city where the source
// states them, which makes the claim true where it can be true. This
// decides what each field is labelled when it cannot.
//
// AND THE LABEL DEPENDS ON THE BRANCH, not just on whether an analysis
// happened. For the Maps and social branches the analysis read the
// owner's own couple of sentences, not the listing — `analyzeWebsite`
// cannot read either, and step 2 says so. "From your website" there
// would be a second false sentence two screens later.
//
// Pure, so every combination is checked without rendering anything.

import type { ConnectKind } from "@/lib/onboarding/steps";
import { isPlaceholderBusinessName } from "@/lib/onboarding/signup";

export type FieldSource =
  /** The analysis produced it. */
  | "analysis"
  /** Nothing analysed it; it is what the owner typed when signing up. */
  | "signup"
  /** Nobody has said it yet. */
  | "none";

/**
 * Blank, whitespace and null are all "nothing was said".
 *
 * AND SO IS THE SIGNUP STAND-IN — signup Q1. Signup writes a
 * placeholder because dealership_name is not null, and labelling it
 * "you entered this when you signed up" would be the confirm screen
 * telling the owner he typed something he never typed. The field
 * renders empty and asks to be filled, which is exactly right: step 3
 * is where the name is actually given.
 */
function said(value: string | null | undefined): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return !isPlaceholderBusinessName(value);
}

/**
 * Which of the two sources this field's value is coming from.
 *
 * THE ANALYSIS WINS ONLY WHEN IT SAID SOMETHING. An empty string from
 * the extractor is the honest "the source did not say", and the signup
 * value is then both the value shown AND what the label admits to.
 */
export function sourceOf(analysed: string | null | undefined, onRecord: string | null | undefined): FieldSource {
  if (said(analysed)) return "analysis";
  if (said(onRecord)) return "signup";
  return "none";
}

/** The value to show, from the same two sources, in the same order. */
export function valueOf(analysed: string | null | undefined, onRecord: string | null | undefined): string {
  if (said(analysed)) return (analysed as string).trim();
  if (said(onRecord)) return (onRecord as string).trim();
  return "";
}

/** What the analysis read, in the owner's terms, for each branch of step 2. */
const READ_FROM: Record<ConnectKind, string> = {
  url: "from your website",
  // NOT "from your listing" or "from your profile": step 2 could not
  // read either, and said so. What it read was the owner's sentences.
  listing: "from what you told me",
  handle: "from what you told me",
  describe: "from what you told me",
};

/**
 * The line under a field, or null when there is nothing honest to say.
 *
 * NULL FOR "none" ON PURPOSE. An empty field with a provenance label
 * would be claiming a source for a value that does not exist.
 */
export function provenanceLabel(source: FieldSource, kind: ConnectKind): string | null {
  if (source === "analysis") return READ_FROM[kind];
  if (source === "signup") return "you entered this when you signed up";
  return null;
}

/** One field, resolved: what to show, and what to say about it. */
export function resolveField(
  analysed: string | null | undefined,
  onRecord: string | null | undefined,
  kind: ConnectKind
): { value: string; source: FieldSource; label: string | null } {
  const source = sourceOf(analysed, onRecord);
  return { value: valueOf(analysed, onRecord), source, label: provenanceLabel(source, kind) };
}
