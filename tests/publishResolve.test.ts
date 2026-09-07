// Turning a phrase into a specific thing to change.
//
// THE RULE UNDER TEST: never guess. If "the blue kurta" does not land
// on exactly one unambiguous product, the assistant asks. The cost of
// asking is one extra turn; the cost of guessing is a live price
// change on the wrong product, approved by someone who trusted the
// label they were shown.

import { describe, it, expect } from "vitest";
import { interpretCandidates, directTarget, userClarified, type ResolvedTarget } from "@/lib/publish/resolve";
import { searchShopifyVariants } from "@/lib/publish/platforms/shopifySearch";

const target = (over: Partial<ResolvedTarget> = {}): ResolvedTarget => ({
  ref: "gid://shopify/ProductVariant/1",
  title: "Blue Kurta",
  variantTitle: null,
  currentPrice: "1299",
  imageUrl: "https://cdn/img.jpg",
  active: true,
  ...over,
});

describe("resolution never guesses", () => {
  it("resolves a single exact title match without asking", () => {
    const outcome = interpretCandidates("Blue Kurta", [target()]);
    expect(outcome.status).toBe("resolved");
    expect(outcome.status === "resolved" && outcome.path).toBe("exact");
  });

  it("matches an exact title regardless of case and surrounding space", () => {
    const outcome = interpretCandidates("  blue KURTA ", [target()]);
    expect(outcome.status).toBe("resolved");
  });

  it("ASKS when several variants share the exact title", () => {
    // THE LOAD-BEARING ONE. "Kurta" in three sizes is three prices.
    // Picking the first is exactly how the wrong one gets repriced,
    // and "which size?" is a real question with a real answer.
    const outcome = interpretCandidates("Blue Kurta", [
      target({ ref: "v1", variantTitle: "Small", currentPrice: "1299" }),
      target({ ref: "v2", variantTitle: "Medium", currentPrice: "1399" }),
    ]);
    expect(outcome.status).toBe("ambiguous");
    expect(outcome.status === "ambiguous" && outcome.candidates).toHaveLength(2);
  });

  it("ASKS when there is no exact match, even with only ONE candidate", () => {
    // The tempting case, and the one the rule exists for. A single
    // near-miss looks like a safe auto-resolve and is precisely where
    // a confident wrong answer comes from.
    const outcome = interpretCandidates("kurta", [target({ title: "Blue Kurta Premium" })]);
    expect(outcome.status).toBe("ambiguous");
    expect(outcome.status === "ambiguous" && outcome.detail.matchType).toBe("fuzzy");
  });

  it("reports not_found rather than inventing a candidate", () => {
    const outcome = interpretCandidates("nonexistent", []);
    expect(outcome.status).toBe("not_found");
    expect(outcome.detail.candidateCount).toBe(0);
  });

  it("never returns a resolved path of fuzzy", () => {
    // fuzzy survives as a matchType — how candidates were FOUND — but
    // never as a resolution path, because no fuzzy match is ever
    // resolved without a person. An auto fuzzy path is a confidence
    // threshold, and thresholds are where "usually right" becomes
    // "wrong on the one that mattered".
    const outcomes = [
      interpretCandidates("kurta", [target({ title: "Blue Kurta Premium" })]),
      interpretCandidates("k", [target({ title: "Kurta" }), target({ ref: "v2", title: "Kaftan" })]),
    ];
    for (const o of outcomes) {
      expect(o.status).not.toBe("resolved");
    }
  });
});

