// Checking that a competitor finding came from a page that exists.
//
// Strategy's Positioning module has refused an uncited competitor claim
// since 2026-09-19: it builds claims OUT OF citations, and drops any
// quote from a page that isn't about the competitor named. The
// Competitors page — the one most owners actually open — shared none of
// that code. It asked the model to search, parsed whatever JSON came
// back, and showed it. A price with no source and a price the model
// remembered looked identical on screen.
//
// WHY NOT THE CLAIMS STRIP INSTEAD: measured 2026-10-03, it deletes a
// competitor's price and a competitor's own boast in full, because it
// checks every claim against what THIS business can back up and those
// correctly are not on our record — and they are the finding. The right
// question for someone else's business is not "can we back this?" but
// "which page said so?".
//
// WHAT IS AND ISN'T CHECKABLE, stated plainly because the limit matters:
// prose can't be matched to a quote without guessing. NUMBERS can. A
// price, a follower count, a percentage, a store count — those are what
// an owner would act on and misreport, and every one of them either
// appears in a cited page or doesn't.

import { citationsOf, mentions, readsAsNational } from "@/lib/strategy/positioning/collect";

export type Source = { url: string; title: string | null; quote: string };

export type CitationCheck = {
  /** Cited pages that are genuinely about this competitor. */
  sources: Source[];
  /** Figures in the answer that no cited page contains. */
  unverified: string[];
  /** Figures that a cited page does contain. */
  verified: string[];
};

/** Category words aren't distinctive: "candles" doesn't identify a candle brand. */
function categoryWords(category: string): string[] {
  const words = String(category ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
  return [...words, ...words.map((w) => (w.endsWith("s") ? w.slice(0, -1) : `${w}s`))];
}

/**
 * Figures a reader would act on, out of a generated answer.
 *
 * Deliberately narrow. Years, and small counts under two digits, are
 * skipped: "4 collections" is a shape of the answer rather than a datum,
 * and flagging it would bury the price nobody can source. Percentages
 * and money are always taken.
 */
export function figuresIn(value: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown, key: string) => {
    if (typeof node === "string") {
      // Sources, URLs and the provenance note are not claims.
      if (/(^|_)(url|href|source|link|src|image)($|_)/i.test(key) || /^https?:\/\//i.test(node.trim())) return;
      for (const m of node.match(/(?:₹|rs\.?\s?|inr\s?)\s?[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?\s?%|\b\d[\d,]{2,}(?:\.\d+)?\+?/gi) ?? []) {
        const text = m.trim();
        // A year is a date, not a measurement.
        if (/^\d{4}$/.test(text.replace(/[^\d]/g, "")) && Number(text) >= 1900 && Number(text) <= 2100) continue;
        found.push(text);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, key));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith("_")) continue;
        walk(v, k);
      }
    }
  };
  walk(value, "");
  return Array.from(new Set(found));
}

/** Every number in a piece of text, however it is punctuated. */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * The forms one figure can take, so "₹1,450" matches "Rs 1450.00" and
 * both match "₹1,450." at the end of a sentence.
 *
 * THE BUG THIS REPLACES, which is worth naming because it failed in the
 * safe-looking direction: the first version stripped non-digits and then
 * dropped trailing zeros whenever the text contained a full stop. A
 * price quoted at the end of a sentence — "jar candle — ₹1,450." — made
 * that test true, so "1450" became "145", matched nothing, and a price
 * that WAS on the cited page was reported to the owner as unconfirmed.
 * A check that cries wolf is a check people learn to ignore.
 */
function normalForms(value: string): string[] {
  const plain = value.replace(/[^\d.]/g, "").replace(/\.+$/, "");
  const forms = new Set<string>([plain.replace(/\./g, "")]);
  // "1450.00" is the same money as "1450".
  const decimal = plain.match(/^(\d+)\.(\d{1,2})$/);
  if (decimal) forms.add(decimal[1]);
  return Array.from(forms).filter(Boolean);
}

