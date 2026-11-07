// G5 / local plan L2 — can a stranger nearby find this business, and do
// its own two records agree about where it is?
//
// The Maps leg is NOT tested here because it is not built: it needs a
// billed Places field and a per-run Place Details read, which is the
// founder's cost decision. What is tested is the half that costs
// nothing, including the mismatch nobody was comparing — the address in
// every marketing email's footer against the one the site publishes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { localFindings, localSummary, sameText, mentionsCity } from "@/lib/seo/localPresence";
import { EMPTY_LISTING_FACTS } from "@/lib/seo/listingFacts";
import { recordLocalPresence } from "@/lib/seo/runTechnicalAudit";
import { code, sourceWithComments } from "./helpers/source";

vi.mock("@/lib/signals/signals", () => ({
  recordSignal: vi.fn(async () => undefined),
  fingerprintOf: (parts: string[]) => parts.join("|"),
}));

import { recordSignal } from "@/lib/signals/signals";

const FULL = {
  facts: {
    ...EMPTY_LISTING_FACTS,
    phone: "+91 90000 00000",
    hours: [{ day: "monday", opens: "10:00", closes: "19:00" }],
    areasServed: ["A Place"],
    streetAddress: "12 A Street, A City",
  },
  emailAddress: "12 A Street, A City",
  addressOnRecord: "12 A Street, A City",
  addressPublished: true,
  phoneOnRecord: "+91 90000 00000",
  city: "A City",
  landingText: "We are in A City and we are open.",
  placeId: "place-1",
};

function codes(input: any) {
  return localFindings(input).map((f) => f.code);
}

describe("1. SAME TEXT MEANS SAME TO A READER, and two blanks are not a match", () => {
  it("case, spacing and punctuation do not make two addresses different", () => {
    expect(sameText("12 A Street, A City", "12 a street  a city")).toBe(true);
    expect(sameText("12-A, A Street", "12 A / A Street")).toBe(true);
  });

  it("TWO BLANKS ARE NOT A MATCH", () => {
    // A caller reading this as "they agree" would report a business with
    // no address anywhere as consistent.
    expect(sameText(null, null)).toBe(false);
    expect(sameText("", "")).toBe(false);
    expect(sameText("   ", null)).toBe(false);
    expect(sameText("12 A Street", "")).toBe(false);
  });

  it("AN ABBREVIATION IS REPORTED AS DIFFERENT, on purpose", () => {
    // Not a false positive: the fix for a local listing is for the two
    // records to be identical, and a check that quietly treated these as
    // the same would be hiding what it was asked to find.
    expect(sameText("12 A Rd", "12 A Road")).toBe(false);
  });

  it("and a genuinely different address is different", () => {
    expect(sameText("12 A Street", "13 A Street")).toBe(false);
  });
});

describe("2. THE CITY IS LOOKED FOR IN THE WORDS, not in the settings", () => {
  it("finds it whatever the case", () => {
    expect(mentionsCity("Open today in A CITY", "a city")).toBe(true);
    expect(mentionsCity("open today in a city", "A City")).toBe(true);
  });

  it("A BUSINESS WITH NO CITY ON RECORD IS NOT JUDGED", () => {
    expect(mentionsCity("any words at all", null)).toBe(false);
    expect(mentionsCity("any words at all", "  ")).toBe(false);
  });

  it("and empty page text does not contain it", () => {
    expect(mentionsCity("", "A City")).toBe(false);
    expect(mentionsCity(null, "A City")).toBe(false);
  });
});

describe("3. A COMPLETE BUSINESS HAS NOTHING TO REPORT", () => {
  it("NO FINDINGS WHEN EVERYTHING IS ON RECORD AND AGREES", () => {
    expect(localFindings(FULL as any)).toEqual([]);
  });

  it("and the summary says so rather than going quiet", () => {
    // A standing statement that only appears when something is broken
    // reads as noise. Same shape as runTechnicalAudit's site health.
    expect(localSummary([])).toMatch(/on record/i);
    expect(localSummary([])).toMatch(/match/i);
  });
});