describe("the audit records which path was taken", () => {
  it("exact records the query, the count and what was chosen", () => {
    const outcome = interpretCandidates("Blue Kurta", [target()]);
    expect(outcome.detail).toMatchObject({ query: "Blue Kurta", matchType: "exact", chosenRef: "gid://shopify/ProductVariant/1" });
  });

  it("user_clarified records how many they chose FROM", () => {
    // "They picked one of five" is a materially different fact from
    // "they picked the only option" — the first says the assistant
    // was unsure, the second that it was merely being careful.
    const shown = [target({ ref: "v1" }), target({ ref: "v2" }), target({ ref: "v3" })];
    const outcome = userClarified("kurta", shown[1], shown);
    expect(outcome.status === "resolved" && outcome.path).toBe("user_clarified");
    expect(outcome.detail.candidateCount).toBe(3);
    expect(outcome.detail.chosenRef).toBe("v2");
  });

  it("direct is distinct from exact", () => {
    // They fail differently: a wrong `direct` ref came from the
    // caller, a wrong `exact` came from the resolver. Collapsing them
    // would point an investigation at the wrong code.
    const outcome = directTarget(target());
    expect(outcome.status === "resolved" && outcome.path).toBe("direct");
    expect(outcome.detail.matchType).toBe("direct");
  });
});

describe("searchShopifyVariants", () => {
  const ok = (body: unknown) =>
    (async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;

  const productsPayload = {
    data: {
      products: {
        edges: [
          {
            node: {
              id: "p1",
              title: "Blue Kurta",
              status: "ACTIVE",
              featuredImage: { url: "https://cdn/1.jpg" },
              variants: { edges: [{ node: { id: "v1", title: "Small", price: "1299" } }, { node: { id: "v2", title: "Medium", price: "1399" } }] },
            },
          },
        ],
      },
    },
  };

  it("flattens to VARIANTS, not products", async () => {
    // A price belongs to a variant. Resolving to a product would hand
    // the caller a variant choice to guess at — the guess this whole
    // layer exists to avoid.
    const result = await searchShopifyVariants("s.myshopify.com", "tok", "kurta", ok(productsPayload));
    expect(result.ok && result.candidates).toHaveLength(2);
    expect(result.ok && result.candidates[0]).toMatchObject({ ref: "v1", title: "Blue Kurta", variantTitle: "Small", currentPrice: "1299" });
  });

  it("carries the detail needed to tell candidates apart", async () => {
    // Name alone is not enough: two "Kurta" rows at different prices
    // are indistinguishable without the price beside them.
    const result = await searchShopifyVariants("s.myshopify.com", "tok", "kurta", ok(productsPayload));
    const first = result.ok ? result.candidates[0] : null;
    expect(first?.currentPrice).toBeTruthy();
    expect(first?.imageUrl).toBeTruthy();
  });

  it('reads "Default Title" as no variant name', async () => {
    // Shopify's name for a sole variant. Showing it to a merchant
    // would be noise they have to learn to ignore.
    const payload = JSON.parse(JSON.stringify(productsPayload));
    payload.data.products.edges[0].node.variants.edges = [{ node: { id: "v1", title: "Default Title", price: "999" } }];
    const result = await searchShopifyVariants("s.myshopify.com", "tok", "kurta", ok(payload));
    expect(result.ok && result.candidates[0].variantTitle).toBeNull();
  });

  it("refuses an empty phrase without calling Shopify", async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, status: 200, text: async () => "{}" }; }) as unknown as typeof fetch;
    const result = await searchShopifyVariants("s.myshopify.com", "tok", "   ", spy);
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("returns every match unranked", async () => {
    // Ranking is the first step towards a best-guess, and a
    // pre-narrowed list hides the one the merchant actually meant.
    const payload = JSON.parse(JSON.stringify(productsPayload));
    payload.data.products.edges.push({
      node: { id: "p2", title: "Kurta Classic", status: "DRAFT", featuredImage: null, variants: { edges: [{ node: { id: "v3", title: "Default Title", price: "899" } }] } },
    });
    const result = await searchShopifyVariants("s.myshopify.com", "tok", "kurta", ok(payload));
    expect(result.ok && result.candidates.map((c) => c.ref)).toEqual(["v1", "v2", "v3"]);
    expect(result.ok && result.candidates[2].active).toBe(false);
  });
});
