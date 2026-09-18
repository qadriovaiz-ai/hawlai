// Where this business stands against what competitors say (Advanced
// Strategy step 3, approved 2026-09-19).
//
// Division of labour, same as the diagnosis (../diagnosis.ts): the model
// only SORTS — each competitor quote and each of the business's own facts
// into themes (./themes.ts), validated against the list. Code COUNTS: how
// many competitors claim each theme, which themes are crowded, which are
// open, and where the business has facts of its own. The model then WRITES
// a positioning line and angles from that table, and every number it uses
// must be one code counted (or a real price), every angle must rest on a
// theme the business has facts for, and the claims guard runs on the words.

import { callClaude, type AiFailure } from "@/lib/ai/claude";
import { getModel } from "@/lib/models";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims } from "@/lib/claims/claimCheck";
import type { Claim } from "./collect";
import type { Theme } from "./themes";

type LogContext = { supabase: any; dealershipId: string };

/** One thing the business can stand behind, numbered for the model. */
export type OwnFact = { label: string; text: string };

/** The business's own facts, in the order the owner would recognise them. */
export function ownFactsFrom(f: BusinessFacts): OwnFact[] {
  const out: OwnFact[] = [];
  for (const k of f.ownerFacts ?? []) {
    const text = String(k.content ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push({ label: String(k.title || k.category || "Business fact"), text: text.slice(0, 300) });
  }
  for (const p of (f.products ?? []).filter((x) => x.active !== false)) {
    const kind = p.kind === "service" ? "Service" : "Product";
    const desc = p.description ? ` — ${String(p.description).replace(/\s+/g, " ").slice(0, 150)}` : "";
    out.push({ label: `${kind}: ${p.name}`, text: `₹${p.price}${desc}` });
  }
  for (const o of f.offers ?? []) out.push({ label: `Offer: ${o.code}`, text: o.label });
  if (f.shipping) {
    const s = f.shipping;
    const text = s.mode === "free" || s.rate === 0 ? "Free shipping" : s.rate != null ? `₹${s.rate} shipping${s.freeThreshold ? `, free over ₹${s.freeThreshold}` : ""}` : `Shipping: ${s.mode}`;
    out.push({ label: "Shipping", text });
  }
  return out.slice(0, 40);
}

function jsonIn(text: string): any | null {
  const body = String(text ?? "").replace(/```json|```/g, "");
  const at = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (at < 0 || end <= at) return null;
  try {
    return JSON.parse(body.slice(at, end + 1));
  } catch {
    return null;
  }
}

/** Only theme keys that exist, at most two, once each. */
function validThemes(value: unknown, keys: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((k) => keys.has(k)))].slice(0, 2);
}

/**
 * Files every competitor quote and every own fact under the themes. The
 * model's answer is only trusted for theme keys that exist and indexes that
 * were asked about; anything else is dropped.
 */
export async function classifyThemes(
  claims: Claim[],
  facts: OwnFact[],
  themes: Theme[],
  logContext?: LogContext
): Promise<{ ok: true; claimThemes: string[][]; factThemes: string[][] } | { ok: false; failure: AiFailure }> {
  const keys = new Set(themes.map((t) => t.key));
  const r = await callClaude(
    {
      model: getModel("standard"),
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: `Sort each item under the theme(s) it is actually about. Use ONLY these theme keys:
${themes.map((t) => `- ${t.key}: ${t.label} (${t.hint})`).join("\n")}

An item can have at most 2 themes, or none if it fits none. Judge only by what the words say — don't infer.

Competitor quotes:
${claims.map((c, i) => `C${i}: ${c.quote}`).join("\n") || "(none)"}

This business's own facts:
${facts.map((f, i) => `F${i}: ${f.label} — ${f.text}`).join("\n") || "(none)"}

Return JSON only: {"claims":{"0":["theme_key"]},"facts":{"0":["theme_key"]}} — keys are the item numbers without the letter.`,
      }],
    },
    { operation: "positioning_themes", logContext: logContext ?? null }
  );
  if (!r.ok) return { ok: false, failure: r.failure };
  const parsed = jsonIn(r.text) ?? {};
  const claimThemes = claims.map((_, i) => validThemes(parsed.claims?.[String(i)], keys));
  const factThemes = facts.map((_, i) => validThemes(parsed.facts?.[String(i)], keys));
  return { ok: true, claimThemes, factThemes };
}

