// What the business's own site already says — D2.
//
// The first bucket of the three-bucket onboarding: before asking a
// shopkeeper to type his opening hours into a form, read the page where
// he has already written them.
//
// NO NETWORK CALL. This reads `BusinessFacts`, which the caller has
// already gathered — `site.pages` arrives with its headings, paragraphs
// and buttons extracted, and `products` with the catalogue. Discovery
// costs one existing read and no outbound request, which is why the
// Hawlai-built site comes before any external one.
//
// ─────────────────────────────────────────────────────────────────────
// A PAGE SAYING SOMETHING IS NOT THE BUSINESS BEING SOMETHING
// ─────────────────────────────────────────────────────────────────────
//
// Everything here produces a SUGGESTION, which lives on
// `interview_answers` and is read by nothing in the facts layer
// (migration 232). The owner's tap is what turns it into a record. That
// separation is the whole design and this module must never shortcut
// it — nothing below writes to `business_knowledge` or
// `business_listing_facts`.
//
// `OFFER_PROMISES` already states the same idea in its own header:
// whether a business does bulk orders "is not something a pattern can
// do"; what a pattern can do is notice that the owner's own words
// mention it. That is exactly a discovery awaiting confirmation, and it
// is why this file reuses those patterns rather than writing new ones.
//
// ─────────────────────────────────────────────────────────────────────
// EXACTLY ONE, OR SAY NOTHING
// ─────────────────────────────────────────────────────────────────────
//
// THE DISCIPLINE THAT MAKES THIS SAFE TO SHOW A NON-TECHNICAL OWNER.
// Where a page carries two phone numbers, or three lines that look like
// an address, this suggests NOTHING. A single confident suggestion is
// something he can check in a glance and tap; a guess picked from
// several is something he has to think about, and a plausible wrong one
// is worse than a blank field — because a blank field does not invite a
// careless yes.
//
// RULE 3. The only vocabulary here is days of the week, clock time and
// a six-digit postcode — calendar and address shape, not trade. The
// same class as `TIME_WORDS` in factGaps, which carries the same note:
// a unit of time, in any trade. Every trade-specific pattern comes from
// OFFER_PROMISES, which the business's own catalogue feeds.

import { OFFER_PROMISES } from "@/lib/claims/offerPromises";
import { PHONE } from "@/lib/claims/guardBlocks";
import { samePhone } from "@/lib/seo/localPresence";
import type { BusinessFacts, SitePage } from "@/lib/claims/businessFacts";
import type { Suggestion } from "./suggestions";

/** Where a suggestion from this module came from. */
export const SITE_SOURCE = "hawlai_site";
export const CATALOGUE_SOURCE = "catalogue";

/** A day of the week, in the forms a site actually writes them. */
const DAY = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|s)?\b/i;
/** A clock time: 10am, 10:30, 18:00, 7 pm. */
const CLOCK = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/i;
/** An Indian postcode — six digits standing alone. */
const PIN = /(?<!\d)\d{6}(?!\d)/;

