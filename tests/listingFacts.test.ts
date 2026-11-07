// The listing facts, published only where they are true (I1 of
// docs/PLAN-AUTO-INTERVIEW.md, migration 221).
//
// WHAT THIS TABLE IS FOR, and it is a dated incident rather than a
// feature request: the claims guard's own header records that "nothing
// in Hawlai stores a public contact email, a public phone number or a
// social handle for a business, so there was nothing to check against
// and the model filled the gap the way models do." What it filled it
// with was a plausible email address on a domain the business did not
// own, on a live contact page, so every enquiry sent to it would have
// vanished silently.
//
// THE TWO RULES THESE TESTS EXIST TO HOLD:
//
//   1. A value COLLECTED is not a value PUBLISHED. Every publish flag
//      defaults to false in the migration, and a false flag has to be
//      indistinguishable from a missing value.
//   2. A business that has not answered publishes what it always
//      published — the city and nothing else. No row is the normal
//      case, not an error.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { sql } from "./helpers/source";

import {
  DAYS,
  EMPTY_LISTING_FACTS,
  hasAnyListingFact,
  openingHoursSpecification,
  profileUrl,
  readAreas,
  readHours,
  readListingFacts,
  sameAsFor,
} from "@/lib/seo/listingFacts";
import { businessNode, storefrontJsonLd } from "@/lib/seo/structuredData";

const identity = {
  businessName: "A Business",
  city: "Shahjahanpur",
  category: "candles",
  description: null,
  siteUrl: "https://hawlai.online/site/a-business",
  logoUrl: null,
  bookingUrl: null,
};

const fullRow = {
  public_phone: "+91 91234 56789",
  publish_phone: true,
  opening_hours: [
    { day: "monday", opens: "10:00", closes: "14:00" },
    { day: "monday", opens: "15:00", closes: "19:00" },
    { day: "sunday", opens: null, closes: null },
  ],
  areas_served: ["Shahjahanpur", "Bareilly"],
  street_address: "12 Station Road",
  publish_street_address: true,
  instagram_url: "https://www.instagram.com/a_business/",
  other_profile_urls: ["https://www.justdial.com/a-business"],
};

// ---------------------------------------------------------------------
describe("1. A VALUE COLLECTED IS NOT A VALUE PUBLISHED", () => {
  it("A PHONE NUMBER WITH THE FLAG OFF IS NOT PUBLISHED", () => {
    // dealerships.owner_whatsapp_number is the standing example of the
    // difference: it exists so Hawlai can message the OWNER. Publishing
    // a number because it happens to be in the database would be a
    // second use of a fact given for a first one.
    const facts = readListingFacts({ ...fullRow, publish_phone: false });
    expect(facts.phone).toBeNull();
  });

  it("AND A MISSING FLAG IS AS GOOD AS OFF, never as good as on", () => {
    expect(readListingFacts({ public_phone: "+91 91234 56789" }).phone).toBeNull();
    expect(readListingFacts({ public_phone: "+91 91234 56789", publish_phone: null }).phone).toBeNull();
    // Not a truthy value either — "yes" is not the decision, true is.
    expect(readListingFacts({ public_phone: "+91 91234 56789", publish_phone: "yes" as any }).phone).toBeNull();
  });

  it("A STREET ADDRESS WITH THE FLAG OFF IS NOT PUBLISHED", () => {
    // A great many businesses here run from the owner's home.
    const facts = readListingFacts({ ...fullRow, publish_street_address: false });
    expect(facts.streetAddress).toBeNull();
  });

  it("AND THE CITY STILL IS, because the city was never the secret", () => {
    const facts = readListingFacts({ ...fullRow, publish_street_address: false });
    const node = businessNode({ ...identity, listing: facts });
    expect(node.address).toEqual({ "@type": "PostalAddress", addressLocality: "Shahjahanpur", addressCountry: "IN" });
    expect(JSON.stringify(node)).not.toContain("Station Road");
  });

  it("THE MIGRATION DEFAULTS BOTH PUBLISH FLAGS TO FALSE", () => {
    // The code above is only half the guarantee; a column defaulting to
    // true would publish on the first insert, before any flag was read.
    const m = sql("supabase/migrations/221_business_listing_facts.sql");
    expect(m).toMatch(/publish_phone boolean not null default false/);
    expect(m).toMatch(/publish_street_address boolean not null default false/);
  });
});

