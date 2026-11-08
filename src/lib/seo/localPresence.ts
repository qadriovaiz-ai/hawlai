// Can a stranger nearby find this business, and do its records agree?
//
// G5 of docs/AUDIT-GROWTH-LOOP.md, which is L2 of docs/PLAN-LOCAL-SEO.md.
// The technical audit already reads the site and finds missing titles and
// duplicate body text. This is the same shape pointed at local facts.
//
// THE MAPS LEG IS HERE SINCE 8 NOVEMBER 2026, and the reason it was not
// before is worth keeping: L2 called it "the one check that needs the
// Places read Hawlai already does", but that read
// (lib/google/findPlaceCandidates) is a TEXT SEARCH field-masked to id,
// displayName, formattedAddress, rating and userRatingCount — no phone,
// and nothing stored but `google_place_id`. Comparing on a schedule
// needed a Place Details read, and the phone field puts that on the
// Enterprise SKU. The founder took that cost knowingly: free for the
// first 1,000 requests a month, which at one per business per month is a
// thousand businesses.
//
// THE COMPARISON ITSELF IS STILL FREE AND STILL DAILY. It reads
// `place_snapshots` (migration 225), which the monthly `place_snapshot`
// subsystem writes. Nothing in this file calls Google.
//
// AND THERE IS STILL A REAL MISMATCH TO FIND WITHOUT IT. Hawlai holds
// the business's address TWICE, entered by hand on two different screens:
//
//   dealerships.business_address      the postal address the law puts in
//                                     every marketing email's footer
//                                     (migration 181)
//   business_listing_facts.street_address  the street line published in
//                                     the site's structured data
//                                     (migration 221)
//
// A customer who gets an email and a customer who reads the site can
// therefore be given two different addresses, and that is both a local
// search problem and a plain honesty problem. Nothing compared them
// until now.
//
// WHAT IS DELIBERATELY NOT COMPARED: the phone. `owner_whatsapp_number`
// is the OWNER's number and `public_phone` is the business's published
// one — those are legitimately different things, and calling the
// difference a fault would train the owner to ignore this check.
//
// Pure: no I/O, no model, no React. Every rule about what a gap MEANS is
// testable without a database.

import type { Finding } from "./technicalAudit";
import type { ListingFacts } from "./listingFacts";