describe("4. TWO ADDRESSES THAT DISAGREE IS THE HIGH FINDING", () => {
  it("THE EMAIL FOOTER AND THE SITE ARE COMPARED", () => {
    // Nothing compared these until G5. dealerships.business_address is
    // in every marketing email by law (migration 181);
    // business_listing_facts.street_address is in the site's structured
    // data (migration 221). Two screens, two hands, no comparison.
    const found = localFindings({ ...FULL, emailAddress: "99 Another Street, A City" } as any);
    const f = found.find((x) => x.code === "address_disagrees")!;
    expect(f).toBeTruthy();
    expect(f.priority).toBe("high");
  });

  it("IT IS LISTED FIRST, because it is what costs the most", () => {
    const found = localFindings({
      ...FULL,
      emailAddress: "99 Another Street",
      facts: { ...FULL.facts, hours: [] },
    } as any);
    expect(found[0].code).toBe("address_disagrees");
  });

  it("ONE ADDRESS MISSING IS NOT A DISAGREEMENT", () => {
    // It is a gap, and reporting "these disagree" when one of them is
    // blank would send the owner looking for a conflict that is not
    // there.
    expect(codes({ ...FULL, emailAddress: null } as any)).not.toContain("address_disagrees");
    expect(codes({ ...FULL, addressOnRecord: null } as any)).not.toContain("address_disagrees");
    expect(codes({ ...FULL, emailAddress: "", addressOnRecord: "" } as any)).not.toContain("address_disagrees");
  });

  it("and the fix names both places the owner has to change", () => {
    const f = localFindings({ ...FULL, emailAddress: "99 Another Street" } as any)[0];
    expect(f.fix).toMatch(/Settings/i);
    expect(f.fix).toMatch(/business details/i);
  });
});

describe("5. THE PHONE: MISSING IS A FAULT, UNPUBLISHED IS A CHOICE", () => {
  it("NO PHONE ON RECORD IS A HIGH FINDING", () => {
    const found = localFindings({ ...FULL, phoneOnRecord: null, facts: { ...FULL.facts, phone: null } } as any);
    const f = found.find((x) => x.code === "no_public_phone")!;
    expect(f).toBeTruthy();
    expect(f.priority).toBe("high");
  });

  it("ON RECORD BUT UNPUBLISHED IS REPORTED AS THE OWNER'S CALL, AND IS LOW", () => {
    // A check that scolds the owner for a decision he made on purpose is
    // a check he stops reading.
    const found = localFindings({ ...FULL, facts: { ...FULL.facts, phone: null } } as any);
    const f = found.find((x) => x.code === "phone_not_published")!;
    expect(f).toBeTruthy();
    expect(f.priority).toBe("low");
    expect(f.fix).toMatch(/your call|not a problem/i);
  });

  it("AND THE TWO ARE NEVER REPORTED TOGETHER", () => {
    const missing = codes({ ...FULL, phoneOnRecord: null, facts: { ...FULL.facts, phone: null } } as any);
    expect(missing).toContain("no_public_phone");
    expect(missing).not.toContain("phone_not_published");
  });

  it("THE OWNER'S WHATSAPP NUMBER IS NOT COMPARED WITH THE PUBLIC ONE", () => {
    // They are legitimately different things — owner_whatsapp_number is
    // the owner's, public_phone is the business's — and calling the
    // difference a fault would train the owner to ignore this check.
    const src = code("src/lib/seo/localPresence.ts");
    expect(src).not.toMatch(/owner_whatsapp/);
    const runner = code("src/lib/seo/runTechnicalAudit.ts");
    expect(runner).not.toMatch(/owner_whatsapp/);
    // And the reason is recorded where the next reader will look.
    expect(sourceWithComments("src/lib/seo/localPresence.ts")).toMatch(/owner_whatsapp_number/);
  });
});

