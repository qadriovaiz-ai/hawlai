// What a machine reads off a Hawlai storefront (Brain, Phase 1a).
//
// THE GAP: the SEO toolkit's "Schema Markup" task writes a JSON-LD block
// for the owner to paste somewhere — and Hawlai builds the site, so
// there was nowhere to paste it and nothing was ever emitted. Every
// storefront has been invisible to the structured-data readers that
// search engines and AI answer engines use.
//
// The rule these tests exist to hold: only what the business really has.
// Structured data is machine-readable and therefore believed, so an
// invented address or a made-up rating does more damage here than in any
// caption.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { storefrontJsonLd, itemNode, businessNode, jsonLdText, type SiteIdentity } from "@/lib/seo/structuredData";
import StructuredData from "@/components/website/StructuredData";
import type { StorefrontProduct } from "@/lib/catalog/storefrontCatalog";

const SITE = "https://hawlai.online/site/candle-by-qaaf";

const identity = (over: Partial<SiteIdentity> = {}): SiteIdentity => ({
  businessName: "Candle by Qaaf",
  city: "Shahjahanpur",
  category: "Home fragrance",
  description: "Hand-poured soy candles.",
  siteUrl: SITE,
  logoUrl: null,
  bookingUrl: null,
  ...over,
});

const candle: StorefrontProduct = {
  id: "p1", name: "Lavender Candle", description: "Soy wax, hand poured", price: 450,
  compare_at_price: null, images: ["https://cdn/x.jpg"], inventory_count: 12, kind: "product",
  duration_minutes: null, book_href: null,
};

const workshop: StorefrontProduct = {
  id: "s1", name: "Candle Making Workshop", description: "90 minutes, hands on", price: 800,
  compare_at_price: null, images: [], inventory_count: null, kind: "service",
  duration_minutes: 90, book_href: "https://calendly.com/candlebyqaaf/workshop",
};

const graph = (node: any) => node["@graph"] as any[];

describe("the business itself", () => {
  it("says what is on record and nothing more", () => {
    const b = businessNode(identity());
    expect(b).toMatchObject({ "@type": "LocalBusiness", name: "Candle by Qaaf", url: SITE });
    expect(b.address).toEqual({ "@type": "PostalAddress", addressLocality: "Shahjahanpur", addressCountry: "IN" });
    // NEVER a rating: Hawlai has no rating data for any business, and a
    // fabricated one is the most damaging thing this file could emit.
    expect(JSON.stringify(b)).not.toContain("aggregateRating");
    expect(JSON.stringify(b)).not.toContain("reviewCount");
  });

  it("NO CITY, NO ADDRESS — an empty field is left out, never filled with a plausible one", () => {
    const b = businessNode(identity({ city: null, description: null, logoUrl: null }));
    // The KEY must be absent, not present-and-empty: a published
    // "description": "" tells a reader the business has none, which is a
    // claim we never meant to make.
    expect(Object.keys(b).sort()).toEqual(["@type", "name", "url"]);
    expect(JSON.stringify(b)).not.toContain("address");
  });
});

describe("the catalogue", () => {
  it("a product is bought: it carries stock and a price", () => {
    const n: any = itemNode(candle, identity());
    expect(n["@type"]).toBe("Product");
    expect(n.offers).toMatchObject({ price: "450", priceCurrency: "INR", availability: "https://schema.org/InStock" });
    expect(n.offers.url).toBe(`${SITE}/products/p1`);
  });

  it("out of stock says so, rather than staying quiet about it", () => {
    const n: any = itemNode({ ...candle, inventory_count: 0 }, identity());
    expect(n.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("A SERVICE IS BOOKED, NOT STOCKED — no availability is claimed, and the offer points at the booking", () => {
    const n: any = itemNode(workshop, identity());
    expect(n["@type"]).toBe("Service");
    expect(n.offers.availability).toBeUndefined();
    expect(n.offers.url).toBe("https://calendly.com/candlebyqaaf/workshop");
    expect(n.provider).toMatchObject({ "@type": "LocalBusiness", name: "Candle by Qaaf" });
  });

  it("unknown stock claims nothing either way", () => {
    const n: any = itemNode({ ...candle, inventory_count: null }, identity());
    expect("availability" in n.offers).toBe(false);
  });

  it("a service with a stock number on its row STILL claims no availability", () => {
    // Service rows can carry an inventory_count from before they were
    // services (migration 188). It means nothing for something booked,
    // and must not be published as though it did.
    const n: any = itemNode({ ...workshop, inventory_count: 5 }, identity());
    expect("availability" in n.offers).toBe(false);
  });

  it("descriptions are plain words — the markdown the field really holds is not published raw", () => {
    const n: any = itemNode({ ...candle, description: "Soy wax, **hand poured**. [See the range](/shop) <p>stray</p>" }, identity());
    expect(n.description).toBe("Soy wax, hand poured. See the range stray");
    expect(n.description).not.toContain("**");
    expect(n.description).not.toContain("<p>");
  });
});

describe("the whole page", () => {
  it("business and catalogue together, in order", () => {
    const node = storefrontJsonLd(identity(), [candle, workshop])!;
    expect(node["@context"]).toBe("https://schema.org");
    expect(graph(node)[0]["@type"]).toBe("LocalBusiness");
    const list = graph(node)[1];
    expect(list["@type"]).toBe("ItemList");
    expect(list.itemListElement.map((e: any) => e.position)).toEqual([1, 2]);
    expect(list.itemListElement[1].item["@type"]).toBe("Service");
  });

  it("an empty catalogue publishes the business alone, not an empty list", () => {
    const node = storefrontJsonLd(identity(), [])!;
    expect(graph(node)).toHaveLength(1);
  });

  it("nothing true to say, nothing published", () => {
    expect(storefrontJsonLd(identity({ businessName: "   " }), [candle])).toBeNull();
    expect(storefrontJsonLd(identity({ siteUrl: "" }), [candle])).toBeNull();
    expect(jsonLdText(null)).toBeNull();
  });
});

describe("what reaches the page", () => {
  it("renders as a JSON-LD script tag", () => {
    const html = renderToStaticMarkup(createElement(StructuredData, { node: storefrontJsonLd(identity(), [candle]) }));
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain("Candle by Qaaf");
  });

  it("A DESCRIPTION CANNOT CLOSE THE SCRIPT TAG — data stays data", () => {
    const nasty = { ...candle, description: 'Nice </script><script>alert("x")</script>' };
    const html = renderToStaticMarkup(createElement(StructuredData, { node: storefrontJsonLd(identity(), [nasty]) }));
    // Exactly one script element: the one we meant to write.
    expect(html.match(/<script/g) ?? []).toHaveLength(1);
    expect(html.match(/<\/script>/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("alert(\"x\")</script>");
  });

  it("and the escaping holds for a '<' that is genuinely part of the words", () => {
    // stripTags leaves this alone — it is a less-than sign, not a tag —
    // so this is the case the escaping in jsonLdText actually catches.
    const text = jsonLdText(storefrontJsonLd(identity(), [{ ...candle, description: "Burns at < 200°C" }]))!;
    expect(text).toContain("\\u003c 200");
    expect(text).not.toContain("< 200");
  });

  it("nothing to publish renders nothing at all", () => {
    expect(renderToStaticMarkup(createElement(StructuredData, { node: null }))).toBe("");
  });
});