export type ThemeStanding = "crowded" | "contested" | "open";

export type ThemeRow = {
  key: string;
  label: string;
  /** Competitors that say this, by name. */
  claimedBy: string[];
  /** Up to two of their own words, with where they said it. */
  examples: { competitor: string; quote: string; url: string | null }[];
  /** This business's own facts that speak to it. */
  yourFacts: string[];
  standing: ThemeStanding;
};

export type Positioning = {
  competitorCount: number;
  rows: ThemeRow[];
  /** Few competitors say it, and the business has facts to say it with. */
  whiteSpace: string[];
  /** Everyone says it, and so could the business — a sharper angle needed. */
  crowdedYouHave: string[];
  /** Nobody says it, but the business has nothing on record to say it with either. */
  openUnbacked: string[];
};

/**
 * Pure counting. Crowded: at least half the competitors (and at least two).
 * Open: at most one of three or more (none when there are fewer).
 */
export function buildPositioning(
  competitors: string[],
  claims: Claim[],
  claimThemes: string[][],
  facts: OwnFact[],
  factThemes: string[][],
  themes: Theme[]
): Positioning {
  const total = competitors.length;
  const crowdedAt = Math.max(2, Math.ceil(total / 2));
  const openAt = total >= 3 ? 1 : 0;
  const rows: ThemeRow[] = themes.map((t) => {
    const matching = claims.filter((_, i) => (claimThemes[i] ?? []).includes(t.key));
    const claimedBy = [...new Set(matching.map((c) => c.competitor))].filter((n) => competitors.includes(n));
    const examples: ThemeRow["examples"] = [];
    for (const name of claimedBy) {
      const c = matching.find((m) => m.competitor === name);
      if (c && examples.length < 2) examples.push({ competitor: c.competitor, quote: c.quote, url: c.url });
    }
    const yourFacts = facts.filter((_, i) => (factThemes[i] ?? []).includes(t.key)).map((f) => f.label);
    const standing: ThemeStanding = claimedBy.length >= crowdedAt ? "crowded" : claimedBy.length <= openAt ? "open" : "contested";
    return { key: t.key, label: t.label, claimedBy, examples, yourFacts, standing };
  });
  return {
    competitorCount: total,
    rows,
    whiteSpace: rows.filter((r) => r.standing === "open" && r.yourFacts.length > 0).map((r) => r.key),
    crowdedYouHave: rows.filter((r) => r.standing === "crowded" && r.yourFacts.length > 0).map((r) => r.key),
    openUnbacked: rows.filter((r) => r.standing === "open" && r.yourFacts.length === 0).map((r) => r.key),
  };
}

export type Angle = { theme: string; title: string; why: string };
export type PositioningAdvice = { statement: string | null; angles: Angle[]; removed: string[] };

/** Numbers the advice may use: the counts, and the business's real prices. */
export function allowedNumbers(p: Positioning, f: BusinessFacts | null): Set<string> {
  const out = new Set<string>([String(p.competitorCount)]);
  for (const r of p.rows) out.add(String(r.claimedBy.length));
  for (const prod of f?.products ?? []) out.add(String(Math.round(Number(prod.price))));
  if (f?.shipping?.rate != null) out.add(String(f.shipping.rate));
  if (f?.shipping?.freeThreshold != null) out.add(String(f.shipping.freeThreshold));
  // Figures the owner wrote themselves ("sets in 24 hours") are theirs to use.
  const ownWords = [...(f?.ownerFacts ?? []).map((k) => k.content), ...(f?.products ?? []).map((p) => p.description ?? "")].join(" ");
  for (const m of ownWords.matchAll(/\d[\d,]*/g)) out.add(String(Number(m[0].replace(/,/g, ""))));
  return out;
}

/** Figures in `text` that aren't allowed. Ordinals and years aren't counted as claims. */
export function unallowedNumbers(text: string, allowed: Set<string>): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(/(?<![\w.])₹?\s?(\d[\d,]*(?:\.\d+)?)\s*(%|\+)?/g)) {
    const n = m[1].replace(/,/g, "");
    if (/^(19|20)\d\d$/.test(n)) continue;
    if (m[2] === "%" || !allowed.has(String(Math.round(Number(n)))) || n.includes(".")) out.push(m[0].trim());
  }
  return out;
}