/**
 * Which pages a reply really cited about this competitor, and which of
 * its figures those pages actually contain.
 */
export function checkCitations(
  data: any,
  competitor: { name: string; url?: string | null },
  category: string,
  output: unknown
): CitationCheck {
  const cat = categoryWords(category);
  const sources = citationsOf(data)
    // A quote from a page that isn't about this competitor isn't its
    // claim — the same filter Positioning applies.
    .filter((c) => mentions(competitor.name, `${c.title} ${c.url} ${c.quote}`, cat) || (competitor.url ? sameHost(c.url, competitor.url) : false))
    .slice(0, 8)
    .map((c) => ({ url: c.url, title: c.title || null, quote: c.quote }));

  const cited = sources.map((s) => `${s.quote} ${s.title ?? ""}`).join(" \n ");
  const citedNumbers = new Set((cited.match(NUMBER) ?? []).flatMap(normalForms));

  const verified: string[] = [];
  const unverified: string[] = [];
  for (const figure of figuresIn(output)) {
    const forms = normalForms(figure);
    (forms.length > 0 && forms.some((form) => citedNumbers.has(form)) ? verified : unverified).push(figure);
  }

  return { sources, verified, unverified };
}

function sameHost(a: string, b: string): boolean {
  try {
    const host = (u: string) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    return host(a) === host(b);
  } catch {
    return false;
  }
}

/**
 * What the owner is told when the answer cites nothing about this
 * competitor at all.
 *
 * This is a refusal, not a warning. All four tasks on this page are "go
 * and find out what X does"; an answer assembled without a single page
 * about X is the model's recollection, and showing it beside a sourced
 * one teaches the owner to trust both equally.
 */
export const NOTHING_CITED =
  "I couldn't find a page about this competitor to read, so I'm not going to tell you what they charge or publish — it would be guesswork. Check the name and spelling, or paste a link to their site or Instagram and I'll read that.";

/**
 * Whether the pages we read describe a business this owner can be
 * measured against.
 *
 * WHY THIS IS HERE AND NOT ONLY IN STRATEGY: the tiering shipped on
 * 2026-09-20 after a two-product candle maker in Shahjahanpur was shown
 * EKAM — a brand in hundreds of stores — and then compared with it claim
 * for claim. It only ever applied on the Strategy page. This page is the
 * one an owner opens to type a competitor's name, and it applied none of
 * it: the answer read the same whether the name belonged to a neighbour
 * or to a national chain.
 *
 * Judged from the cited evidence, not from the name — the same rule
 * Strategy uses, reading what the pages SAY about size rather than what
 * anyone assumed.
 */
export function tierFromSources(sources: Source[], output: unknown): "comparable" | "national" {
  const evidence = [
    ...sources.map((s) => `${s.title ?? ""} ${s.quote}`),
    JSON.stringify(output ?? {}),
  ].join(" \n ");
  return readsAsNational(evidence) ? "national" : "comparable";
}

/** What the owner is told when the competitor they asked about is out of their league. */
export const NATIONAL_NOTE =
  "From what I read, this one looks like a national brand — in a lot of stores, or funded, or on the big marketplaces. Worth knowing what they do, but don't measure yourself against them line by line: they're not competing for the same customer on the same terms. The businesses to compare with are the ones your customer would actually weigh you against.";

/** What the owner is told about figures no cited page contains. */
export function unverifiedNote(unverified: string[]): string | null {
  if (unverified.length === 0) return null;
  const n = unverified.length;
  return `Treat ${n === 1 ? "this figure" : "these figures"} as unconfirmed — ${unverified.slice(0, 3).join(", ")}${n > 3 ? ", …" : ""}: ${n === 1 ? "it doesn't" : "they don't"} appear on any page I could read about them, so ${n === 1 ? "it" : "they"} may be out of date or wrong. Everything else here is quoted from the sources listed.`;
}
