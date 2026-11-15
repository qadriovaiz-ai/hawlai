// What the business's own site already says — D2.
//
// Before asking a shopkeeper to type his opening hours into a form,
// read the page where he has already written them. The tests that
// matter are about restraint: a plausible wrong suggestion is worse
// than a blank field, because a blank field does not invite a careless
// yes.

import { describe, it, expect } from "vitest";
import { discoverFromSite, siteLines, SITE_SOURCE, CATALOGUE_SOURCE } from "@/lib/onboarding/discoverFromSite";
import { prepareSuggestion } from "@/lib/onboarding/suggestions";
import { OFFER_PROMISES } from "@/lib/claims/offerPromises";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { code } from "./helpers/source";

function facts(over: { lines?: string[]; products?: any[]; url?: string } = {}): BusinessFacts {
  return {
    businessName: "Example Co",
    site: {
      url: over.url ?? "https://example.test/site/x",
      published: true,
      pages: [{ slug: "contact", title: "Contact", pageType: "contact", headings: [], paragraphs: over.lines ?? [], buttons: [], metaDescription: null, hasShareImage: false }],
    },
    products: over.products ?? [],
    offers: [],
  } as unknown as BusinessFacts;
}

const find = (out: any[], key: string) => out.find((s) => s.questionKey === key);

describe("1. EXACTLY ONE, OR SAY NOTHING", () => {
  it("ONE PHONE ON THE SITE IS SUGGESTED", () => {
    const out = discoverFromSite(facts({ lines: ["Call us on 98765 43210 any day."] }));
    const phone = find(out, "public_phone");
    expect(phone.value).toBe("98765 43210");
    expect(phone.source).toBe("discovered");
    expect(phone.evidence.quote).toContain("98765 43210");
  });

  it("TWO DIFFERENT NUMBERS SUGGEST NOTHING", () => {
    // THE LOAD-BEARING ONE. Picking one of two is how a supplier's
    // number becomes the business's public number with one careless
    // tap.
    const out = discoverFromSite(facts({ lines: ["Sales: 98765 43210", "Orders: 91234 56789"] }));
    expect(find(out, "public_phone")).toBeUndefined();
  });

  it("but the SAME number written twice is still one number", () => {
    const out = discoverFromSite(facts({ lines: ["Call 98765 43210", "WhatsApp +91 98765 43210"] }));
    expect(find(out, "public_phone")).toBeTruthy();
  });

  it("A POSTCODE IS NOT A PHONE NUMBER", () => {
    // The pattern cannot tell a six-digit run from a mobile; an Indian
    // mobile is ten digits, or twelve with the country code.
    //
    // THE FIRST FIXTURE HERE COULD NOT FAIL. It used 226001, and PHONE
    // requires the first digit to be 6-9 — so that postcode never
    // reached the length guard at all and a mutation deleting the
    // guard survived. A postcode that the pattern DOES match is what
    // tests it.
    const out = discoverFromSite(facts({ lines: ["Kolkata 700001"] }));
    expect(find(out, "public_phone")).toBeUndefined();
    // ...and the line is still usable as an address, which is the
    // point of keeping the two apart.
    expect(find(out, "street_address")).toBeTruthy();
  });

  it("TWO ADDRESS-SHAPED LINES SUGGEST NOTHING", () => {
    const out = discoverFromSite(facts({ lines: ["Shop 4, Hazratganj, Lucknow 226001", "Warehouse: Sector 9, Noida 201301"] }));
    expect(find(out, "street_address")).toBeUndefined();
  });

  it("AND TWO SETS OF HOURS SUGGEST NOTHING", () => {
    const out = discoverFromSite(facts({ lines: ["Mon-Sat 10am to 8pm", "Sunday 11am to 4pm"] }));
    expect(find(out, "opening_hours")).toBeUndefined();
  });

  it("a day with no time, or a time with no day, is not opening hours", () => {
    expect(find(discoverFromSite(facts({ lines: ["Closed on Sunday"] })), "opening_hours")).toBeUndefined();
    expect(find(discoverFromSite(facts({ lines: ["Delivery by 6pm"] })), "opening_hours")).toBeUndefined();
  });

  it("an empty site suggests nothing at all, which is a normal answer", () => {
    expect(discoverFromSite(facts())).toEqual([]);
    expect(discoverFromSite(null)).toEqual([]);
    expect(siteLines(null)).toEqual([]);
  });
});