/** Every readable line of the site, in the order the pages give them. */
export function siteLines(facts: BusinessFacts | null | undefined): string[] {
  const out: string[] = [];
  for (const page of (facts?.site?.pages ?? []) as SitePage[]) {
    for (const group of [page.headings, page.paragraphs, page.buttons]) {
      for (const line of group ?? []) {
        const t = String(line ?? "").trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/**
 * The one line that matches, or null when none or several do.
 *
 * NULL FOR "SEVERAL" IS THE POINT, not an oversight — see the header.
 */
function theOnlyLine(lines: string[], matches: (line: string) => boolean): string | null {
  const hits = lines.filter(matches);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Distinct phone numbers across the whole site.
 *
 * "DISTINCT" IS `samePhone`'S JOB, NOT A SECOND NORMALISER. The first
 * version of this compared stripped digit strings, so "98765 43210" and
 * "+91 98765 43210" counted as TWO numbers and the site was refused as
 * ambiguous — a business that writes its number once with the country
 * code and once without would have got no suggestion at all.
 * `samePhone` already knows that a trunk zero and a country code are
 * not different numbers; it was written for exactly this in the Maps
 * leg.
 */
function phonesIn(lines: string[]): { shown: string; line: string }[] {
  const found: { shown: string; line: string }[] = [];
  for (const line of lines) {
    // `.match()`, never `.test()`: PHONE is a shared global regex.
    for (const hit of line.match(PHONE) ?? []) {
      // A SIX-DIGIT RUN IS A POSTCODE, NOT A PHONE, and the pattern
      // cannot tell them apart on its own. An Indian mobile is ten
      // digits, or twelve with the country code.
      if (hit.replace(/\D/g, "").replace(/^0+/, "").length < 10) continue;
      if (found.some((f) => samePhone(f.shown, hit))) continue;
      found.push({ shown: hit.trim(), line });
    }
  }
  return found;
}

/** The cheapest and dearest priced things in the catalogue. */
function priceSpan(facts: BusinessFacts | null | undefined): { low: number; high: number } | null {
  const prices = (facts?.products ?? [])
    .filter((p) => p.active !== false)
    .map((p) => Number(p.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return null;
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

/**
 * Everything this business's own site can suggest.
 *
 * Returns only what it is confident about. An empty list is a normal
 * answer and means "nothing here is unambiguous" — not that the site is
 * empty.
 */
export function discoverFromSite(facts: BusinessFacts | null | undefined): Suggestion[] {
  const lines = siteLines(facts);
  const out: Suggestion[] = [];
  const url = facts?.site?.url ?? null;

  // ---- the phone, when the site shows exactly one ------------------
  const phones = phonesIn(lines);
  if (phones.length === 1) {
    out.push({
      questionKey: "public_phone",
      value: phones[0].shown,
      source: "discovered",
      evidence: { sourceKind: SITE_SOURCE, url, quote: phones[0].line },
    });
  }

  // ---- opening hours: one line with a day AND a time ---------------
  const hours = theOnlyLine(lines, (l) => DAY.test(l) && CLOCK.test(l));
  if (hours) {
    out.push({
      questionKey: "opening_hours",
      // THE LINE ITSELF IS THE SUGGESTION. Reformatting it into a tidy
      // schedule would be this module deciding what his hours are from
      // a sentence it half understood; his own wording is the thing he
      // can recognise and correct.
      value: hours,
      source: "discovered",
      evidence: { sourceKind: SITE_SOURCE, url, quote: hours },
    });
  }

  // ---- the address: one line carrying a postcode -------------------
  const address = theOnlyLine(lines, (l) => PIN.test(l));
  if (address) {
    out.push({
      questionKey: "street_address",
      value: address,
      source: "discovered",
      // THE QUESTION IS COMPOUND AND ONLY HALF OF IT IS ANSWERED HERE.
      // "Do you want this shown publicly?" is a choice, not a fact, and
      // a page carrying an address is not permission to publish it —
      // the card asks that separately.
      evidence: { sourceKind: SITE_SOURCE, url, quote: address },
    });
  }

  // ---- the price range: computed, not read -------------------------
  const span = priceSpan(facts);
  if (span) {
    out.push({
      questionKey: "price_range",
      value:
        span.low === span.high
          ? `₹${span.low}`
          : `₹${span.low} to ₹${span.high}`,
      // INFERRED, NOT DISCOVERED: nobody wrote this sentence. It is
      // arithmetic over his catalogue, so there is no quote to show and
      // the owner is being asked to check a deduction.
      source: "inferred",
      evidence: { sourceKind: CATALOGUE_SOURCE, url: null, quote: null },
    });
  }

  // ---- the promises, which can only ever be a yes ------------------
  //
  // A page mentioning gift wrapping supports "yes". A page that never
  // mentions workshops supports NOTHING — absence is not denial, and a
  // suggested "no" would be this module putting a word in the owner's
  // mouth about something it simply did not find.
  for (const promise of OFFER_PROMISES) {
    const line = lines.find((l) => promise.pattern.test(l));
    if (!line) continue;
    out.push({
      questionKey: `promise_${promise.key}`,
      value: "yes",
      source: "discovered",
      evidence: { sourceKind: SITE_SOURCE, url, quote: line },
    });
  }

  return out;
}
