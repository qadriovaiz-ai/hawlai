// The claims check for departments whose output is a free-form object.
//
// Content, Email, Paid Ads, Retargeting and WhatsApp call guardGenerated
// directly. Brand Kit, Competitor Intelligence and the Research Agent
// called nothing at all: three departments, every one of them writing
// prose the owner reads and acts on, with no check that any of it was
// true. Brand Kit could answer "write that we're India's number 1 candle
// brand" by writing it.
//
// WHY A WRAPPER RATHER THAN guardGenerated ON ITS OWN: guardGenerated
// does not scrub invented contact details. That check (2026-09-29) was
// built for the website builder's block tree and has only ever run there
// — so an invented email address, the failure that loses enquiries
// silently, was never checked on any other surface. It belongs here.
//
// WHY NOT INSIDE guardOutput: it walks EVERY string in the object,
// including hrefs, hex colours and ids. A phone-shaped run of digits in a
// tracking URL is not a contact detail, and removing it breaks a link
// without making anything safer. This walks with the key in hand, so
// structural values are left alone and only words a person reads are
// touched.

import { stripUnsupported, claimsNote, priceWarningNote, type ClaimsMode } from "./claimCheck";
import { scrubInventedContacts } from "./guardBlocks";
import type { BusinessFacts } from "./businessFacts";

/**
 * Keys whose value is structure, not prose.
 *
 * A hex colour, a font stack, an image URL, an id. `stripUnsupported`
 * already runs over these through guardOutput and that is a pre-existing
 * compromise; the contact scrub is new, so it starts out not touching
 * them.
 */
const STRUCTURAL_KEY = /(^|_)(url|href|link|links|src|image|images|logo|icon|hex|colour|color|colors|colours|font|fonts|id|slug|handle_url|domain)($|_)/i;

/** A value that is plainly an address rather than a sentence. */
const STRUCTURAL_VALUE = /^(?:https?:\/\/|mailto:|tel:|#[0-9a-f]{3,8}$|\/)/i;

export type DepartmentGuardResult<T> = {
  output: T & { _claimsNote?: string; _contactsNote?: string };
  /** Claims taken out, in the guard's own words. */
  removed: string[];
  /** Contact details taken out because the business has none on record. */
  contactsRemoved: string[];
  priceWarnings: string[];
};

/** What the owner is told when an invented contact detail was taken out. */
export function contactsNote(removed: string[]): string | null {
  if (removed.length === 0) return null;
  const n = removed.length;
  return `Hawlai removed ${n === 1 ? "a contact detail" : `${n} contact details`} it had no record of (${removed.slice(0, 2).join("; ")}${n > 2 ? "; …" : ""}). Add the real one in Business Knowledge and Hawlai will use it instead of leaving it out.`;
}

/**
 * Strip invented contact details, then unsupported claims, from a
 * department's generated object.
 *
 * Returns a new object; the input is not modified. With no facts to check
 * against, nothing is stripped and nothing is claimed to have been — an
 * unreadable business is not a verified one.
 */
export function guardDepartmentOutput<T extends object>(
  output: T,
  facts: BusinessFacts | null | undefined,
  mode: ClaimsMode = "draft"
): DepartmentGuardResult<T> {
  if (!facts) {
    return { output: output as DepartmentGuardResult<T>["output"], removed: [], contactsRemoved: [], priceWarnings: [] };
  }

  const contactsRemoved: string[] = [];
  const removed: string[] = [];
  const priceWarnings: string[] = [];

  /** Whether a reader would see words here at all. */
  const hasWords = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, "").trim().length > 0;

  const walk = (value: unknown, key: string): unknown => {
    if (typeof value === "string") {
      // STRUCTURAL VALUES ARE LEFT ALONE BY BOTH CHECKS.
      //
      // Measured 2026-10-03: guardGenerated turns
      // "https://cdn.hawlai.online/logos/9876543210.png" into
      // "hawlai.online/logos/9876543210.png" — its link rule reads the
      // subdomain as a foreign host and takes the prefix out. That is a
      // broken image with no safety bought, and the contact scrub would
      // do the same to the ten digits in the path. Reported separately;
      // this wrapper simply never hands either check a URL, which is why
      // it walks with the key in hand instead of calling guardGenerated
      // on the whole object.
      if (!value.trim() || STRUCTURAL_KEY.test(key) || STRUCTURAL_VALUE.test(value.trim())) return value;

      const contacts = scrubInventedContacts(value, facts);
      contactsRemoved.push(...contacts.removed);
      const claims = stripUnsupported(contacts.text, facts, mode);
      removed.push(...claims.removed);
      priceWarnings.push(...claims.priceWarnings);
      return claims.text;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) {
        const next = walk(item, key);
        // An entry that was ONLY a claim goes with it: an "opportunity"
        // whose whole sentence was removed is not an opportunity, and a
        // blank bullet in the list explains nothing to the owner.
        if (hasWords(item) && !hasWords(next)) continue;
        out.push(next);
      }
      return out;
    }
    if (value && typeof value === "object") {
      const next: Record<string, unknown> = {};
      // Keys the agents use for their own notes are not content.
      for (const [k, v] of Object.entries(value)) next[k] = k.startsWith("_") ? v : walk(v, k);
      return next;
    }
    return value;
  };

  const walked = walk(output, "") as Record<string, unknown>;
  const contacts = Array.from(new Set(contactsRemoved));
  const claims = Array.from(new Set(removed));
  const prices = Array.from(new Set(priceWarnings));

  // TWO NOTES, NOT ONE, because the remedy differs. An unsupported claim
  // is fixed by recording it in Business Knowledge if it is true; a
  // missing email is fixed by giving Hawlai the real one. A single
  // sentence covering both tells the owner to do neither clearly.
  const claimsText = [claimsNote(claims), priceWarningNote(prices)].filter(Boolean).join(" ");
  const contactsText = contactsNote(contacts);

  return {
    output: {
      ...walked,
      ...(claimsText ? { _claimsNote: claimsText } : {}),
      ...(contactsText ? { _contactsNote: contactsText } : {}),
    } as DepartmentGuardResult<T>["output"],
    removed: claims,
    contactsRemoved: contacts,
    priceWarnings: prices,
  };
}