describe("2. THE OWNER'S OWN WORDING IS WHAT HE IS SHOWN", () => {
  it("THE HOURS LINE IS NOT REFORMATTED INTO A TIDY SCHEDULE", () => {
    // Rewriting it would be this module deciding what his hours are
    // from a sentence it half understood. His own words are what he can
    // recognise and correct.
    const line = "We are open Mon to Sat, 10am till 8pm (closed Sun)";
    const out = discoverFromSite(facts({ lines: [line] }));
    expect(find(out, "opening_hours").value).toBe(line);
  });

  it("AND EVERY DISCOVERY CARRIES THE LINE IT CAME FROM", () => {
    const out = discoverFromSite(facts({
      lines: ["Call 98765 43210", "Open Mon-Fri 9am-6pm", "Shop 4, Lucknow 226001"],
    }));
    for (const s of out.filter((x) => x.source === "discovered")) {
      expect(s.evidence.quote, s.questionKey).toBeTruthy();
      expect(s.evidence.sourceKind, s.questionKey).toBe(SITE_SOURCE);
    }
  });

  it("EVERYTHING IT PRODUCES IS ACCEPTED BY THE STORE", () => {
    // The two modules have to agree: a discovery this one builds
    // without a quote would be refused by prepareSuggestion and lost
    // with only a console line to show for it.
    const out = discoverFromSite(facts({
      lines: ["Call 98765 43210", "Open Mon-Fri 9am-6pm", "Gift wrapping available", "Shop 4, Lucknow 226001"],
      products: [{ price: 450, active: true }, { price: 1200, active: true }],
    }));
    expect(out.length).toBeGreaterThan(3);
    for (const s of out) {
      const prepared = prepareSuggestion(s);
      expect(prepared.ok, `${s.questionKey}: ${(prepared as any).why}`).toBe(true);
    }
  });
});

describe("3. THE PRICE RANGE IS INFERRED, NOT READ", () => {
  it("IT IS ARITHMETIC OVER THE CATALOGUE, so there is no quote", () => {
    const out = discoverFromSite(facts({ products: [{ price: 450, active: true }, { price: 1200, active: true }, { price: 800, active: true }] }));
    const price = find(out, "price_range");
    expect(price.source).toBe("inferred");
    expect(price.value).toBe("₹450 to ₹1200");
    expect(price.evidence.sourceKind).toBe(CATALOGUE_SOURCE);
    expect(price.evidence.quote).toBeNull();
  });

  it("ONE PRODUCT IS ONE PRICE, not a range of it to itself", () => {
    const out = discoverFromSite(facts({ products: [{ price: 450, active: true }] }));
    expect(find(out, "price_range").value).toBe("₹450");
  });

  it("AN INACTIVE OR UNPRICED PRODUCT IS NOT IN THE RANGE", () => {
    // A retired product's price is not what this business charges now.
    const out = discoverFromSite(facts({
      products: [{ price: 450, active: true }, { price: 9999, active: false }, { price: 0, active: true }, { price: null, active: true }],
    }));
    expect(find(out, "price_range").value).toBe("₹450");
  });

  it("no priced product means no suggestion", () => {
    expect(find(discoverFromSite(facts({ products: [{ price: 0, active: true }] })), "price_range")).toBeUndefined();
  });
});

describe("4. A PROMISE CAN ONLY EVER BE A YES", () => {
  it("A MENTION SUGGESTS YES, WITH THE SENTENCE", () => {
    const out = discoverFromSite(facts({ lines: ["We offer gift wrapping on every order."] }));
    const p = find(out, "promise_gift_wrapping");
    expect(p.value).toBe("yes");
    expect(p.evidence.quote).toContain("gift wrapping");
  });

  it("SILENCE SUGGESTS NOTHING — absence is not denial", () => {
    // THE LOAD-BEARING ONE. A page that never mentions workshops says
    // nothing about whether the business runs them, and a suggested
    // "no" would put a word in the owner's mouth about something this
    // module simply did not find.
    const out = discoverFromSite(facts({ lines: ["We make candles."] }));
    for (const promise of OFFER_PROMISES) {
      expect(find(out, `promise_${promise.key}`), promise.key).toBeUndefined();
    }
    expect(out.every((s) => s.value !== "no")).toBe(true);
  });

  it("THE PATTERNS ARE OFFER_PROMISES' OWN, not a second copy", () => {
    // Which is also where every trade-specific word in this feature
    // lives — rule 3 comes free.
    const src = code("src/lib/onboarding/discoverFromSite.ts");
    expect(src).toMatch(/import \{ OFFER_PROMISES \} from "@\/lib\/claims\/offerPromises"/);
    expect(src).toMatch(/for \(const promise of OFFER_PROMISES\)/);
    expect(src).not.toMatch(/gift|wrap|bulk|workshop|subscription/i);
  });

  it("and the phone pattern is the claims layer's own", () => {
    const src = code("src/lib/onboarding/discoverFromSite.ts");
    expect(src).toMatch(/import \{ PHONE \} from "@\/lib\/claims\/guardBlocks"/);
    // `.match()` and never `.test()` — PHONE is a shared global regex,
    // and `.test()` would alternate answers for the same string.
    expect(src).not.toMatch(/PHONE\.test\(/);
  });
});

describe("5. IT NEVER WRITES WHERE A FACT WOULD BE BELIEVED", () => {
  it("THE MODULE TOUCHES NO DATABASE AT ALL", () => {
    // It reads BusinessFacts the caller already gathered. No network
    // call, no table — which is why the Hawlai-built site comes before
    // any external one.
    const src = code("src/lib/onboarding/discoverFromSite.ts");
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/from\("/);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("AND EVERY SUGGESTION IS A SUGGESTION — none claims to be the owner's", () => {
    const out = discoverFromSite(facts({
      lines: ["Call 98765 43210", "Open Mon-Fri 9am-6pm", "Gift sets available"],
      products: [{ price: 100, active: true }],
    }));
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) expect(["discovered", "inferred"], s.questionKey).toContain(s.source);
  });
});
