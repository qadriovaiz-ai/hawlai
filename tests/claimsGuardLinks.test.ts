// Two bugs in one report, both on live copy surfaces.
//
// Measured 2026-10-03 while wiring the department guard: passing
// "https://cdn.hawlai.online/logos/9876543210.png" through the guard
// returned "hawlai.online/logos/9876543210.png". Content, Email, Paid
// Ads, Retargeting and WhatsApp all run their copy through it.
//
// 1. A SUBDOMAIN OF THE OWNER'S OWN HOST was read as a foreign host,
//    because the allowed set held the exact host only. A CDN image, a
//    staging host, an app subdomain — the business's own address, called
//    somebody else's.
//
// 2. THE DOTS IN A HOSTNAME WERE FULL STOPS to the sentence splitter.
//    "See https://cdn.hawlai.online/logos/a.png here." split after
//    "https://cdn.", so removing the sentence that carried the link
//    removed "See https://cdn." and left "hawlai.online/logos/a.png
//    here." standing. That one is the worse of the two: every
//    unsupported link with a dotted host was reported as removed while a
//    broken fragment of it stayed in copy about to be sent.

import { describe, it, expect, vi } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const HOME = { slug: "home", title: "Home", headings: ["Candles poured by hand"], paragraphs: ["Hand-poured soy wax candles."], buttons: ["Shop"], metaDescription: null, hasShareImage: false };

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "candle_by_qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [HOME] }, home: HOME,
    products: [{ id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 13, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 7.7, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 }, ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-03"), unreadable: [],
    ...over,
  } as BusinessFacts;
}

async function guard() {
  return import("@/lib/claims/claimCheck");
}

describe("the owner's own host, and everything under it", () => {
  it("allows a subdomain of the store's host", async () => {
    const { findUnsupportedLinks } = await guard();
    for (const url of [
      "https://cdn.hawlai.online/logos/9876543210.png",
      "https://images.hawlai.online/p/lavender.jpg",
      "https://staging.hawlai.online/site/candle-by-qaaf",
      "https://cdn.hawlai.online/a/b/c.png?w=600&h=400",
    ]) {
      expect(findUnsupportedLinks(url, facts()), url).toEqual([]);
    }
  });

  it("still allows the host itself, with paths and query strings", async () => {
    const { findUnsupportedLinks } = await guard();
    for (const url of [
      "https://hawlai.online/site/candle-by-qaaf",
      "https://hawlai.online/site/candle-by-qaaf/contact",
      "https://hawlai.online/site/candle-by-qaaf?utm_source=ig&utm_medium=bio",
    ]) {
      expect(findUnsupportedLinks(url, facts()), url).toEqual([]);
    }
  });

  it("is a dot boundary, not a bare suffix", async () => {
    const { findUnsupportedLinks } = await guard();
    // The cases a suffix check would wave through. These are the reason
    // it matches on ".host" and not on "endsWith(host)".
    for (const url of [
      "https://evilhawlai.online/pay",
      "https://hawlai.online.attacker.com/pay",
      "https://nothawlai.online/pay",
    ]) {
      expect(findUnsupportedLinks(url, facts()).length, url).toBeGreaterThan(0);
    }
  });

  it("does not work upwards from a product link's subdomain", async () => {
    const { findUnsupportedLinks } = await guard();
    // Owning cdn.example.com does not make example.com theirs.
    const f = facts({ links: { store: "https://cdn.example.com/shop", products: [] } } as any);
    expect(findUnsupportedLinks("https://cdn.example.com/shop/lavender", f)).toEqual([]);
    expect(findUnsupportedLinks("https://example.com/pay", f).length).toBeGreaterThan(0);
  });

  it("a foreign host is still refused, subdomain or not", async () => {
    const { findUnsupportedLinks } = await guard();
    for (const url of [
      "https://images.unsplash.com/photo-1.jpg",
      "https://calendly.com",
      "https://shop.rivalcandles.in/jar",
    ]) {
      expect(findUnsupportedLinks(url, facts()).length, url).toBeGreaterThan(0);
    }
  });
});

describe("removing a link removes all of it", () => {
  it("leaves no fragment of a foreign URL in the copy", async () => {
    const { stripUnsupported } = await guard();
    const r = stripUnsupported("See https://images.unsplash.com/photo-1.jpg here. Our candles are hand-poured.", facts(), "draft");
    // THE BUG: this used to return "unsplash.com/photo-1.jpg here. Our
    // candles are hand-poured." — the link "removed" and still readable.
    expect(r.text).not.toContain("unsplash");
    expect(r.text).not.toContain("photo-1.jpg");
    // And the honest sentence beside it is untouched.
    expect(r.text).toContain("Our candles are hand-poured.");
  });

  it("removes the whole sentence even when the host has several dots", async () => {
    const { stripUnsupported } = await guard();
    const r = stripUnsupported("Buy at https://a.b.c.rivalcandles.co.in/x.html today. Shop the Lavender candle.", facts(), "draft");
    expect(r.text).not.toMatch(/rivalcandles|\.co\.in|x\.html/);
    expect(r.text).toContain("Shop the Lavender candle.");
  });

  it("keeps a sentence whose only link is the owner's own CDN", async () => {
    const { stripUnsupported } = await guard();
    const text = "Our new label, shown at https://cdn.hawlai.online/logos/9876543210.png, is hand-stamped.";
    expect(stripUnsupported(text, facts(), "draft").text).toBe(text);
  });

  it("still splits ordinary sentences at full stops", async () => {
    const { stripUnsupported } = await guard();
    // Masking links must not stop the splitter doing its actual job:
    // only the sentence carrying the claim goes.
    const r = stripUnsupported("Hand-poured in Shahjahanpur. We are India's number 1 candle brand. Shop now.", facts(), "draft");
    expect(r.text).toContain("Hand-poured in Shahjahanpur.");
    expect(r.text).toContain("Shop now.");
    expect(r.text).not.toMatch(/number 1/);
  });

  it("does not disturb copy that has no links at all", async () => {
    const { stripUnsupported } = await guard();
    const text = "Light it, breathe out, stay a while. 🕯️ Shop the Lavender candle — ₹999.";
    expect(stripUnsupported(text, facts(), "draft").text).toBe(text);
  });
});
