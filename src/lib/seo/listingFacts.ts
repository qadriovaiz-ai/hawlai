// The listing facts, read and published only where they are true.
//
// I1 of docs/PLAN-AUTO-INTERVIEW.md. Migration 221 gives these facts
// somewhere to live; this file is the only thing that may read them,
// and it refuses a shape it does not recognise rather than publishing
// it.
//
// THE RULE, the same one structuredData.ts states for everything else:
// only what the business actually has. A field with no real value is
// left out, never filled with a plausible placeholder — structured data
// that claims an address the business never entered is worse than no
// structured data, because it is machine-readable and will be believed.
//
// AND A SECOND RULE THIS FILE ADDS: a value the owner has not agreed to
// publish is treated exactly like a value that is not there. `publish_phone`
// and `publish_street_address` default to false in the migration, so
// "collected" never silently becomes "published".
//
// Pure: no I/O, no model, no React. Every rule below is checked without
// a database.

/** The seven, lower case, as schema.org spells them before the URL. */
export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Day = (typeof DAYS)[number];

/** HH:MM on a 24-hour clock, and nothing else. */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * One interval of one day.
 *
 * `opens`/`closes` both null means CLOSED, stated. A day that is absent
 * from the array means nobody answered — a different fact, and the
 * reason this is not a map of seven keys.
 */
export type HoursInterval = { day: Day; opens: string | null; closes: string | null };

export type ListingFactsRow = {
  public_phone?: string | null;
  publish_phone?: boolean | null;
  opening_hours?: unknown;
  areas_served?: unknown;
  street_address?: string | null;
  publish_street_address?: boolean | null;
  instagram_url?: unknown;
  other_profile_urls?: unknown;
};

/** What a page may say about how to reach this business. */
export type ListingFacts = {
  /** Published only when the owner said so. */
  phone: string | null;
  hours: HoursInterval[];
  areasServed: string[];
  /** The street line, published only when the owner said so. */
  streetAddress: string | null;
  /** Profile URLs, de-duplicated, in a stable order. */
  sameAs: string[];
};

export const EMPTY_LISTING_FACTS: ListingFacts = {
  phone: null,
  hours: [],
  areasServed: [],
  streetAddress: null,
  sameAs: [],
};

function text(value: unknown, max = 200): string | null {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/**
 * An http(s) URL, or null.
 *
 * WHY THIS IS STRICT. `sameAs` is a claim that this other page is the
 * same business, and a reader follows it. "instagram.com/shop" without a
 * scheme is a relative link once it is in markup — it would resolve
 * against the storefront and point at a page on the business's own site
 * that does not exist. A `javascript:` or `data:` URL in a published
 * attribute is worse than a broken one.
 */
export function profileUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".")) return null;
  return parsed.toString();
}

/**
 * The hours, as far as they are readable.
 *
 * ONE BAD INTERVAL DOES NOT THROW THE WEEK AWAY. A row whose Tuesday is
 * malformed still has a true Monday, and dropping the lot would make
 * the page say less than the owner told it. Each interval is kept or
 * dropped on its own, and the order the owner gave is preserved so a
 * lunch break reads in the order it happens.
 *
 * A CLOSED DAY SURVIVES. {day, null, null} is an answer — "we are shut
 * on Sunday" is a fact a customer needs — so it is kept, while a day
 * with one time and not the other is nonsense and is dropped.
 */