// ---------------------------------------------------------------------
describe("2. A BUSINESS THAT HAS NOT ANSWERED PUBLISHES THE CITY AND NOTHING ELSE", () => {
  it("NO ROW IS THE NORMAL CASE, not an error", () => {
    expect(readListingFacts(null)).toEqual(EMPTY_LISTING_FACTS);
    expect(readListingFacts(undefined)).toEqual(EMPTY_LISTING_FACTS);
    expect(hasAnyListingFact(readListingFacts(null))).toBe(false);
  });

  it("AND THE NODE IS WHAT IT WAS BEFORE MIGRATION 221 EXISTED", () => {
    const before = businessNode(identity);
    const after = businessNode({ ...identity, listing: readListingFacts(null) });
    expect(after).toEqual(before);
    expect(after.address).toEqual({ "@type": "PostalAddress", addressLocality: "Shahjahanpur", addressCountry: "IN" });
    expect(after.telephone).toBeUndefined();
    expect(after.sameAs).toBeUndefined();
    expect(after.openingHoursSpecification).toBeUndefined();
    expect(after.areaServed).toBeUndefined();
  });

  it("and a business with neither a city nor a street publishes no address at all", () => {
    const node = businessNode({ ...identity, city: null, listing: readListingFacts(null) });
    expect(node.address).toBeUndefined();
  });

  it("AN EMPTY STRING IN A COLUMN IS NOT A FACT ABOUT A PICTURE", () => {
    // FOUND BY A MUTATION. brand_kits.logo_url is nullable text, and ""
    // is an ordinary thing to find in a text column — an owner who
    // cleared the field rather than never setting it. Published, it
    // becomes `image: ""`, which is a machine-readable claim that this
    // business has a logo at that address. compact() is the one place
    // that decides an empty value is not a value, and this is the
    // caller that can actually hand it one.
    const node = businessNode({ ...identity, logoUrl: "", listing: readListingFacts(null) });
    expect(node.image).toBeUndefined();
    expect(node.logo).toBeUndefined();
    expect(Object.keys(node)).not.toContain("image");
  });

  it("STILL NO aggregateRating, with or without listing facts", () => {
    // Publishing Google's own rating in your own page's markup breaches
    // their guidelines, and Hawlai reads that rating daily — so this is
    // the one field most likely to be added by someone being helpful.
    const node = businessNode({ ...identity, listing: readListingFacts(fullRow) });
    expect(JSON.stringify(node)).not.toContain("aggregateRating");
    expect(JSON.stringify(node)).not.toContain("reviewCount");
  });
});