describe("6. HOURS, AREAS, CITY AND THE MAPS LINK", () => {
  it("NO HOURS IS REPORTED", () => {
    expect(codes({ ...FULL, facts: { ...FULL.facts, hours: [] } } as any)).toContain("no_opening_hours");
  });

  it("NO SERVICE AREAS IS REPORTED", () => {
    expect(codes({ ...FULL, facts: { ...FULL.facts, areasServed: [] } } as any)).toContain("no_areas_served");
  });

  it("A CITY ON RECORD THAT THE PAGE NEVER SAYS IS REPORTED", () => {
    expect(codes({ ...FULL, landingText: "We make good things." } as any)).toContain("city_missing_from_landing");
  });

  it("AND A BUSINESS WITH NO CITY ON RECORD IS NOT TOLD TO MENTION ONE", () => {
    expect(codes({ ...FULL, city: null, landingText: "We make good things." } as any)).not.toContain("city_missing_from_landing");
  });

  it("NO LINKED MAPS LISTING IS REPORTED, and it says what that blocks", () => {
    const found = localFindings({ ...FULL, placeId: null } as any);
    const f = found.find((x) => x.code === "no_maps_listing_linked")!;
    expect(f).toBeTruthy();
    expect(f.impact).toMatch(/agree/i);
  });

  it("every finding carries all four parts, with no empty one", () => {
    const found = localFindings({
      facts: EMPTY_LISTING_FACTS,
      emailAddress: "12 A Street",
      addressOnRecord: "99 Other Street",
      addressPublished: false,
      phoneOnRecord: null,
      city: "A City",
      landingText: "",
      placeId: null,
    } as any);
    expect(found.length).toBeGreaterThan(3);
    for (const f of found) {
      expect(f.code, "code").toBeTruthy();
      expect(f.problem.length, `problem on ${f.code}`).toBeGreaterThan(10);
      expect(f.impact.length, `impact on ${f.code}`).toBeGreaterThan(10);
      expect(f.fix.length, `fix on ${f.code}`).toBeGreaterThan(10);
      expect(["high", "medium", "low"]).toContain(f.priority);
    }
  });

  it("HIGH COMES BEFORE MEDIUM COMES BEFORE LOW", () => {
    const found = localFindings({
      facts: { ...EMPTY_LISTING_FACTS, phone: null },
      emailAddress: "12 A Street",
      addressOnRecord: "99 Other Street",
      addressPublished: false,
      phoneOnRecord: "+91 90000 00000",
      city: "A City",
      landingText: "",
      placeId: null,
    } as any);
    const rank = { high: 0, medium: 1, low: 2 } as any;
    const seen = found.map((f) => rank[f.priority]);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(found.at(-1)!.code).toBe("phone_not_published");
  });
});

describe("7. RULE 3 — NOTHING HERE IS ABOUT ONE TRADE", () => {
  it("NO BUSINESS, CATEGORY, PRODUCT OR PLACE IS NAMED IN THE SOURCE", () => {
    const src = code("src/lib/seo/localPresence.ts").toLowerCase();
    const trade = [
      "candle", "jar", "wax", "soy", "fragrance", "dealership", "car", "salon", "clinic",
      "restaurant", "cafe", "bakery", "boutique", "gym", "hotel", "qaaf", "shahjahanpur",
      "mumbai", "delhi", "bangalore", "india",
    ];
    for (const word of trade) {
      expect(src.includes(word), `"${word}" must not appear in the findings`).toBe(false);
    }
  });

  it("the city it looks for comes from the business's own row, never a list", () => {
    const runner = code("src/lib/seo/runTechnicalAudit.ts");
    expect(runner).toMatch(/city: dealership\?\.city \?\? null/);
  });
});

