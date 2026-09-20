// The booking link a customer is given is the booking link (2026-09-21).
//
// THE LIVE BUG, and it cost bookings: chat wrote a workshop caption with
// "Book here" linked to https://calendly.com — Calendly's own marketing
// homepage. The workshop's real page, https://calendly.com/candlebyqaaf/
// workshop, was in the verified facts the model had been given.
//
// Two holes, both fixed here:
//   1. The claims guard allowed any link whose HOST appeared in the
//      owner's own text. The real booking link put "calendly.com" in that
//      text, so the bare homepage passed as verified — in captions,
//      emails, Autopilot posts, everywhere generated copy is checked.
//   2. The chat AI's own prose was never checked at all. Only what the
//      TOOLS returned was.
//
// Every assertion below compares the whole URL, path and all. A test that
// only asks "is there a link?" would have passed throughout the bug.

import { describe, it, expect } from "vitest";

import { findUnsupportedLinks, stripUnsupported, guardGenerated, repairBookingLinks } from "@/lib/claims/claimCheck";
import { fixReplyLinks, bookingLinkOf, knownLinks, linkFixNote } from "@/lib/chat/replyLinks";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const BOOKING = "https://calendly.com/candlebyqaaf/workshop";
const STORE = "https://hawlai.online/site/candle-by-qaaf";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products", "services"], inferred: false },
    city: "Shahjahanpur", site: null, home: null,
    products: [
      { id: "p1", name: "Candle Making Workshop", kind: "service", price: 800, duration_minutes: 90, description: "Hands-on candle making, 90 minutes", images: [], inventory: null, category: null, active: true, bookingUrl: BOOKING },
      { id: "p2", name: "Lavender Candle", price: 450, description: "Soy wax, hand poured", images: [], inventory: 12, category: null, active: true },
    ],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 3, leads: 1 },
    // The owner's own words mention Calendly — this is what made the
    // homepage look verified.
    ownerFacts: [{ category: "business_story", title: "Booking", content: `Workshop slots Calendly pe hain — ${BOOKING}` }],
    brand: { tone: "warm", voice: null, persona: null, language: "hinglish", pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: STORE, products: [{ name: "Lavender Candle", url: `${STORE}/product/lavender-candle` }], booking: BOOKING },
    season: { today: "2026-09-21", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

// ---- 1. the guard on generated copy ---------------------------------------

describe("the right host is not the right link", () => {
  it("the bare homepage of the booking provider is not this business's booking page", () => {
    const reasons = findUnsupportedLinks("Book here: https://calendly.com", facts());
    expect(reasons).toHaveLength(1);
    // And the owner is told where bookings actually go.
    expect(reasons[0]).toContain(BOOKING);
    expect(reasons[0]).toContain("not the booking page");
  });

  it("the real booking link passes, in full", () => {
    expect(findUnsupportedLinks(`Book your slot: ${BOOKING}`, facts())).toEqual([]);
    // Trailing punctuation and a trailing slash are the same link.
    expect(findUnsupportedLinks(`Book at ${BOOKING}/.`, facts())).toEqual([]);
    expect(findUnsupportedLinks(`Book at ${BOOKING}?month=2026-10`, facts())).toEqual([]);
  });

  it("someone else's page on the same provider is still wrong", () => {
    const reasons = findUnsupportedLinks("Book here: https://calendly.com/someone-else/workshop", facts());
    expect(reasons).toHaveLength(1);
  });

  it("the store's own pages stay free — every path under it is theirs", () => {
    expect(findUnsupportedLinks(`Shop: ${STORE}/product/lavender-candle and ${STORE}/about`, facts())).toEqual([]);
  });

  it("a domain that doesn't exist is still caught (the first live case)", () => {
    const reasons = findUnsupportedLinks("Order at candlebyqaaf.com/products/lavender-candle", facts());
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain(STORE);
  });
});

describe("a wrong booking link is repaired, not deleted", () => {
  it("the CTA survives with the right address", () => {
    const r = repairBookingLinks("Slots bhar rahe hain. Book here: https://calendly.com", facts());
    expect(r.text).toBe(`Slots bhar rahe hain. Book here: ${BOOKING}`);
    expect(r.fixed).toEqual(["https://calendly.com"]);
  });

  it("punctuation after the link is kept, and the sentence still reads", () => {
    const r = repairBookingLinks("Book at calendly.com.", facts());
    expect(r.text).toBe(`Book at ${BOOKING}.`);
  });

  it("the real link is left untouched — no needless rewriting", () => {
    const r = repairBookingLinks(`Book at ${BOOKING}`, facts());
    expect(r.fixed).toEqual([]);
    expect(r.text).toBe(`Book at ${BOOKING}`);
  });

  it("the sentence is no longer stripped, and the owner is told what changed", () => {
    // Before the fix this whole line would have been deleted as an
    // unverifiable claim — losing the call to action along with the link.
    const s = stripUnsupported("Apni pehli candle khud dhaalo. Book here: https://calendly.com", facts(), "publish");
    expect(s.text).toContain(BOOKING);
    expect(s.text).toContain("Book here");
    expect(s.linksFixed).toEqual(["https://calendly.com"]);

    const g = guardGenerated({ caption: "Book here: https://calendly.com" }, facts(), "draft");
    expect((g.output as any).caption).toBe(`Book here: ${BOOKING}`);
    expect(g.output._claimsNote).toContain(BOOKING);
  });

  it("the same repair reaches every surface, because they all go through this guard", () => {
    // A caption, an email body and an Autopilot post are all just strings
    // inside a generated object.
    const g = guardGenerated(
      { subject: "Ek shaam, ek candle", body: "Book here: https://calendly.com", days: [{ caption: "Slots open — calendly.com" }] },
      facts(),
      "draft"
    );
    expect((g.output as any).body).toBe(`Book here: ${BOOKING}`);
    expect((g.output as any).days[0].caption).toBe(`Slots open — ${BOOKING}`);
  });
});

// ---- 2. the chat AI's own prose -------------------------------------------

describe("what the chat AI writes itself", () => {
  const f = facts();

  it("THE LIVE CASE: the rendered link is the stored booking link, path and all", () => {
    const reply = "Here's the caption:\n\nKhud banao, khud le jaao. ₹800. [Book here](https://calendly.com)";
    const fix = fixReplyLinks(reply, f);

    // The whole URL, not just "a link exists" and not just the host.
    const rendered = fix.reply.match(/\[Book here\]\(([^)]+)\)/)?.[1];
    expect(rendered).toBe(BOOKING);
    expect(rendered).not.toBe("https://calendly.com");
    expect(fix.corrected).toBe(1);
    expect(fix.bookingLink).toBe(BOOKING);
  });

  it("a bare wrong link too", () => {
    const fix = fixReplyLinks("Book karo: https://calendly.com", f);
    expect(fix.reply).toBe(`Book karo: ${BOOKING}`);
  });

  it("the right link is returned exactly as written", () => {
    const reply = `Slots yahan hain: [Book your slot](${BOOKING})`;
    expect(fixReplyLinks(reply, f).reply).toBe(reply);
    expect(fixReplyLinks(reply, f).corrected).toBe(0);
  });

  it("the store and its pages pass", () => {
    const reply = `Store: ${STORE} — and the candle: [Lavender](${STORE}/product/lavender-candle)`;
    expect(fixReplyLinks(reply, f).reply).toBe(reply);
  });

  it("an invented booking link, with no real one to put in its place, stops being a link", () => {
    const noBooking = facts({
      links: { store: STORE, products: [], booking: null },
      products: [{ id: "p1", name: "Candle Making Workshop", kind: "service", price: 800, images: [], inventory: null, category: null, active: true } as any],
    });
    const fix = fixReplyLinks("Grab a slot: [Book now](https://bookmyworkshop.in/qaaf)", noBooking);
    expect(fix.reply).toContain("Book now");
    expect(fix.reply).not.toContain("bookmyworkshop.in");
    expect(fix.removed).toBe(1);
  });

  it("links that aren't a customer CTA are left alone — a competitor being quoted, Meta's own docs", () => {
    const reply = "Their site says they hand-pour too — https://rivalcandles.in/about. Meta's rule is here: [ad policy](https://www.facebook.com/policies/ads).";
    const fix = fixReplyLinks(reply, f);
    expect(fix.reply).toBe(reply);
    expect(fix.corrected + fix.removed).toBe(0);
  });

  it("a generated image stays rendered — it is not a customer link", () => {
    const img = "https://xyz.supabase.co/storage/v1/object/public/graphics/candle.png";
    const fix = fixReplyLinks(`Here it is:\n\n![Diwali candle](${img})`, f);
    expect(fix.reply).toContain(`![Diwali candle](${img})`);
    expect(fix.removed).toBe(0);
  });

  it("no facts at all: nothing is invented and nothing is mangled", () => {
    const reply = "Book here: https://calendly.com";
    expect(fixReplyLinks(reply, null).reply).toBe(reply);
  });

  it("the owner is told, never silently corrected", () => {
    const fix = fixReplyLinks("[Book here](https://calendly.com)", f);
    expect(fix.corrected).toBe(1);
    expect(linkFixNote(fix)).toContain(BOOKING);
  });
});

describe("where the booking link is read from", () => {
  it("the service's own link wins, then the booking page", () => {
    expect(bookingLinkOf(facts())).toBe(BOOKING);
    const pageOnly = facts({
      products: [{ id: "p1", name: "Workshop", kind: "service", price: 800, images: [], inventory: null, category: null, active: true } as any],
      links: { store: STORE, products: [], booking: "https://hawlai.online/book/candle-by-qaaf" },
    });
    expect(bookingLinkOf(pageOnly)).toBe("https://hawlai.online/book/candle-by-qaaf");
  });

  it("the known set holds whole links, not just hosts", () => {
    const { exact, hosts } = knownLinks(facts());
    expect(exact.has(BOOKING.toLowerCase())).toBe(true);
    expect(exact.has("https://calendly.com")).toBe(false);
    // The store's host is trusted wholesale; the booking provider's is not
    // a free pass, because the exact-link check runs first.
    expect(hosts.has("hawlai.online")).toBe(true);
  });
});