// ---------------------------------------------------------------------
describe("3. THE HOURS ARE A WEEK, NOT A SENTENCE", () => {
  it("TWO INTERVALS ON ONE DAY SURVIVE, because that is how a lunch break is said", () => {
    const hours = readHours(fullRow.opening_hours);
    expect(hours.filter((h) => h.day === "monday")).toEqual([
      { day: "monday", opens: "10:00", closes: "14:00" },
      { day: "monday", opens: "15:00", closes: "19:00" },
    ]);
  });

  it("A CLOSED DAY IS AN ANSWER AND IS KEPT", () => {
    // "Shut on Sunday" is a fact a customer is looking for. Leaving the
    // day out says only that nobody mentioned it.
    expect(readHours([{ day: "sunday", opens: null, closes: null }])).toEqual([
      { day: "sunday", opens: null, closes: null },
    ]);
  });

  it("AND IT IS EMITTED AS A NAMED DAY WITH NO WINDOW", () => {
    const spec = openingHoursSpecification([{ day: "sunday", opens: null, closes: null }]);
    expect(spec).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Sunday" }]);
  });

  it("HALF AN INTERVAL IS DROPPED, never guessed into a whole one", () => {
    expect(readHours([{ day: "monday", opens: "10:00", closes: null }])).toEqual([]);
    expect(readHours([{ day: "monday", opens: null, closes: "19:00" }])).toEqual([]);
    expect(readHours([{ day: "monday", opens: "10:00" }])).toEqual([]);
  });

  it("A TIME THAT IS NOT A TIME IS DROPPED", () => {
    expect(readHours([{ day: "monday", opens: "10am", closes: "7pm" }])).toEqual([]);
    expect(readHours([{ day: "monday", opens: "25:00", closes: "26:00" }])).toEqual([]);
    expect(readHours([{ day: "monday", opens: "9:00", closes: "19:00" }])).toEqual([]);
  });

  it("A WINDOW THAT CLOSES BEFORE IT OPENS IS DROPPED, not reinterpreted", () => {
    expect(readHours([{ day: "monday", opens: "19:00", closes: "10:00" }])).toEqual([]);
    expect(readHours([{ day: "monday", opens: "10:00", closes: "10:00" }])).toEqual([]);
  });

  it("A DAY THAT IS NOT A DAY IS DROPPED", () => {
    expect(readHours([{ day: "someday", opens: "10:00", closes: "19:00" }])).toEqual([]);
    expect(readHours([{ day: "", opens: "10:00", closes: "19:00" }])).toEqual([]);
  });

  it("ONE BAD INTERVAL DOES NOT THROW THE WEEK AWAY", () => {
    // A row whose Tuesday is malformed still has a true Monday, and
    // dropping the lot would make the page say less than the owner did.
    const hours = readHours([
      { day: "monday", opens: "10:00", closes: "19:00" },
      { day: "tuesday", opens: "garbage", closes: "19:00" },
      { day: "wednesday", opens: "10:00", closes: "19:00" },
    ]);
    expect(hours.map((h) => h.day)).toEqual(["monday", "wednesday"]);
  });

  it("and anything that is not an array is no hours at all", () => {
    expect(readHours(null)).toEqual([]);
    expect(readHours("10 to 7 daily")).toEqual([]);
    expect(readHours({ monday: "10:00-19:00" })).toEqual([]);
  });

  it("every day name maps to a schema.org day", () => {
    const spec = openingHoursSpecification(DAYS.map((day) => ({ day, opens: "10:00", closes: "19:00" })));
    expect(spec.map((s) => s.dayOfWeek)).toEqual([
      "https://schema.org/Monday",
      "https://schema.org/Tuesday",
      "https://schema.org/Wednesday",
      "https://schema.org/Thursday",
      "https://schema.org/Friday",
      "https://schema.org/Saturday",
      "https://schema.org/Sunday",
    ]);
  });
});