describe("8. THE RUNNER: ONE SIGNAL, AND A FAILED READ FINDS NOTHING", () => {
  function db(over: any = {}) {
    return {
      from(table: string) {
        if (table === "dealerships") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  over.dealership ?? {
                    data: { city: "A City", business_address: "12 A Street", google_place_id: "p1" },
                    error: null,
                  },
              }),
            }),
          };
        }
        if (table === "business_listing_facts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  over.facts ?? {
                    data: {
                      public_phone: "+91 90000 00000",
                      publish_phone: true,
                      opening_hours: [{ day: "monday", opens: "10:00", closes: "19:00" }],
                      areas_served: ["A Place"],
                      street_address: "12 A Street",
                      publish_street_address: true,
                    },
                    error: null,
                  },
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any;
  }

  // THE CITY SITS IN A `heading` PROP ON A NON-HEADING BLOCK, which is
  // the exact case that defeated the first version. pageText skips the
  // `heading` prop and headings() wants a block of type "heading", so
  // neither would have seen it — and the check would have told an owner
  // whose page names his city that it never does.
  const homePage = {
    slug: "home",
    page_type: "home",
    sections: [
      { type: "product_grid", props: { heading: "Our products in A City" } },
      { type: "text", props: { html: "Some words." } },
    ],
  };

  beforeEach(() => {
    vi.mocked(recordSignal).mockClear();
  });

  it("ONE SIGNAL, SEPARATE FROM SITE HEALTH", async () => {
    await recordLocalPresence(db(), "d1", [homePage]);
    expect(recordSignal).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(recordSignal).mock.calls[0][2] as any;
    expect(payload.topic).toBe("local presence");
    expect(payload.topic).not.toBe("site health");
    expect(payload.confidence).toBe("counted");
  });

  it("THE CITY IS FOUND IN A `heading` PROP, which pageText does not read", async () => {
    // The reason `allText` exists. pageText covers text/html/label/alt
    // and headings() wants a "heading" BLOCK — so the `heading` prop on
    // faq, faq_item and product_grid falls between them, and this check
    // would have reported a missing city on a page that names it.
    const result = await recordLocalPresence(db(), "d1", [homePage]);
    expect(result.findings.map((f) => f.code)).not.toContain("city_missing_from_landing");
  });

  it("AND IS STILL REPORTED WHEN NO PART OF THE PAGE SAYS IT", async () => {
    const silent = { slug: "home", page_type: "home", sections: [{ type: "product_grid", props: { heading: "Our products" } }, { type: "text", props: { html: "Some words." } }] };
    const result = await recordLocalPresence(db(), "d1", [silent]);
    expect(result.findings.map((f) => f.code)).toContain("city_missing_from_landing");
  });

  it("A FAILED READ OF THE BUSINESS REPORTS NOTHING AND RECORDS NOTHING", async () => {
    // Reporting "no phone on record" because the row could not be read
    // would have the owner fixing something that was never broken.
    const result = await recordLocalPresence(db({ dealership: { data: null, error: { message: "boom" } } }), "d1", [homePage]);
    expect(result.findings).toEqual([]);
    expect(result.skipped).toMatch(/boom/);
    expect(recordSignal).not.toHaveBeenCalled();
  });

  it("a business with no listing-facts row yet is reported on, not skipped", async () => {
    const result = await recordLocalPresence(db({ facts: { data: null, error: null } }), "d1", [homePage]);
    expect(result.findings.map((f) => f.code)).toContain("no_public_phone");
    expect(recordSignal).toHaveBeenCalledTimes(1);
  });

  it("and a site with no pages at all does not throw", async () => {
    const result = await recordLocalPresence(db(), "d1", []);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(recordSignal).toHaveBeenCalledTimes(1);
  });

  it("THE LANDING PAGE IS THE HOME PAGE, not whichever row came back first", async () => {
    // Mutation M35 found this missing: every fixture here had the home
    // page first, so reading pages[0] passed. A page list from the
    // database has no guaranteed order.
    const notHome = { slug: "terms", page_type: "legal", sections: [{ type: "text", props: { html: "Boilerplate." } }] };
    const home = { slug: "home", page_type: "home", sections: [{ type: "product_grid", props: { heading: "Our products in A City" } }] };
    const result = await recordLocalPresence(db(), "d1", [notHome, home]);
    expect(result.findings.map((f) => f.code)).not.toContain("city_missing_from_landing");
  });

  it("THE EVIDENCE IS COUNTED, not described", async () => {
    const result = await recordLocalPresence(db({ dealership: { data: { city: "A City", business_address: "99 Other Street", google_place_id: "p1" }, error: null } }), "d1", [homePage]);
    const payload = vi.mocked(recordSignal).mock.calls[0][2] as any;
    expect(payload.evidence.findings).toBe(result.findings.length);
    expect(payload.evidence.high).toBe(result.findings.filter((f) => f.priority === "high").length);
    expect(payload.evidence.codes).toEqual(result.findings.map((f) => f.code));
  });
});

