// A customer said this, and now the markup says so — 19 November 2026.
//
// THE GAP. Nothing stopped an owner putting a quote in a `text` block
// with a name underneath, and once there it is a sentence like any
// other: the claims guard reads it as the business's own words, the
// facts layer cannot tell a customer apart from the shop, and a
// visitor has only the quotation marks to go on.
//
// So the distinction that matters most on this block — somebody ELSE
// said this — was carried by typography. That is the `faq_item`
// problem on the one block where attribution IS the content.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT personalStories.ts SAYS, AND WHY A REVIEW IS DIFFERENT
// ─────────────────────────────────────────────────────────────────────
//
// That guard exists because a real customer wrote to this business
// that her husband had been in an accident and she lit one of its
// candles through the hours of waiting at the hospital. The owner
// wrote it down because it moved her, and it is not hers to publish.
//
// A `reviews` row is different, and the difference is THE PURPOSE IT
// WAS WRITTEN FOR rather than how private it sounds: a review is
// submitted by the customer, through the storefront, into a form whose
// whole point is public display. The consent is in the mechanism.
//
// A story the owner transcribed has no such mechanism, which is why
// this block may never read `business_knowledge` — whatever words that
// row happens to contain.

import { describe, it, expect } from "vitest";
import { loadStorefrontReviews, MAX_SHOWN, MIN_COMMENT_CHARS } from "@/lib/catalog/storefrontReviews";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import { code } from "./helpers/source";

const row = (over: Record<string, any> = {}) => ({
  id: `r${Math.random().toString(36).slice(2, 8)}`,
  comment: "Burns clean and the smell lasts all evening.",
  customer_name: "Priya S.",
  rating: 5,
  is_hidden: false,
  created_at: "2026-11-01T00:00:00.000Z",
  products: { name: "Lavender Soy Candle" },
  ...over,
});

/** A client that answers the reviews query with these rows. */
function db(rows: any[] | null, error: any = null) {
  const api: any = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: async () => ({ data: rows, error }),
  };
  return { from: () => api } as any;
}

describe("1. ONLY WORDS A CUSTOMER CHOSE TO WRITE FOR DISPLAY", () => {
  it("THE LOAD-BEARING ONE: it reads `reviews` and nothing else", () => {
    // A story the owner transcribed is exactly the hospital story,
    // whatever it happens to say. There is no mechanism behind it and
    // no consent in it.
    const src = code("src/lib/catalog/storefrontReviews.ts");
    expect(src).toMatch(/\.from\("reviews"\)/);
    expect(src).not.toMatch(/business_knowledge|business_story|interview_answers/);
    expect((src.match(/\.from\(/g) ?? [])).toHaveLength(1);
  });

  it("AND THE BLOCK RENDERS ONLY WHAT THAT LOADER GAVE IT", () => {
    const src = code("src/components/website-builder/blocks/BlockRenderer.tsx");
    const at = src.indexOf('case "reviews"');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 1600);
    expect(body).toMatch(/ctx\.reviews/);
    expect(body).not.toMatch(/block\.props\.(quote|name|comment|author)/);
  });

  it("ITS ONLY EDITABLE PROP IS THE HEADING", () => {
    // A typed quote field would be the text block again, with a nicer
    // border.
    expect(BLOCK_REGISTRY.reviews.propFields.map((f) => f.key)).toEqual(["heading"]);
  });

  it("THE AI CANNOT AUTHOR IT", () => {
    expect(code("src/lib/agents/websiteBuilderAgent.ts")).toMatch(
      /DATA_BACKED_BLOCKS = new Set\(\["product_grid", "hours_address", "reviews"\]\)/
    );
  });
});