// ---------------------------------------------------------------------
describe("4. sameAs CLAIMS ANOTHER PAGE IS THIS BUSINESS, so it is strict", () => {
  it("THE MAPS LISTING AND THE FACEBOOK PAGE ARE DERIVED, not stored twice", () => {
    // Both ids are already on the dealerships row. A second home for
    // either is how two spellings of one fact come to disagree.
    const urls = sameAsFor(null, { googlePlaceId: "ChIJabc123", facebookPageId: "10012345" });
    expect(urls[0]).toContain("place_id:ChIJabc123");
    expect(urls[1]).toBe("https://www.facebook.com/10012345");
  });

  it("AND THE MIGRATION GIVES NEITHER ITS OWN COLUMN", () => {
    const m = sql("supabase/migrations/221_business_listing_facts.sql");
    expect(m).not.toMatch(/google_place_id\s+text/);
    expect(m).not.toMatch(/facebook_(page_)?(id|url)\s+text/);
    // Instagram DOES get one: only instagram_business_id is stored and
    // it cannot be turned into a public profile URL.
    expect(m).toMatch(/instagram_url text/);
  });

  it("A URL WITH NO SCHEME IS REFUSED, because in markup it is a relative link", () => {
    // "instagram.com/shop" would resolve against the storefront and
    // point at a page on the business's own site that does not exist.
    expect(profileUrl("instagram.com/a_business")).toBeNull();
    expect(profileUrl("www.justdial.com/x")).toBeNull();
    expect(profileUrl("/about")).toBeNull();
  });

  it("A javascript: OR data: URL IS REFUSED", () => {
    expect(profileUrl("javascript:alert(1)")).toBeNull();
    expect(profileUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(profileUrl("file:///etc/passwd")).toBeNull();
  });

  it("INCLUDING ONE DRESSED AS A HOSTNAME, which only the scheme check catches", () => {
    // FOUND BY A MUTATION. Deleting the protocol check changed nothing
    // above, because `javascript:alert(1)` has no hostname and the dot
    // check below refused it for the wrong reason. These DO have a
    // hostname with a dot in it, so the scheme check is the only thing
    // standing between them and a published href.
    expect(profileUrl("javascript://www.instagram.com/%0aalert(1)")).toBeNull();
    expect(profileUrl("JavaScript://example.com/x")).toBeNull();
  });

  it("and a hostname with no dot is not a site", () => {
    expect(profileUrl("http://localhost/x")).toBeNull();
  });

  it("THE SAME PAGE IS NOT CLAIMED TWICE", () => {
    const urls = sameAsFor(
      { instagram_url: "https://www.instagram.com/a_business/", other_profile_urls: ["https://www.instagram.com/a_business/"] },
      {}
    );
    expect(urls).toEqual(["https://www.instagram.com/a_business/"]);
  });

  it("a bad entry in the list does not take the good ones with it", () => {
    const urls = sameAsFor({ other_profile_urls: ["javascript:x", "https://www.justdial.com/a", "", null] }, {});
    expect(urls).toEqual(["https://www.justdial.com/a"]);
  });
});

// ---------------------------------------------------------------------
describe("5. THE AREAS ARE WHERE HE HAS SERVED", () => {
  it("cleaned, de-duplicated, and in the order he gave them", () => {
    expect(readAreas(["Shahjahanpur", "  Bareilly  ", "shahjahanpur", ""])).toEqual(["Shahjahanpur", "Bareilly"]);
  });

  it("and anything that is not an array is no areas at all", () => {
    expect(readAreas("all over India")).toEqual([]);
    expect(readAreas(null)).toEqual([]);
  });

  it("THE MIGRATION RECORDS WHY THIS FIELD IS THE DANGEROUS ONE", () => {
    // "All over India" from a business that has shipped once outside its
    // own state is the line the guard exists to remove — and once it is
    // in here it is EVIDENCE, because knownText treats a recorded fact
    // as proof.
    //
    // ASSERTED ON THE `comment on column`, NOT ON A `--` COMMENT. The
    // first version of this test matched the prose above the column and
    // failed on its own line wrapping — and a wrapped `--` comment is
    // the weaker thing to pin anyway. A column comment is a database
    // artifact: it reaches production and psql prints it.
    const m = sql("supabase/migrations/221_business_listing_facts.sql");
    expect(m).toMatch(/comment on column business_listing_facts\.areas_served is/);
    expect(m).toMatch(/ACTUALLY served, not where it would/);
    expect(m).toMatch(/knownText treats a recorded fact as proof/);
  });
});

// ---------------------------------------------------------------------
describe("6. THE FULL ROW, IN THE GRAPH", () => {
  it("EVERY ANSWERED FACT REACHES THE LocalBusiness NODE", () => {
    const node = businessNode({
      ...identity,
      listing: readListingFacts(fullRow, { googlePlaceId: "ChIJabc123", facebookPageId: "10012345" }),
    });
    expect(node.telephone).toBe("+91 91234 56789");
    expect(node.areaServed).toEqual(["Shahjahanpur", "Bareilly"]);
    expect((node.address as any).streetAddress).toBe("12 Station Road");
    expect((node.address as any).addressLocality).toBe("Shahjahanpur");
    expect((node.openingHoursSpecification as any[]).length).toBe(3);
    expect((node.sameAs as string[]).length).toBe(4);
  });

  it("and it travels through the storefront graph the pages actually publish", () => {
    const graph = storefrontJsonLd({ ...identity, listing: readListingFacts(fullRow) }, [])!;
    const business = (graph["@graph"] as any[]).find((n) => n["@type"] === "LocalBusiness");
    expect(business.telephone).toBe("+91 91234 56789");
  });

  it("THE PAGE READER ASKS FOR THE ROW AND DERIVES THE TWO IDS", () => {
    const src = readFileSync("src/lib/seo/siteIdentity.ts", "utf8");
    expect(src).toMatch(/from\("business_listing_facts"\)/);
    expect(src).toMatch(/googlePlaceId: dealership\?\.google_place_id/);
    expect(src).toMatch(/facebookPageId: dealership\?\.fb_page_id/);
  });
});

// ---------------------------------------------------------------------
describe("7. THE TABLE IS TENANT-SAFE FROM THE FIRST MIGRATION", () => {
  // Two new tables shipped without RLS during the pricing-tiers work and
  // were caught afterwards. This asserts it rather than hoping.
  const m = sql("supabase/migrations/221_business_listing_facts.sql");

  it("RLS IS ENABLED", () => {
    expect(m).toMatch(/alter table business_listing_facts enable row level security/);
  });

  it("THE OWNER AND AN ACTIVE TEAM MEMBER CAN READ, AND THAT IS ALL", () => {
    expect(m).toMatch(/create policy "business_listing_facts_owner_select" on business_listing_facts/);
    expect(m).toMatch(/create policy "business_listing_facts_member_select" on business_listing_facts/);
    expect(m).toMatch(/team_members where user_id = auth\.uid\(\) and status = 'active'/);
  });

  it("THERE IS NO CLIENT WRITE POLICY — writes go through the service role", () => {
    expect(m).not.toMatch(/for (insert|update|delete)/i);
  });

  it("ONE ROW PER BUSINESS, so there is no second answer to one question", () => {
    expect(m).toMatch(/dealership_id uuid references dealerships\(id\) on delete cascade not null unique/);
  });

  it("and the migration ships its own verify queries", () => {
    // CLAUDE.md rule 4: no migration without SQL plus a verify query.
    //
    // ASSERTED ON THE QUERIES, NOT ON THE WORDS. The first version
    // matched /relrowsecurity/, which appears twice in this file — once
    // in the query and once in the sentence saying what it should
    // print — so deleting the query left the assertion passing. Rule 8,
    // arriving in a comment block instead of code.
    const raw = readFileSync("supabase/migrations/221_business_listing_facts.sql", "utf8");
    expect(raw).toMatch(/select relname, relrowsecurity\s*\n--\s*from pg_class where relname = 'business_listing_facts'/);
    expect(raw).toMatch(/select polname, cmd from pg_policies\s*\n--\s*where tablename = 'business_listing_facts'/);
    expect(raw).toMatch(/from information_schema\.columns/);
  });
});

// ---------------------------------------------------------------------
describe("8. NOTHING IS INVENTED, AND THE ABSENCES ARE ON PURPOSE", () => {
  it("THERE IS NO geo COLUMN, and the migration says why", () => {
    // Nothing reads a Place's coordinates today and the interview does
    // not ask for them, because an owner typing their own latitude is
    // not a thing that happens. A column nothing can fill is schema
    // without a purpose.
    const raw = readFileSync("supabase/migrations/221_business_listing_facts.sql", "utf8");
    expect(raw).not.toMatch(/^\s*(latitude|longitude|geo)\s/m);
    expect(raw).toMatch(/NO geo COLUMN, deliberately/);
  });

  it("THERE IS NO MODEL PATH INTO THIS TABLE", () => {
    // Same correction as section 5: the declaration and the column
    // comment, both of which reach production, rather than wrapped
    // prose that a reflow can break.
    const m = sql("supabase/migrations/221_business_listing_facts.sql");
    expect(m).toMatch(/answered_by text not null default 'owner'/);
    expect(m).toMatch(/comment on column business_listing_facts\.answered_by is/);
    expect(m).toMatch(/there is no model path into this table, deliberately/);
  });

  it("and the reader is pure — no database, no model, no React", () => {
    const src = readFileSync("src/lib/seo/listingFacts.ts", "utf8");
    expect(src).not.toMatch(/^import .*supabase/m);
    expect(src).not.toMatch(/^import .*(claude|anthropic)/mi);
    expect(src).not.toMatch(/^import .*react/mi);
  });
});