describe("9. IT IS ACTUALLY WIRED INTO THE DAILY AUDIT", () => {
  // Mutation M37 found that deleting the call from runTechnicalAudit left
  // every other test in this file green: they all call
  // recordLocalPresence directly. The whole feature could have shipped
  // unwired. This runs the real subsystem entry point.
  function fullDb() {
    return {
      from(table: string) {
        if (table === "websites") {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "w1", published: true }, error: null }) }) }) };
        }
        if (table === "website_pages") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ slug: "home", page_type: "home", title: "Home", meta_description: "A description that is long enough to pass.", sections: [{ type: "heading", props: { text: "Welcome", level: 1 } }, { type: "text", props: { html: "Some words about what we make and sell here in A City." } }], updated_at: new Date().toISOString() }],
                error: null,
              }),
            }),
          };
        }
        if (table === "dealerships") {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { city: "A City", business_address: "12 A Street", google_place_id: null }, error: null }) }) }) };
        }
        if (table === "business_listing_facts") {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any;
  }

  beforeEach(() => {
    vi.mocked(recordSignal).mockClear();
  });

  it("THE DAILY AUDIT RECORDS THE LOCAL SIGNAL, not only the site-health one", async () => {
    const { runTechnicalAudit } = await import("@/lib/seo/runTechnicalAudit");
    await runTechnicalAudit(fullDb(), "d1");
    const topics = vi.mocked(recordSignal).mock.calls.map((c) => (c[2] as any).topic);
    expect(topics).toContain("local presence");
    expect(topics).toContain("site health");
    // AND THE REAL PAGES REACHED IT. Mutation M37b passed an empty page
    // list and survived, because the fixture's page did not name the
    // city either way. It names it now, so a run that loses the pages
    // reports a city that is in fact on the page.
    const local = vi.mocked(recordSignal).mock.calls.find((c) => (c[2] as any).topic === "local presence")!;
    expect((local[2] as any).evidence.codes).not.toContain("city_missing_from_landing");
  });

  it("AND A HOME PAGE FOUND BY page_type, not only by slug", async () => {
    // Mutation M35b: every fixture had slug "home" AND page_type "home",
    // so matching on the slug alone passed. A page can be the landing
    // page under another slug.
    const { runTechnicalAudit } = await import("@/lib/seo/runTechnicalAudit");
    const client = fullDb();
    const original = client.from;
    client.from = (table: string) => {
      if (table === "website_pages") {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { slug: "terms", page_type: "legal", title: "Terms", meta_description: "A description that is long enough to pass.", sections: [{ type: "text", props: { html: "Boilerplate words that go on for a while here." } }], updated_at: new Date().toISOString() },
                { slug: "index", page_type: "home", title: "Home", meta_description: "A description that is long enough to pass.", sections: [{ type: "heading", props: { text: "Welcome", level: 1 } }, { type: "text", props: { html: "Some words about what we make and sell here in A City." } }], updated_at: new Date().toISOString() },
              ],
              error: null,
            }),
          }),
        };
      }
      return original(table);
    };
    await runTechnicalAudit(client, "d1");
    const local = vi.mocked(recordSignal).mock.calls.find((c) => (c[2] as any).topic === "local presence")!;
    expect((local[2] as any).evidence.codes).not.toContain("city_missing_from_landing");
  });

  it("AND NO NEW CRON ENTRY WAS ADDED FOR IT", async () => {
    // Rule 5, and Vercel Hobby's two-entry limit: this is depth on an
    // existing subsystem, not a new one.
    // Reads GROUPS, which is what the daily route actually dispatches —
    // mutation M38 showed that adding a key to the SubsystemKey TYPE
    // changes nothing at runtime, so the type is not what to assert on.
    const { GROUPS, ALL } = await import("@/lib/automation/cronGroups");
    expect(ALL).toContain("site_audit");
    const dispatched = [...GROUPS.signals, ...GROUPS.heavy].map(String);
    expect(dispatched.filter((k) => k.includes("local"))).toEqual([]);
    expect(dispatched.filter((k) => k.includes("presence"))).toEqual([]);
  });
});

describe("10. THE MAPS LEG IS ABSENT, AND SAYS WHY", () => {
  it("NOTHING HERE READS THE PLACE RECORD", () => {
    // L2 called the site-vs-Maps comparison "the one check that needs
    // the Places read Hawlai already does". That read is field-masked to
    // id, displayName, formattedAddress, rating and userRatingCount — no
    // phone — and it is a search run at connect time, not a stored
    // snapshot. Comparing on a schedule costs money per business per
    // run, which is the founder's decision.
    const src = code("src/lib/seo/localPresence.ts");
    expect(src).not.toMatch(/findPlaceCandidates|places\.googleapis/);
    const runner = code("src/lib/seo/runTechnicalAudit.ts");
    expect(runner).not.toMatch(/findPlaceCandidates|places\.googleapis/);
  });

  it("AND THE REASON IS WRITTEN DOWN WHERE THE NEXT READER WILL LOOK", () => {
    const src = sourceWithComments("src/lib/seo/localPresence.ts");
    expect(src).toMatch(/field-masked/i);
    expect(src).toMatch(/cost decision/i);
  });
});