/**
 * The same text, as far as a reader is concerned.
 *
 * Case, spacing and punctuation only. ABBREVIATIONS ARE NOT EXPANDED:
 * "Rd" and "Road" are reported as different, and that is correct rather
 * than a false positive — the fix for a local listing is for the two
 * records to be identical, which is what every NAP-consistency guide
 * asks for, and a product that silently treated them as the same would
 * be hiding the thing it was asked to find. Nothing here is specific to
 * any trade or country beyond stripping punctuation.
 */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    String(v ?? "")
      .toLowerCase()
      .replace(/[.,#\-/\\()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const x = norm(a);
  const y = norm(b);
  // TWO BLANKS ARE NOT A MATCH, they are nothing to compare. A caller
  // that read this as "they agree" would report a business with no
  // address anywhere as consistent.
  if (!x || !y) return false;
  return x === y;
}

/**
 * The same phone number, however it is written.
 *
 * DIGITS ONLY, THEN A SUFFIX MATCH. "+91 90000 00000", "090000 00000"
 * and "9000000000" are one number written three ways, and Maps returns
 * the national format while an owner types whatever he types. Comparing
 * the text would report a disagreement every single day for a business
 * whose number is perfectly correct — a check that cries wolf is a check
 * the owner turns off.
 *
 * NO COUNTRY CODE IS HARDCODED, and no fixed national length either.
 * Rule 3 applies to a dialling plan as much as to a trade: this product
 * is for India today, and a hardcoded 91 or a fixed ten digits would be
 * a guess about everywhere else.
 *
 * THREE STEPS, in this order:
 *   1. keep the digits
 *   2. DROP LEADING ZEROS. A national significant number does not begin
 *      with one anywhere — the leading zero is a trunk prefix a caller
 *      dials, not part of the number. Dropping it from both sides is
 *      what makes a suffix match work: "+91 90000 00000" is
 *      919000000000 and "090000 00000" is 09000000000, and the second is
 *      NOT a suffix of the first until the zero goes. A country that
 *      keeps a zero inside the international form, like Italy's 06, is
 *      unaffected: nothing is stripped from the middle.
 *   3. the shorter must be a suffix of the longer, which covers a
 *      country prefix on one side, on both, or on neither.
 *
 * AT LEAST SEVEN DIGITS ON BOTH SIDES, or nothing is compared: a suffix
 * match on three digits would call every number the same.
 *
 * THE RESIDUAL RISK, stated rather than hidden: two genuinely different
 * numbers where one is a suffix of the other still match. Seven digits
 * makes that unlikely and the alternative is worse — an exact text
 * comparison reports a disagreement every single day for a number that
 * is perfectly correct, and a check that cries wolf is a check the owner
 * turns off.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const x = digits(a);
  const y = digits(b);
  if (x.length < 7 || y.length < 7) return false;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return longer.endsWith(shorter);
}

/** Whether a city name appears in a page's words. */
export function mentionsCity(text: string | null | undefined, city: string | null | undefined): boolean {
  const c = String(city ?? "").trim().toLowerCase();
  if (!c) return false;
  return String(text ?? "").toLowerCase().includes(c);
}

export type LocalInput = {
  /** The street line the site publishes, and the rest of the listing facts. */
  facts: ListingFacts;
  /** The street line on record for the email footer. */
  emailAddress: string | null | undefined;
  /** Whether the owner put a street address on record at all. */
  addressOnRecord: string | null | undefined;
  /** Whether the owner chose to publish it. */
  addressPublished: boolean;
  /** Whether a phone is on record, published or not. */
  phoneOnRecord: string | null | undefined;
  /** The business's city, as the business itself states it. */
  city: string | null | undefined;
  /** What the business calls itself, for the comparison with Maps. */
  businessName?: string | null | undefined;
  /** The words on the page a stranger lands on. */
  landingText: string | null | undefined;
  /** Whether anything ties the site to a Maps listing. */
  placeId: string | null | undefined;
  /**
   * What Google Maps said, last time it was asked (migration 225).
   *
   * NULL MEANS NOBODY HAS ASKED YET, which is not the same as "Maps
   * agrees". A missing snapshot compares nothing rather than reporting a
   * clean result — the same rule as an empty `removed_kinds` in I6.
   */
  snapshot?: {
    placeId: string | null | undefined;
    name: string | null | undefined;
    address: string | null | undefined;
    phone: string | null | undefined;
  } | null;
};

/**
 * What is missing, and what disagrees.
 *
 * ORDERED BY PRIORITY, highest first, so a caller that shows one shows
 * the one that costs the most.
 */
export function localFindings(input: LocalInput): Finding[] {
  const out: Finding[] = [];
  const facts = input.facts;

  // TWO ADDRESSES THAT DISAGREE IS THE HIGH ONE. Both reach customers:
  // one in every marketing email, one in the site's structured data.
  if (
    String(input.emailAddress ?? "").trim() &&
    String(input.addressOnRecord ?? "").trim() &&
    !sameText(input.emailAddress, input.addressOnRecord)
  ) {
    out.push({
      code: "address_disagrees",
      problem: "The address in your emails and the address on your site are not written the same way.",
      impact:
        "A customer gets one of them in an email and reads the other on the site, and search engines treat a business whose address is written two ways as two weaker records instead of one strong one.",
      fix: "Pick one wording and use it in both places — Settings for the email footer, and the business details for the site.",
      priority: "high",
      where: [],
    });
  }

  if (!String(input.phoneOnRecord ?? "").trim()) {
    out.push({
      code: "no_public_phone",
      problem: "There is no phone number on record for customers to call.",
      impact: "Someone nearby who is ready to buy has no way to reach you except a form, and a listing with no phone ranks below one that has one.",
      fix: "Add the number you want customers to use in your business details.",
      priority: "high",
      where: [],
    });
  } else if (!facts.phone) {
    // THE OWNER'S CHOICE, NOT A FAULT. He put a number on record and
    // then said not to publish it. Worth telling him what it costs,
    // worded as a trade and not as a mistake — a check that scolds the
    // owner for a decision he made on purpose is a check he stops
    // reading.
    out.push({
      code: "phone_not_published",
      problem: "Your phone number is on record but set not to appear publicly.",
      impact: "The site and your Maps listing cannot show the same number, which is one of the things local search compares.",
      fix: "Turn publishing on in your business details if you want calls, or leave it off — this is your call, not a problem to fix.",
      priority: "low",
      where: [],
    });
  }

  if (facts.hours.length === 0) {
    out.push({
      code: "no_opening_hours",
      problem: "No opening hours are on record.",
      impact: "\"Open now\" is one of the commonest things people search for nearby, and a business with no hours is left out of that answer entirely.",
      fix: "Add your hours in your business details — a closed day counts as an answer.",
      priority: "medium",
      where: [],
    });
  }

  if (facts.areasServed.length === 0) {
    out.push({
      code: "no_areas_served",
      problem: "No service areas are on record.",
      impact: "Nothing tells a search engine which places you serve, so a search that names a place nearby has no reason to return you.",
      fix: "List the places you actually serve in your business details.",
      priority: "medium",
      where: [],
    });
  }

  // THE CITY ON THE PAGE, not in the database. A business whose city is
  // on record but appears nowhere a reader or a crawler can see it is
  // invisible to exactly the search this whole plan is about.
  if (String(input.city ?? "").trim() && !mentionsCity(input.landingText, input.city)) {
    out.push({
      code: "city_missing_from_landing",
      problem: "The page a stranger lands on never says which city you are in.",
      impact: "A visitor cannot tell whether you are near them, and a crawler has nothing on the page tying you to the place people search for.",
      fix: "Say the city in the words on the page — in the heading or the first paragraph, not only in the settings.",
      priority: "medium",
      where: [],
    });
  }

  if (!String(input.placeId ?? "").trim()) {
    out.push({
      code: "no_maps_listing_linked",
      problem: "Nothing connects this site to a Google Maps listing.",
      impact:
        "The listing is what shows up in the map results, and without it linked here Hawlai cannot check that the two agree about your name, address and hours.",
      fix: "Connect your Google listing in Settings — it is the same connection the review snapshot uses.",
      priority: "medium",
      where: [],
    });
  }

  // ---- THE MAPS LEG (migration 225) --------------------------------
  //
  // NOTHING IS COMPARED WITHOUT A SNAPSHOT. A missing one means nobody
  // has asked Google yet — a business that connected its listing
  // yesterday has no row until the 1st — and reading that as "they
  // agree" would tell the owner his listing is consistent when it has
  // never been looked at.
  //
  // AND A SNAPSHOT OF A DIFFERENT LISTING IS NOT COMPARED EITHER. If the
  // owner reconnects to another listing, last month's row describes the
  // old one, and comparing it would report a disagreement with a listing
  // he no longer has.
  const snap = input.snapshot;
  const snapshotUsable = Boolean(snap && String(snap.placeId ?? "").trim() && sameText(snap.placeId, input.placeId));

  if (snapshotUsable && snap) {
    if (String(snap.name ?? "").trim() && String(input.businessName ?? "").trim() && !sameText(snap.name, input.businessName)) {
      out.push({
        code: "maps_name_disagrees",
        problem: "Google Maps lists this business under a different name from the one on your site.",
        impact:
          "Search engines match a business across the web by its name, address and phone together — two names means two weaker records instead of one strong one, and a customer cannot tell they are the same place.",
        fix: "Decide which name is right, then change the other one — the site name in Settings, or the listing name in your Google Business Profile.",
        priority: "high",
        where: [],
      });
    }

    if (String(snap.address ?? "").trim() && String(input.addressOnRecord ?? "").trim() && !sameText(snap.address, input.addressOnRecord)) {
      out.push({
        code: "maps_address_disagrees",
        problem: "The address on Google Maps is not written the same way as the one on your site.",
        impact: "This is the single thing local search compares most, and a customer following the map can end up somewhere else.",
        fix: "Pick one wording and use it in both places — your business details here, and your Google Business Profile.",
        priority: "high",
        where: [],
      });
    }

    // THE PHONE IS COMPARED BY DIGITS, not by text — see samePhone. The
    // snapshot's number is in national format and the owner typed his
    // own way, so a text comparison would report a disagreement every
    // day for a number that is perfectly correct.
    if (String(snap.phone ?? "").trim() && String(input.phoneOnRecord ?? "").trim() && !samePhone(snap.phone, input.phoneOnRecord)) {
      out.push({
        code: "maps_phone_disagrees",
        problem: "The phone number on Google Maps is a different number from the one on your site.",
        impact: "One of them is reaching somebody who is not you, or nobody at all — and a call is the most direct thing a nearby customer does.",
        fix: "Check both and make them the same number: your business details here, and your Google Business Profile.",
        priority: "high",
        where: [],
      });
    }
  } else if (String(input.placeId ?? "").trim()) {
    // A LISTING IS CONNECTED BUT NOT YET READ. Said out loud rather than
    // passed over in silence, because the absence of a disagreement is
    // otherwise indistinguishable from agreement.
    out.push({
      code: "maps_not_compared_yet",
      problem: "Your Google listing has not been read yet, so nothing has been compared against it.",
      impact: "Until it is, nobody can tell you whether Maps and your site agree about your name, address and number.",
      fix: "Nothing to do — this happens on its own at the start of the month.",
      priority: "low",
      where: [],
    });
  }

  const rank: Record<Finding["priority"], number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

/**
 * One sentence about local presence, for the signal the Strategist reads.
 *
 * SAYS WHAT IS RIGHT AS READILY AS WHAT IS WRONG, the same way
 * runTechnicalAudit's site-health statement does — a standing statement
 * that only ever appears when something is broken reads as noise.
 */
export function localSummary(findings: Finding[]): string {
  if (findings.length === 0) {
    return "The business's local details are on record, and the site, the email footer and the Maps listing all agree";
  }
  const high = findings.filter((f) => f.priority === "high");
  const lead = (high.length ? high : findings).map((f) => f.problem.replace(/\.$/, ""));
  const rest = findings.length - lead.length;
  return `${lead.join("; ")}${rest > 0 ? ` (and ${rest} more local detail${rest === 1 ? "" : "s"} missing)` : ""}`;
}
