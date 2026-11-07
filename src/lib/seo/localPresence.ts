// Can a stranger nearby find this business, and do its records agree?
//
// G5 of docs/AUDIT-GROWTH-LOOP.md, which is L2 of docs/PLAN-LOCAL-SEO.md.
// The technical audit already reads the site and finds missing titles and
// duplicate body text. This is the same shape pointed at local facts.
//
// WHAT IT DOES NOT DO, AND WHY — the headline check L2 named was "the
// name, address and phone not matching between the site and the Place
// record", described there as "the one check that needs the Places read
// Hawlai already does". That read exists (lib/google/findPlaceCandidates)
// but it is field-masked to id, displayName, formattedAddress, rating
// and userRatingCount — Places (New) bills by the fields requested, and
// a phone number is a higher tier. It is also a SEARCH run when the owner
// connects reviews, not a stored snapshot: only `google_place_id` is
// kept, so comparing on a schedule would mean a Place Details read per
// business per run. Both of those are the founder's cost decision, not
// this file's, so the Maps leg is NOT here. What is here costs nothing.
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
  /** The words on the page a stranger lands on. */
  landingText: string | null | undefined;
  /** Whether anything ties the site to a Maps listing. */
  placeId: string | null | undefined;
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
    return "The business's local details are on record and its two addresses match";
  }
  const high = findings.filter((f) => f.priority === "high");
  const lead = (high.length ? high : findings).map((f) => f.problem.replace(/\.$/, ""));
  const rest = findings.length - lead.length;
  return `${lead.join("; ")}${rest > 0 ? ` (and ${rest} more local detail${rest === 1 ? "" : "s"} missing)` : ""}`;
}