/**
 * Keeps only advice the table and the facts back up. An angle must rest on
 * a theme the business has facts for; any figure must be a count or a real
 * price; and the claims guard must find nothing it can't verify.
 */
export function verifyPositioning(raw: any, p: Positioning, f: BusinessFacts | null): PositioningAdvice {
  const allowed = allowedNumbers(p, f);
  const usable = new Set([...p.whiteSpace, ...p.crowdedYouHave, ...p.rows.filter((r) => r.standing === "contested" && r.yourFacts.length).map((r) => r.key)]);
  const removed: string[] = [];
  const problems = (text: string) => [...unallowedNumbers(text, allowed).map((n) => `${n} isn't a number Hawlai counted`), ...(f ? findUnsupportedClaims(text, f) : [])];

  let statement: string | null = String(raw?.statement ?? "").trim() || null;
  if (statement) {
    const bad = problems(statement);
    if (bad.length) {
      removed.push(`The positioning line — ${bad.join("; ")}`);
      statement = null;
    }
  }

  const angles: Angle[] = [];
  for (const a of Array.isArray(raw?.angles) ? raw.angles : []) {
    const angle = { theme: String(a?.theme ?? ""), title: String(a?.title ?? "").trim(), why: String(a?.why ?? "").trim() };
    if (!angle.title || !angle.why) continue;
    if (!usable.has(angle.theme)) {
      removed.push(`"${angle.title}" — it isn't backed by anything on record for this business`);
      continue;
    }
    const bad = problems(`${angle.title} ${angle.why}`);
    if (bad.length) {
      removed.push(`"${angle.title}" — ${bad.join("; ")}`);
      continue;
    }
    angles.push(angle);
    if (angles.length >= 3) break;
  }
  return { statement, angles, removed };
}

/** The table, in words the model is told to rely on and nothing else. */
export function formatPositioningForPrompt(p: Positioning, facts: OwnFact[]): string {
  const lines = p.rows.map((r) => {
    const said = r.claimedBy.length ? `${r.claimedBy.length} of ${p.competitorCount} competitors say this${r.examples[0] ? ` (e.g. ${r.examples[0].competitor}: "${r.examples[0].quote}")` : ""}` : `none of the ${p.competitorCount} competitors say this`;
    const yours = r.yourFacts.length ? `this business has: ${r.yourFacts.join("; ")}` : "this business has nothing on record for it";
    return `- [${r.key}] ${r.label} — ${r.standing.toUpperCase()}: ${said}; ${yours}.`;
  });
  return `WHAT COMPETITORS SAY, COUNTED (the only numbers you may use):
${lines.join("\n")}

THIS BUSINESS'S OWN FACTS (the only things you may claim for it):
${facts.map((f) => `- ${f.label}: ${f.text}`).join("\n") || "- (none on record)"}`;
}

export async function writePositioning(
  p: Positioning,
  facts: OwnFact[],
  businessFacts: BusinessFacts | null,
  businessName: string,
  logContext?: LogContext
): Promise<{ ok: true; advice: PositioningAdvice } | { ok: false; failure: AiFailure }> {
  const r = await callClaude(
    {
      model: getModel("standard"),
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are positioning "${businessName}" against its competitors for a small business owner.

${formatPositioningForPrompt(p, facts)}

RULES:
- Lead with OPEN ground this business has facts for; then CROWDED ground only if its facts give a sharper, more specific version than competitors'.
- Every angle names one theme key from the table and rests on this business's own facts listed for that theme. Never claim anything not in its facts — no invented offers, results, awards or numbers.
- The only numbers you may write are the competitor counts in the table and prices from the facts.
- Don't disparage competitors; say what this business can own.
- Plain words the owner would say. Positioning line: one sentence. 2–3 angles; each "why" at most 2 sentences and cites the count it rests on.

Return JSON only: {"statement":"one sentence","angles":[{"theme":"theme_key","title":"short","why":"what to say and why, citing the count"}]}`,
      }],
    },
    { operation: "positioning_write", logContext: logContext ?? null }
  );
  if (!r.ok) return { ok: false, failure: r.failure };
  return { ok: true, advice: verifyPositioning(jsonIn(r.text) ?? {}, p, businessFacts) };
}
