// Where the ad points, and what the campaign optimises for.
//
// THE THIRD SILENT WRONG-THING-SENT-TO-META THIS SESSION. The first was
// a hardcoded ₹ on a USD store; the second was a page referral baked
// into a prompt; this one was objective: "OUTCOME_LEADS" frozen as a
// literal, correct for the car-dealership enquiry ads the engine was
// built for and wrong the moment an ad points at a product page.
//
// All three share a shape: a value that was right for the original use
// case, written as a literal, then carried unexamined into a new one.
// So the choice lives in a pure function with its reasoning attached,
// and these tests pin the reasoning rather than the literal.

import { describe, it, expect } from "vitest";
import { resolveAdDestination, withCampaignTag } from "@/lib/ads/destination";

const PRODUCT = "https://candlesbyqaaf.myshopify.com/products/lavender-candle";

describe("priority order", () => {
  it("prefers the product page above everything else", () => {
    // The ad shows a specific candle. Sending that traffic to a
    // homepage, a landing page or a lead form all make the viewer do
    // work to find the thing they just clicked on.
    const r = resolveAdDestination({
      productUrl: PRODUCT,
      productLabel: "Lavender Candle",
      externalWebsiteUrl: "https://example.com",
      landingPageUrl: "https://hawlai.online/p/x",
      leadFormId: "form_1",
      pageId: "page_1",
    });
    expect(r.ok && r.destination.kind).toBe("shopify_product");
    expect(r.ok && r.destination.url).toBe(PRODUCT);
  });

  it("falls to the merchant's own website when there is no product page", () => {
    const r = resolveAdDestination({ externalWebsiteUrl: "https://example.com", landingPageUrl: "https://hawlai.online/p/x", leadFormId: "f", pageId: "p" });
    expect(r.ok && r.destination.kind).toBe("external_website");
  });

  it("falls to the Hawlai landing page after that", () => {
    const r = resolveAdDestination({ landingPageUrl: "https://hawlai.online/p/x", leadFormId: "f", pageId: "p" });
    expect(r.ok && r.destination.kind).toBe("landing_page");
  });

  it("uses the Instant Form LAST, not first", () => {
    // It was effectively first before: the chat path picked it whenever
    // a form existed, so an e-commerce ad collected phone numbers
    // instead of sending anyone to the shop.
    const r = resolveAdDestination({ leadFormId: "form_1", pageId: "page_1" });
    expect(r.ok && r.destination.kind).toBe("instant_form");
  });
});

describe("the objective follows the destination", () => {
  it("uses a traffic objective for a product page, never lead-gen", () => {
    // THE MISMATCH. A LEAD_GENERATION ad set aimed at a storefront is
    // refused by Meta or optimises for an event that never fires.
    const r = resolveAdDestination({ productUrl: PRODUCT, productLabel: "Lavender Candle" });
    expect(r.ok && r.destination.objective).toBe("OUTCOME_TRAFFIC");
    expect(r.ok && r.destination.optimizationGoal).toBe("LINK_CLICKS");
  });

  it("keeps lead-gen for an Instant Form, which is what it is for", () => {
    const r = resolveAdDestination({ leadFormId: "form_1", pageId: "page_1" });
    expect(r.ok && r.destination.objective).toBe("OUTCOME_LEADS");
    expect(r.ok && r.destination.optimizationGoal).toBe("LEAD_GENERATION");
  });

  it("never pairs a website destination with LEAD_GENERATION", () => {
    // The invariant, over every website-ish route rather than the one
    // case above — so a fourth destination added later cannot
    // reintroduce the mismatch.
    for (const input of [
      { productUrl: PRODUCT },
      { externalWebsiteUrl: "https://example.com" },
      { landingPageUrl: "https://hawlai.online/p/x" },
    ]) {
      const r = resolveAdDestination(input);
      expect(r.ok && r.destination.url, "a website destination must carry a url").toBeTruthy();
      expect(r.ok && r.destination.optimizationGoal).not.toBe("LEAD_GENERATION");
    }
  });

  it("sends promoted_object ONLY where Meta requires it", () => {
    // LEAD_GENERATION needs it; sending it on other objectives is
    // rejected on some of them.
    const form = resolveAdDestination({ leadFormId: "f", pageId: "p" });
    expect(form.ok && form.destination.promotedObject).toEqual({ page_id: "p" });
    const web = resolveAdDestination({ productUrl: PRODUCT });
    expect(web.ok && web.destination.promotedObject).toBeNull();
  });
});

describe("a website destination can never be null", () => {
  it("REFUSES when there is nowhere to send anyone", () => {
    // The bug this replaces: destinationUrl was hardcoded null and the
    // call site asserted it non-null with `!`, so Meta received
    // link: null and the launch died at the fourth of seven Graph
    // calls, with an error naming neither cause nor fix.
    const r = resolveAdDestination({});
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/nowhere to send people/i);
    // The refusal has to be actionable, not just accurate.
    expect(!r.ok && r.reason).toMatch(/publish the product|website address|landing page|lead form/i);
  });

  it("refuses an Instant Form with no page id, rather than sending a broken one", () => {
    expect(resolveAdDestination({ leadFormId: "form_1" }).ok).toBe(false);
  });

  it.each([["", "empty"], ["   ", "blank"], ["not a url", "unparseable"], ["ftp://x/y", "non-http scheme"], ["javascript:alert(1)", "script scheme"]])(
    "treats %s (%s) as no destination at all",
    (bad) => {
      const r = resolveAdDestination({ productUrl: bad, leadFormId: null, pageId: null });
      expect(r.ok).toBe(false);
    }
  );

  it("falls THROUGH a bad product url to the next option rather than failing", () => {
    // An unpublished product is a real state. It should demote the ad
    // to the website, not kill it.
    const r = resolveAdDestination({ productUrl: null, externalWebsiteUrl: "https://example.com" });
    expect(r.ok && r.destination.kind).toBe("external_website");
  });
});

describe("the card can say where and what-for in plain words", () => {
  it("names the product in the label", () => {
    const r = resolveAdDestination({ productUrl: PRODUCT, productLabel: "Lavender Candle" });
    expect(r.ok && r.destination.label).toContain("Lavender Candle");
  });

  it("says plainly that a lead form keeps people on Facebook", () => {
    // The merchant should be able to tell, from the card alone, that
    // this ad cannot sell anything.
    const r = resolveAdDestination({ leadFormId: "f", pageId: "p" });
    expect(r.ok && r.destination.label).toMatch(/don't leave Facebook/i);
  });

  it("describes the objective without Meta's vocabulary", () => {
    for (const input of [{ productUrl: PRODUCT }, { leadFormId: "f", pageId: "p" }]) {
      const r = resolveAdDestination(input);
      expect(r.ok && r.destination.objectiveLabel).not.toMatch(/OUTCOME_|LINK_CLICKS|LEAD_GENERATION/);
    }
  });
});

describe("campaign tagging", () => {
  it("tags an untagged url", () => {
    expect(withCampaignTag("https://x.com/p/1", "draft-1")).toContain("utm_campaign=draft-1");
  });

  it("uses & when the url already has a query string", () => {
    expect(withCampaignTag("https://x.com/p?variant=2", "d")).toContain("?variant=2&utm_source=");
  });

  it("LEAVES an already-tagged url alone", () => {
    // Overriding a link the merchant deliberately set up is worse than
    // not tagging it.
    const own = "https://x.com/p?utm_source=newsletter";
    expect(withCampaignTag(own, "d")).toBe(own);
  });
});
