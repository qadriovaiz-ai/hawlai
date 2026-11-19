// The page knew the opening hours and would not show them —
// 19 November 2026.
//
// `LocalBusiness` schema has carried `openingHoursSpecification` and
// the street address since the listing facts existed. A search engine
// could read them. A VISITOR LOOKING AT THE PAGE COULD NOT — unless
// the owner typed them a second time into a text block, and then there
// were two copies that could disagree, with only one of them guarded.
//
// This is the `faq_item` argument applied to the facts the interview
// already collects: the words survived and the machine-readable fact
// did not. Here it was the other way round, which is stranger — the
// machine-readable fact survived and the words were never shown.
//
// THE OWNER'S PUBLISH FLAGS COME WITH THE DATA. readListingFacts
// returns a null phone and a null address unless he said they may be
// shown, so a block that renders from it cannot publish what he
// withheld. That is why it renders from ListingFacts and not from the
// row.

import { describe, it, expect } from "vitest";
import { hoursLines, readListingFacts, DAYS } from "@/lib/seo/listingFacts";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import { code } from "./helpers/source";

const FULL_WEEK = DAYS.map((day) => ({ day, opens: "10:00", closes: "19:00" }));

describe("1. THE HOURS READ AS A PERSON READS THEM", () => {
  it("one line per stated day, in week order", () => {
    const lines = hoursLines([
      { day: "wednesday", opens: "10:00", closes: "19:00" },
      { day: "monday", opens: "09:00", closes: "18:00" },
    ]);
    expect(lines.map((l) => l.day)).toEqual(["Monday", "Wednesday"]);
    expect(lines[0].when).toBe("09:00 – 18:00");
  });

  it("THE LOAD-BEARING ONE: a day nobody answered produces NO LINE", () => {
    // readHours keeps "nobody answered" and "closed, stated" as
    // different facts. Inventing a line for an unanswered day would
    // tell a customer the shop is shut when nobody said so.
    const lines = hoursLines([{ day: "monday", opens: "10:00", closes: "19:00" }]);
    expect(lines).toHaveLength(1);
    expect(lines.map((l) => l.day)).not.toContain("Sunday");
  });

  it("AND A DAY STATED AS CLOSED SAYS Closed", () => {
    const lines = hoursLines([{ day: "sunday", opens: null, closes: null }]);
    expect(lines).toEqual([{ day: "Sunday", when: "Closed" }]);
  });

  it("NOT GROUPED INTO RANGES, deliberately", () => {
    // "Mon-Sat 10:00-19:00" is what people expect, and a bug in the
    // grouping misstates when a shop is open — a real cost to a real
    // customer standing outside a closed door. Seven lines cannot be
    // subtly wrong.
    expect(hoursLines(FULL_WEEK)).toHaveLength(7);
  });

  it("no hours at all is an empty list, not a crash", () => {
    expect(hoursLines([])).toEqual([]);
    expect(hoursLines(null as any)).toEqual([]);
  });
});

describe("2. THE OWNER'S PUBLISH FLAGS SURVIVE INTO THE BLOCK", () => {
  it("THE LOAD-BEARING ONE: an unpublished address never reaches the data the block renders", () => {
    // The block reads ListingFacts, not the row, precisely so this
    // cannot be got wrong in the component.
    const facts = readListingFacts({
      street_address: "12 Taj Road, Lucknow",
      publish_street_address: false,
      public_phone: "98765 43210",
      publish_phone: false,
    });
    expect(facts.streetAddress).toBeNull();
    expect(facts.phone).toBeNull();
  });

  it("and a published one does", () => {
    const facts = readListingFacts({
      street_address: "12 Taj Road, Lucknow",
      publish_street_address: true,
      public_phone: "98765 43210",
      publish_phone: true,
    });
    expect(facts.streetAddress).toBe("12 Taj Road, Lucknow");
    expect(facts.phone).toBe("98765 43210");
  });

  it("THE BLOCK READS ListingFacts AND NOT THE ROW", () => {
    const src = code("src/components/website-builder/blocks/BlockRenderer.tsx");
    const at = src.indexOf('case "hours_address"');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 1800);
    expect(body).toMatch(/ctx\.listing/);
    expect(body).not.toMatch(/publish_street_address|public_phone|business_listing_facts/);
  });
});

describe("3. NOTHING TO SHOW MEANS NOTHING IS SHOWN", () => {
  it("THE LOAD-BEARING ONE: an empty block renders null, not a heading over a gap", () => {
    // A heading over an empty panel tells a visitor the business
    // declined to say where it is, when in fact nobody has been asked.
    const src = code("src/components/website-builder/blocks/BlockRenderer.tsx");
    const at = src.indexOf('case "hours_address"');
    const body = src.slice(at, at + 900);
    expect(body).toMatch(/if \(!lines\.length && !address && !phone && !areas\.length\) return null;/);
  });
});

describe("4. IT IS A DATA-BACKED BLOCK, WITH EVERYTHING THAT IMPLIES", () => {
  it("it exists, and says what it is", () => {
    expect(BLOCK_REGISTRY.hours_address).toBeDefined();
    expect(BLOCK_REGISTRY.hours_address.label).toBe("Hours & Address");
    expect(BLOCK_REGISTRY.hours_address.isContainer).toBe(false);
  });

  it("THE LOAD-BEARING ONE: THE AI CANNOT AUTHOR IT", () => {
    // A model writing opening hours would be inventing the very thing
    // the block exists to read — the same reasoning product_grid has
    // always had, now stated once for both.
    // ASSERTS THIS BLOCK'S MEMBERSHIP, NOT THE WHOLE SET. The first
    // version pinned the exact two-element literal and broke the day
    // `reviews` was added as a third — a deliberate extension reading
    // as a regression. What this test is about is that the hours block
    // is excluded, and that the exclusion is what AI_BLOCK_TYPES uses.
    const src = code("src/lib/agents/websiteBuilderAgent.ts");
    const set = src.slice(src.indexOf("DATA_BACKED_BLOCKS = new Set("), src.indexOf("const AI_BLOCK_TYPES"));
    expect(set).toMatch(/"hours_address"/);
    expect(src).toMatch(/AI_BLOCK_TYPES = Object\.keys\(BLOCK_REGISTRY\)\.filter\(\(t\) => !DATA_BACKED_BLOCKS\.has\(t\)\)/);
  });

  it("ITS ONLY EDITABLE PROP IS THE HEADING", () => {
    // Everything else comes from the records. A typed address field
    // here would recreate the two-copies problem this closes.
    expect(BLOCK_REGISTRY.hours_address.propFields.map((f) => f.key)).toEqual(["heading"]);
  });

  it("AND THE PAGE PAYS NO EXTRA QUERY FOR IT", () => {
    // loadSiteIdentity already reads business_listing_facts for the
    // schema. Reading it twice would be two reads that can disagree.
    const src = code("src/app/site/[slug]/page.tsx");
    expect(src).toMatch(/const needsListing = blockTreeContainsType\(blocks, "hours_address"\)/);
    expect(src).toMatch(/listing=\{needsListing \? identity\?\.listing \?\? null : null\}/);
    expect((src.match(/business_listing_facts/g) ?? [])).toHaveLength(0);
  });
});
