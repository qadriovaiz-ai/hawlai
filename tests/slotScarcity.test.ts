// Urgency about a service's slots is a claim too (2026-09-21).
//
// THE LIVE CASE: a workshop caption ended "₹800 · Slots limited · Book
// karo". Nothing on record says how many slots a workshop has — a
// service carries no stock count at all, by design (migration 188:
// services are booked, never counted). The stock patterns in the claims
// guard talk about pieces, stock and selling out, so every slot-shaped
// version of the same urgency went straight through to the customer.

import { describe, it, expect } from "vitest";

import { findUnsupportedClaims, stripUnsupported } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products", "services"], inferred: false },
    city: "Shahjahanpur", site: null, home: null,
    products: [
      { id: "p1", name: "Candle Making Workshop", kind: "service", price: 800, duration_minutes: 90, description: "Hands-on candle making, 90 minutes", images: [], inventory: null, category: null, active: true },
      { id: "p2", name: "Lavender Candle", price: 450, description: "Soy wax", images: [], inventory: 12, category: null, active: true },
    ],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 3, leads: 1 },
    ownerFacts: [],
    brand: { tone: "warm", voice: null, persona: null, language: "hinglish", pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [], booking: null },
    season: { today: "2026-09-21", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

const caught = (copy: string, f: BusinessFacts = facts()) => findUnsupportedClaims(copy, f);

describe("hurry about slots that nothing backs", () => {
  it("THE LIVE CAPTION is caught", () => {
    const caption = "Khud banao. Khud le jaao. 90 minutes mein ek candle jo sirf tumhari hai. ₹800 · Slots limited · Book karo";
    const reasons = caught(caption);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("Slots limited");
    // Said in the right terms: a service has no stock to be low on.
    expect(reasons[0]).toContain("a service has no stock count");
  });

  it("every ordinary way of writing it, English and Hinglish", () => {
    for (const copy of [
      "Slots limited — book now.",
      "Limited slots for Saturday's batch.",
      "Only 3 slots left for this weekend.",
      "Sirf 2 seats bache hain.",
      "Seats filling fast!",
      "Slots bhar rahe hain, jaldi karo.",
      "A few spots left.",
      "Last few seats for the October batch.",
      "Limited seats available.",
      "Bookings are filling up fast.",
      "Batches are almost full.",
    ]) {
      expect(caught(copy), copy).toHaveLength(1);
    }
  });

  it("the line goes, and the rest of the caption is left exactly as written", () => {
    const r = stripUnsupported("Khud dhaalo apni pehli candle. Slots limited! ₹800 per person.", facts());
    expect(r.text).toContain("Khud dhaalo apni pehli candle.");
    expect(r.text).toContain("₹800 per person.");
    expect(r.text).not.toContain("Slots limited");
    expect(r.removed[0]).toContain("Slots limited");
  });
});

describe("what it must not catch", () => {
  it("plain availability is a fact, not a claim", () => {
    for (const copy of [
      "Slots available this Saturday.",
      "Seats are available for the evening batch.",
      "Two batches every weekend.",
      "Book your slot for Saturday.",
      "90 minutes, one candle, ₹800.",
      "Limited edition Diwali fragrance.",
    ]) {
      expect(caught(copy), copy).toEqual([]);
    }
  });

  it("the owner's own words stand — they know their own capacity", () => {
    // Said in Business Knowledge, so the business stands behind it. Same
    // rule as every other claim in this guard.
    const withNote = facts({
      ownerFacts: [{ category: "policy", title: "Batch size", content: "Har workshop mein slots limited hain — sirf 6 log ek batch mein." }],
    });
    expect(caught("Slots limited — book now.", withNote)).toEqual([]);
    // But it doesn't license a different, bigger claim.
    expect(caught("Only 2 slots left!", withNote)).toHaveLength(1);
  });

  it("stock urgency for a real product is still judged as stock, in its own words", () => {
    const r = caught("Only 3 left in stock.");
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("urgency about stock");
  });
});
