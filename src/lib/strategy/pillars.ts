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

export type AcceptedPositioning = { statement: string | null; pillars: string[] };

type Advice = { statement?: unknown; angles?: unknown } | null;

/** The pillars on offer from a comparison's advice, in the order it gave them. */
export function pillarsFrom(advice: Advice): AcceptedPositioning {
  const angles = Array.isArray((advice as any)?.angles) ? (advice as any).angles : [];
  const pillars: string[] = [];
  for (const a of angles) {
    const line = clean(a?.title);
    if (!line) continue;
    if (pillars.some((p) => same(p, line))) continue;
    pillars.push(line);
    if (pillars.length >= MAX_PILLARS) break;
  }
  return { statement: clean((advice as any)?.statement) || null, pillars };
}

/** Adding: what's there stays, and what's new is appended — never past the limit, never twice. */
export function mergePillars(current: string[], offered: string[]): string[] {
  const out: string[] = [];
  for (const line of [...current, ...offered]) {
    const value = clean(line);
    if (!value || out.some((p) => same(p, value))) continue;
    out.push(value);
    if (out.length >= MAX_PILLARS) break;
  }
  return out;
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