export function readHours(value: unknown): HoursInterval[] {
  if (!Array.isArray(value)) return [];
  const out: HoursInterval[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const day = String((entry as any).day ?? "").toLowerCase().trim();
    if (!(DAYS as readonly string[]).includes(day)) continue;
    const opens = (entry as any).opens ?? null;
    const closes = (entry as any).closes ?? null;
    if (opens === null && closes === null) {
      out.push({ day: day as Day, opens: null, closes: null });
      continue;
    }
    const o = String(opens ?? "").trim();
    const c = String(closes ?? "").trim();
    // BOTH OR NEITHER. "Opens at 10:00" with no closing time cannot be
    // published as an interval and must not be guessed into one.
    if (!TIME.test(o) || !TIME.test(c)) continue;
    // A closing time at or before the opening time is not a window.
    // Midnight closing is written 00:00 and would read as "closes
    // before it opens", so it is refused rather than reinterpreted —
    // an owner who is open past midnight needs a shape this does not
    // have yet, and inventing one here would be guessing.
    if (c <= o) continue;
    out.push({ day: day as Day, opens: o, closes: c });
  }
  return out;
}

/** The places, cleaned, de-duplicated, order kept. */
export function readAreas(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const place = text(entry, 80);
    if (!place) continue;
    const key = place.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

/**
 * Every profile URL for this business, derived first.
 *
 * DERIVED RATHER THAN STORED, where it can be: `google_place_id` and
 * `fb_page_id` are already on the dealerships row, and giving them a
 * second home in migration 221 is how two spellings of one fact come to
 * disagree. Instagram is stored because `instagram_business_id` is not
 * a public profile URL and cannot be turned into one.
 */
export function sameAsFor(
  row: ListingFactsRow | null | undefined,
  derived: { googlePlaceId?: string | null; facebookPageId?: string | null }
): string[] {
  const out: string[] = [];
  const add = (url: string | null) => {
    if (url && !out.includes(url)) out.push(url);
  };

  if (derived.googlePlaceId?.trim()) {
    add(profileUrl(`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(derived.googlePlaceId.trim())}`));
  }
  if (derived.facebookPageId?.trim()) {
    add(profileUrl(`https://www.facebook.com/${encodeURIComponent(derived.facebookPageId.trim())}`));
  }
  add(profileUrl(row?.instagram_url));
  if (Array.isArray(row?.other_profile_urls)) {
    for (const entry of row!.other_profile_urls as unknown[]) add(profileUrl(entry));
  }
  return out;
}

/**
 * The row, as a page may use it.
 *
 * A missing row is not an error: a business that has not answered the
 * interview publishes what it has always published, which is the city
 * and nothing else.
 */
export function readListingFacts(
  row: ListingFactsRow | null | undefined,
  derived: { googlePlaceId?: string | null; facebookPageId?: string | null } = {}
): ListingFacts {
  const sameAs = sameAsFor(row, derived);
  if (!row) return { ...EMPTY_LISTING_FACTS, sameAs };
  return {
    // THE PUBLISH FLAG IS THE GATE, not the presence of a value.
    phone: row.publish_phone === true ? text(row.public_phone, 40) : null,
    hours: readHours(row.opening_hours),
    areasServed: readAreas(row.areas_served),
    streetAddress: row.publish_street_address === true ? text(row.street_address, 200) : null,
    sameAs,
  };
}

/** Whether there is anything here at all worth putting in a graph. */
export function hasAnyListingFact(facts: ListingFacts): boolean {
  return Boolean(facts.phone || facts.hours.length || facts.areasServed.length || facts.streetAddress || facts.sameAs.length);
}

/**
 * The hours as schema.org wants them.
 *
 * A closed day is emitted with no opens/closes, which is how
 * schema.org says "this day is not a window" — the day is still named,
 * because "shut on Sunday" is the answer a customer is looking for and
 * leaving the day out says only that nobody mentioned it.
 */
export function openingHoursSpecification(hours: HoursInterval[]): Record<string, unknown>[] {
  return hours.map((h) => {
    const day = `https://schema.org/${h.day[0].toUpperCase()}${h.day.slice(1)}`;
    if (h.opens === null || h.closes === null) {
      return { "@type": "OpeningHoursSpecification", dayOfWeek: day };
    }
    return { "@type": "OpeningHoursSpecification", dayOfWeek: day, opens: h.opens, closes: h.closes };
  });
}