describe("2. FOUR FILTERS, AND EACH IS SOMEBODY'S DECISION", () => {
  it("THE OWNER'S MODERATION IS HONOURED", async () => {
    const out = await loadStorefrontReviews(db([row({ is_hidden: true }), row()]), "d1");
    expect(out).toHaveLength(1);
  });

  it("A BARE RATING IS NOT A TESTIMONIAL", async () => {
    // Showing it as one dresses a number up as a quote.
    const out = await loadStorefrontReviews(db([row({ comment: "" }), row({ comment: "ok" })]), "d1");
    expect(out).toHaveLength(0);
    expect(MIN_COMMENT_CHARS).toBeGreaterThan(5);
  });

  it("THE LOAD-BEARING ONE: AN EMPTY NAME IS SKIPPED, NOT FILLED IN", async () => {
    // Every substitute — "A customer", "Anonymous", initials — is
    // Hawlai writing the attribution instead of the customer.
    const out = await loadStorefrontReviews(db([row({ customer_name: "   " })]), "d1");
    expect(out).toEqual([]);
  });

  it("an impossible rating is not shown", async () => {
    const out = await loadStorefrontReviews(db([row({ rating: 9 }), row({ rating: null })]), "d1");
    expect(out).toEqual([]);
  });

  it("AND A FAILED READ IS NOT 'NO REVIEWS'", async () => {
    // The page renders nothing either way, but nothing may record or
    // reason about this business as having none.
    expect(await loadStorefrontReviews(db(null, { message: "boom" }), "d1")).toEqual([]);
  });

  it("more than a page's worth is capped", async () => {
    const out = await loadStorefrontReviews(db(Array.from({ length: MAX_SHOWN + 5 }, () => row())), "d1");
    expect(out).toHaveLength(MAX_SHOWN);
  });
});

describe("3. THE WORDS ARE THE CUSTOMER'S, UNCHANGED", () => {
  it("THE COMMENT IS CARRIED VERBATIM", async () => {
    const long = "It arrived early and the packaging was lovely. My mother asked where I got it.";
    const out = await loadStorefrontReviews(db([row({ comment: `  ${long}  ` })]), "d1");
    expect(out[0].comment).toBe(long);
  });

  it("AND THE NAME EXACTLY AS GIVEN", async () => {
    const out = await loadStorefrontReviews(db([row({ customer_name: "Priya S." })]), "d1");
    expect(out[0].name).toBe("Priya S.");
  });

  it("NOTHING TRUNCATES OR REWRITES IT", () => {
    // An edited testimonial is the business's words wearing a
    // customer's name.
    const src = code("src/lib/catalog/storefrontReviews.ts");
    expect(src).not.toMatch(/\.slice\(0, \d+\)|callClaude|generate/i);
    const render = code("src/components/website-builder/blocks/BlockRenderer.tsx");
    const at = render.indexOf('case "reviews"');
    expect(render.slice(at, at + 1600)).not.toMatch(/\.slice\(0,/);
  });
});

describe("4. THE MARKUP CARRIES THE ATTRIBUTION", () => {
  const body = () => {
    const src = code("src/components/website-builder/blocks/BlockRenderer.tsx");
    const at = src.indexOf('case "reviews"');
    return src.slice(at, at + 1600);
  };

  it("THE LOAD-BEARING ONE: blockquote and cite, not a styled paragraph", () => {
    // So the attribution survives being read by something that is not
    // a person — which is the entire reason this block exists rather
    // than a text block with nicer CSS.
    expect(body()).toMatch(/<blockquote/);
    expect(body()).toMatch(/<cite/);
    expect(body()).toMatch(/<figcaption/);
  });

  it("NOTHING TO SHOW MEANS NOTHING IS SHOWN", () => {
    // A heading over no reviews reads as a business with bad ones.
    expect(body()).toMatch(/if \(!items\.length\) return null;/);
  });

  it("and the page only reads reviews when it is going to show them", () => {
    const src = code("src/app/site/[slug]/page.tsx");
    expect(src).toMatch(/blockTreeContainsType\(blocks, "reviews"\)\s*\?\s*await loadStorefrontReviews/);
  });
});
