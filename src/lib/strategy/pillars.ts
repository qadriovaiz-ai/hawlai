// Turning an accepted positioning into Brand Voice pillars (Advanced
// Strategy step 5, approved 2026-09-20).
//
// The pillars are the ANGLES the positioning advice kept — each one was
// already checked against the business's own facts and the counted table
// before it was ever shown (lib/strategy/positioning/analysis.ts), and
// anything unbacked was dropped there. So nothing new is invented here:
// this only turns what the owner is looking at into the short lines every
// generator reads from brand_profiles.messaging_pillars.

export const MAX_PILLARS = 6;
const MAX_LENGTH = 120;

/**
 * Whether a saved pillar names a price.
 *
 * Exported so the Brand Voice card can say so beside the input. One
 * accepted pillar froze "₹800" into the voice every generator reads, and
 * a price is the fact in it most likely to be wrong by next month. The
 * pillar is NEVER rewritten: it is the owner's sentence, and telling them
 * is a better answer than editing it behind their back.
 */
export function namesAPrice(line: string | null | undefined): boolean {
  return PRICE_IN_LINE.test(String(line ?? ""));
}

export type AcceptedPositioning = { statement: string | null; pillars: string[]; skipped: SkippedPillar[] };

/** A line that was offered and did not make it, and why — said out loud, never dropped quietly. */
export type SkippedPillar = { line: string; reason: string };

/**
 * A price anywhere in the line.
 *
 * WHY A PILLAR MAY NOT CARRY ONE: Brand Voice is read by every generator
 * for as long as it stands, and a price is the fact most likely to be
 * wrong by next month. One accepted pillar froze "₹800" into the voice of
 * the business; the catalogue is the only place a price should live, and
 * every surface that needs one already reads it from there.
 */
const PRICE_IN_LINE = /(?:₹|\brs\.?\s*|\binr\s*)\s?\d[\d,]*(?:\.\d{1,2})?\b|\b\d[\d,]*\s*(?:rupees|\/-)/i;

type Advice = { statement?: unknown; angles?: unknown } | null;

/** The pillars on offer from a comparison's advice, in the order it gave them. */
export function pillarsFrom(advice: Advice): AcceptedPositioning {
  const angles = Array.isArray((advice as any)?.angles) ? (advice as any).angles : [];
  const pillars: string[] = [];
  const skipped: SkippedPillar[] = [];
  for (const a of angles) {
    const line = clean(a?.title);
    if (!line) continue;
    if (PRICE_IN_LINE.test(line)) {
      skipped.push({ line, reason: "it names a price, and a price belongs in your catalogue where it can change" });
      continue;
    }
    if (pillars.some((p) => same(p, line))) continue;
    if (pillars.length >= MAX_PILLARS) {
      skipped.push({ line, reason: `Brand Voice holds ${MAX_PILLARS} pillars and this comparison offered more` });
      continue;
    }
    pillars.push(line);
  }
  return { statement: clean((advice as any)?.statement) || null, pillars, skipped };
}

/**
 * Adding: what's there stays, and what's new is appended — never past the
 * limit, never twice, and never silently.
 *
 * THE BUG THIS FIXES: three pillars were offered, two were added, and
 * nothing said why. The limit is real and the dedupe is right, but an
 * owner who presses Add and gets two of three should be told which one
 * did not fit before they press, not left to count.
 */
export function mergePillars(current: string[], offered: string[]): { pillars: string[]; skipped: SkippedPillar[] } {
  const out: string[] = [];
  const skipped: SkippedPillar[] = [];
  for (const line of current) {
    const value = clean(line);
    // What is already saved is kept whatever it says — an existing
    // pillar is the owner's, not this function's to edit.
    if (value && !out.some((p) => same(p, value))) out.push(value);
  }
  for (const line of offered) {
    const value = clean(line);
    if (!value) continue;
    if (out.some((p) => same(p, value))) {
      skipped.push({ line: value, reason: "it's already one of your pillars" });
      continue;
    }
    if (PRICE_IN_LINE.test(value)) {
      skipped.push({ line: value, reason: "it names a price, and a price belongs in your catalogue where it can change" });
      continue;
    }
    if (out.length >= MAX_PILLARS) {
      skipped.push({ line: value, reason: `you already have ${MAX_PILLARS} pillars, which is the most Brand Voice holds` });
      continue;
    }
    out.push(value);
  }
  return { pillars: out.slice(0, MAX_PILLARS), skipped };
}

/** How many of the offered lines would actually land, said BEFORE the click. */
export function wouldAdd(current: string[], offered: string[]): { adding: number; offered: number; skipped: SkippedPillar[] } {
  const merged = mergePillars(current, offered);
  return { adding: merged.pillars.length - current.filter((c) => clean(c)).length, offered: offered.length, skipped: merged.skipped };
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
