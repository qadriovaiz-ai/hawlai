// A generated page may not carry a contact detail nobody gave it.
//
// The Contact page built for a real candle business read
// "Email: hello@candlebyqaaf.com". The business does not own that
// domain. Every enquiry sent to it would have gone nowhere, silently,
// for as long as the site stayed up — and the only reason anyone found
// out is that the owner read his own page.
//
// Hawlai stores no public email, no public phone and no social handle
// for a business, so there was nothing to check against and the model
// filled the gap. A wrong claim is an argument. A wrong address is a
// lost customer with no trace, so this is removed, not warned about.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { scrubInventedContacts, guardBlockTree } from "@/lib/claims/guardBlocks";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [] }, home: null,
    products: [], offers: [], shipping: null,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 0 }, ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-02"), unreadable: [], ...over,
  } as BusinessFacts;
}

/** The same business after the owner has written their details down. */
const onRecord = facts({
  ownerFacts: [
    { category: "contact", title: "How customers reach us", content: "Email qaaf@gmail.com or WhatsApp 9876543210. Instagram @candle_by_qaaf." } as any,
  ],
});

describe("contact details in generated copy", () => {
  it("REMOVES the invented address that started this", () => {
    const r = scrubInventedContacts("Email: hello@candlebyqaaf.com", facts());
    expect(r.text).not.toContain("hello@candlebyqaaf.com");
    expect(r.removed[0]).toMatch(/email address "hello@candlebyqaaf\.com".*was invented/);
  });

  it("takes the label with it, because 'Email:' alone is worse than nothing", () => {
    expect(scrubInventedContacts("Email: hello@candlebyqaaf.com", facts()).text).toBe("");
    // Including the preposition: "Call us at today." is its own bug.
    expect(scrubInventedContacts("Call us at 9123456789 today.", facts()).text).toBe("today.");
    // A spaced number is the same number. "+91 91234 56789" survived the
    // first version of this check, which demanded ten contiguous digits.
    expect(scrubInventedContacts("Phone: +91 91234 56789", facts()).text).toBe("");
  });

  it("removes an invented phone number and handle too", () => {
    const r = scrubInventedContacts("WhatsApp 9123456789 or follow @candlesbyqaaf for restocks.", facts());
    expect(r.text).not.toMatch(/9123456789|@candlesbyqaaf/);
    expect(r.removed).toHaveLength(2);
    expect(r.removed.join(" ")).toMatch(/phone number/);
    expect(r.removed.join(" ")).toMatch(/social handle/);
  });

  it("KEEPS a value the owner actually put on record", () => {
    const r = scrubInventedContacts("Email qaaf@gmail.com or WhatsApp 9876543210. Instagram @candle_by_qaaf.", onRecord);
    expect(r.text).toContain("qaaf@gmail.com");
    expect(r.text).toContain("9876543210");
    expect(r.text).toContain("@candle_by_qaaf");
    expect(r.removed).toEqual([]);
  });

  it("keeps the owner's email and removes a different one in the same line", () => {
    const r = scrubInventedContacts("Write to qaaf@gmail.com or orders@candlebyqaaf.com.", onRecord);
    expect(r.text).toContain("qaaf@gmail.com");
    expect(r.text).not.toContain("orders@candlebyqaaf.com");
  });

  it("leaves ordinary prose and prices alone", () => {
    const line = "Hand-poured soy candles from ₹550, made in small batches in Shahjahanpur.";
    expect(scrubInventedContacts(line, facts()).text).toBe(line);
    // A year is not a phone number.
    expect(scrubInventedContacts("Pouring candles since 2021.", facts()).removed).toEqual([]);
  });

  it("runs inside the block guard, on every generated page", () => {
    const tree = [{ id: "s", type: "section", props: {}, children: [
      { id: "t", type: "text", props: { html: "<p>Email: hello@candlebyqaaf.com — we reply within a day.</p>" } },
    ] }];
    const r = guardBlockTree(tree, facts());
    expect(JSON.stringify(r.blocks)).not.toContain("hello@candlebyqaaf.com");
    expect(r.removed.join(" ")).toMatch(/was invented/);
    // The rest of the sentence survives — only the value went.
    expect(JSON.stringify(r.blocks)).toContain("we reply within a day");
  });

  it("A BUSINESS WITH NOTHING ON RECORD GETS A PAGE WITH NO CONTACT VALUES", () => {
    const contactPage = [{ id: "s", type: "section", props: {}, children: [
      { id: "h", type: "heading", props: { text: "Let's Talk Fragrance" } },
      { id: "t1", type: "text", props: { html: "<p>Email: hello@candlebyqaaf.com</p>" } },
      { id: "t2", type: "text", props: { html: "<p>Phone: +91 91234 56789</p>" } },
      { id: "t3", type: "text", props: { html: "<p>Instagram: @candle_by_qaaf — slide into our DMs.</p>" } },
    ] }];
    const out = JSON.stringify(guardBlockTree(contactPage, facts()).blocks);
    expect(out).not.toMatch(/@candlebyqaaf\.com|@candle_by_qaaf/);
    expect(out).not.toMatch(/9123456789|91234 56789/);
    // And the page is still a page.
    expect(out).toContain("Let&#x27;s Talk Fragrance".replace("&#x27;", "'"));
  });
});

describe("the generators are told, as well as checked", () => {
  it("the website builder's prompt forbids it, naming what went wrong", () => {
    const builder = readFileSync("src/lib/agents/websiteBuilderAgent.ts", "utf8");
    expect(builder).toMatch(/NEVER WRITE A CONTACT DETAIL THAT IS NOT GIVEN TO YOU ABOVE/);
    expect(builder).toMatch(/hello@candlebyqaaf\.com/);
    expect(builder).toMatch(/no label, no placeholder, no "coming soon"/);
  });

  it("and so does the chat's system prompt", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/Never write a contact detail you were not given/);
    expect(brain).toMatch(/a wrong address is a lost customer nobody can find/);
  });
});
