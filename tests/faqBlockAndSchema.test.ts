// A question and its answer, kept as a pair all the way out (A2 of
// docs/PLAN-AEO-GEO.md).
//
// WHAT THE AUDIT FOUND. The block registry had no FAQ block, and a
// legacy `faq` section was converted at convertLegacy.ts:90 into a
// column of generic heading + text pairs. The words survived; the
// machine-readable fact that one is a question and the other is its
// answer did not. Nothing downstream could emit FAQPage schema, because
// nothing downstream could tell which string was which.
//
// And the JSON-LD that did exist was on ONE page. `/site/[slug]` carried
// LocalBusiness + ItemList; `/site/[slug]/[page]` and the product page
// carried nothing at all — so an FAQ page, the most quotable page a
// small business can have, published no structured data.
//
// THE HONEST LIMIT, asserted here as well as written in the plan:
// Google narrowed FAQPage's rich-result eligibility in 2023. This is not
// a dropdown in a search result. It is the page stating, in a form that
// needs no parsing, which string is a question customers ask and which
// is the answer — which is what an answer engine quotes.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { code } from "./helpers/source";

import { BLOCK_REGISTRY, createBlock } from "@/lib/blocks/registry";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import { faqPairsFromBlocks } from "@/lib/blocks/utils";
import { faqPageNode, storefrontJsonLd, productPageJsonLd, jsonLdText } from "@/lib/seo/structuredData";
import { TEXT_PROPS } from "@/lib/pages/provenance";
import { auditSite } from "@/lib/seo/technicalAudit";
import BlockRenderer from "@/components/website-builder/blocks/BlockRenderer";
import { getTheme } from "@/lib/landingThemes";

const LEGACY_FAQ = {
  type: "faq",
  heading: "Questions we get asked",
  items: [
    { question: "How long does one candle burn?", answer: "About 40 hours for the 200g jar." },
    { question: "Do you deliver outside Shahjahanpur?", answer: "Yes, anywhere in India." },
  ],
};

const identity = {
  businessName: "Candle by Qaaf",
  city: "Shahjahanpur",
  category: "candles",
  description: "Hand-poured soy candles.",
  siteUrl: "https://hawlai.online/site/candle-by-qaaf",
  logoUrl: null,
  bookingUrl: null,
};

function render(blocks: any[]): string {
  const ctx = { theme: getTheme(undefined as any), slug: "candle-by-qaaf" };
  return blocks.map((block, i) => renderToStaticMarkup(createElement(BlockRenderer, { key: i, block, ctx }))).join("");
}

// ---------------------------------------------------------------------
describe("1. THE PAIR SURVIVES THE CONVERSION", () => {
  it("A LEGACY FAQ SECTION BECOMES PAIRS, NOT A COLUMN OF HEADINGS", () => {
    const blocks = legacyToBlocks([LEGACY_FAQ]);
    const pairs = faqPairsFromBlocks(blocks);
    expect(pairs).toEqual([
      { question: "How long does one candle burn?", answer: "About 40 hours for the 200g jar." },
      { question: "Do you deliver outside Shahjahanpur?", answer: "Yes, anywhere in India." },
    ]);
  });

  it("and the block it builds is the registry's faq block, with faq_item children", () => {
    const blocks = legacyToBlocks([LEGACY_FAQ]);
    const faq = (blocks[0].children ?? [])[0];
    expect(faq.type).toBe("faq");
    expect(faq.props.heading).toBe("Questions we get asked");
    expect((faq.children ?? []).map((c: any) => c.type)).toEqual(["faq_item", "faq_item"]);
  });

  it("A PAIR WITH NO QUESTION IS DROPPED, never carried with an empty one", () => {
    // An answer to nothing is not a question, and the schema would have
    // to invent the question in order to publish it.
    const blocks = legacyToBlocks([{ type: "faq", heading: "Q", items: [{ question: "   ", answer: "Yes." }] }]);
    expect(faqPairsFromBlocks(blocks)).toEqual([]);
    const faq = (blocks[0].children ?? [])[0];
    expect(faq.children ?? []).toEqual([]);
  });

  it("and the conversion is still idempotent — a converted page converts to itself", () => {
    const once = legacyToBlocks([LEGACY_FAQ]);
    expect(faqPairsFromBlocks(legacyToBlocks(once))).toEqual(faqPairsFromBlocks(once));
  });

  it("A HALF-FILLED PAIR IS DROPPED BY THE READER TOO, not only by the converter", () => {
    // FOUND BY A MUTATION. Every other assertion here reaches the reader
    // through legacyToBlocks, which already drops a question-less item,
    // or through faqPageNode, which filters again — so changing the
    // reader's own `&&` to `||` changed nothing that was measured. The
    // reader is what the pages call, so the reader is tested directly.
    const tree = [
      { id: "s", type: "section", props: {}, children: [
        { id: "a", type: "faq_item", props: { heading: "Open on Sunday?", html: "   " } },
        { id: "b", type: "faq_item", props: { heading: "  ", html: "Yes, 11am to 7pm." } },
        { id: "c", type: "faq_item", props: { heading: "Do you deliver?", html: "Anywhere in India." } },
      ] },
    ];
    expect(faqPairsFromBlocks(tree as any)).toEqual([{ question: "Do you deliver?", answer: "Anywhere in India." }]);
  });

  it("A PAIR COUNTS WHEREVER IT SITS, because allowedChildren is advisory", () => {
    const loose = [
      { id: "s", type: "section", props: {}, children: [createBlock("faq_item", { props: { heading: "Open on Sunday?", html: "Yes, 11am to 7pm." } })] },
    ];
    expect(faqPairsFromBlocks(loose as any)).toEqual([{ question: "Open on Sunday?", answer: "Yes, 11am to 7pm." }]);
  });
});

// ---------------------------------------------------------------------
describe("2. THE PROPS ARE THE ONES THE CLAIMS SYSTEM READS", () => {
  // THE REASON THIS SECTION EXISTS. `faq_item` holds its question on
  // `heading` and its answer on `html` — names that read badly and are
  // load-bearing. Several systems are keyed on that exact set of prop
  // names: who wrote this line, the claims guard, the owner's claims
  // review, the builder's marking of his own edits, the request the
  // review's remove button sends, and what the model is allowed to name.
  // A prop called `answer` would be invisible to all of them, so an
  // AI-written FAQ answer would reach a live page UNGUARDED — the
  // 2026-09-30 incident that put the guard on the builder.
  //
  // UNTIL 8 NOVEMBER 2026 THEY EACH DECLARED THE LIST THEMSELVES — six
  // copies — and these tests read each file in turn because the copies
  // were the risk. There is one declaration now, so they check that each
  // file ASKS it instead, and tests/textPropsSingleSource.test.ts fails
  // if a seventh copy appears.

  const TEXTY = new Set(["text", "textarea", "richtext"]);
  /**
   * Props that hold words but are deliberately NOT guarded.
   *
   * `alt` (2026-11-06): an image's alt text. It describes a picture
   * rather than making a claim, and adding it to the guarded set would
   * change what the guard rewrites on every existing page — a separate
   * decision from this one, and not A2's to make.
   */
  const EXEMPT: Record<string, string> = { alt: "2026-11-06 — describes a picture, not a claim" };

  it("EVERY TEXT-BEARING PROP IN THE REGISTRY IS ONE THE CLAIMS SYSTEM READS", () => {
    const unguarded: string[] = [];
    for (const [type, def] of Object.entries(BLOCK_REGISTRY)) {
      for (const field of def.propFields ?? []) {
        if (!TEXTY.has(field.type)) continue;
        if (EXEMPT[field.key]) continue;
        if (!(TEXT_PROPS as readonly string[]).includes(field.key)) unguarded.push(`${type}.${field.key}`);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("and the FAQ block's own two props are in that set by name", () => {
    const keys = (BLOCK_REGISTRY.faq_item.propFields ?? []).map((f) => f.key);
    expect(keys).toEqual(["heading", "html"]);
    for (const key of keys) expect(TEXT_PROPS as readonly string[]).toContain(key);
    expect((BLOCK_REGISTRY.faq.propFields ?? []).map((f) => f.key)).toEqual(["heading"]);
  });

  it("THE CLAIMS GUARD'S OWN KEY LIST STILL COVERS THEM", () => {
    // It used to keep its own copy, BLOCK_TEXT_KEYS. It now reads the
    // one declaration — so this checks both halves: that the guard loops
    // over TEXT_PROPS, and that TEXT_PROPS covers faq_item's two props.
    const guard = code("src/lib/claims/guardBlocks.ts");
    expect(guard).toMatch(/import \{ TEXT_PROPS \} from "@\/lib\/pages\/provenance"/);
    expect(guard).toMatch(/for \(const key of TEXT_PROPS\)/);
    expect(guard).not.toMatch(/BLOCK_TEXT_KEYS/);
    for (const key of ["heading", "html"]) expect(TEXT_PROPS as readonly string[]).toContain(key);
  });

  it("and the owner's own FAQ edit is marked as the owner's", () => {
    // The client component that writes the marks. Without this the
    // guard would treat a sentence the OWNER typed into an answer as the
    // machine's and rewrite it.
    //
    // Its own copy was a Set that SHADOWED the name TEXT_PROPS — the
    // worst of the six, because a reader would have believed it was the
    // shared one. It asks isTextProp now.
    const panel = code("src/components/website-builder/blocks/PropertiesPanel.tsx");
    expect(panel).toMatch(/isTextProp \} from "@\/lib\/pages\/provenance"|withOwnerProp, isTextProp \} from "@\/lib\/pages\/provenance"/);
    expect(panel).toMatch(/onChange\(isTextProp\(key\) \?/);
    expect(panel).not.toMatch(/new Set\(\["text"/);
    for (const key of ["heading", "html"]) expect(TEXT_PROPS as readonly string[]).toContain(key);
  });

  it("THE LABELS SAY QUESTION AND ANSWER, because that is what the owner sees", () => {
    const fields = BLOCK_REGISTRY.faq_item.propFields ?? [];
    expect(fields.find((f) => f.key === "heading")?.label).toBe("Question");
    expect(fields.find((f) => f.key === "html")?.label).toBe("Answer");
  });

  it("and the registry records WHY the names are what they are", () => {
    // The names look like a mistake. The comment is the only thing that
    // stops a later tidy-up renaming them and silently un-guarding the
    // answers, so it is asserted rather than trusted.
    const registry = readFileSync("src/lib/blocks/registry.ts", "utf8");
    expect(registry).toMatch(/UNGUARDED/);
    expect(registry).toMatch(/guardBlocks\.ts/);
  });
});

// ---------------------------------------------------------------------
describe("3. FAQPage SAYS ONLY WHAT THE PAGE SAYS", () => {
  it("A PAGE WITH NO QUESTIONS PUBLISHES NO FAQPage", () => {
    expect(faqPageNode([])).toBeNull();
    expect(faqPageNode(null as any)).toBeNull();
  });

  it("A QUESTION WITH NO ANSWER IS NOT PUBLISHED", () => {
    // A Question node with an empty acceptedAnswer is machine-readable
    // nonsense that something will quote.
    expect(faqPageNode([{ question: "Do you deliver?", answer: "   " }])).toBeNull();
    expect(faqPageNode([{ question: "  ", answer: "Yes." }])).toBeNull();
  });

  it("the shape is Question + acceptedAnswer, as schema.org defines it", () => {
    const node = faqPageNode([{ question: "Do you deliver?", answer: "Yes, anywhere in India." }])!;
    expect(node["@type"]).toBe("FAQPage");
    expect(node.mainEntity).toEqual([
      { "@type": "Question", name: "Do you deliver?", acceptedAnswer: { "@type": "Answer", text: "Yes, anywhere in India." } },
    ]);
  });

  it("MARKDOWN AND TAGS COME OUT, because a machine reads the asterisks as the answer", () => {
    const node = faqPageNode([{ question: "Is it **safe**?", answer: "<p>Yes — see our [policy](/terms).</p>" }])!;
    const q = (node.mainEntity as any[])[0];
    expect(q.name).toBe("Is it safe?");
    expect(q.acceptedAnswer.text).toBe("Yes — see our policy.");
    expect(q.acceptedAnswer.text).not.toContain("<p>");
  });

  it("IT JOINS THE PAGE'S OWN GRAPH, next to the business, not instead of it", () => {
    const graph = storefrontJsonLd(identity, [], [{ question: "Open Sunday?", answer: "Yes." }])!;
    const types = (graph["@graph"] as any[]).map((n) => n["@type"]);
    expect(types).toContain("LocalBusiness");
    expect(types).toContain("FAQPage");
  });

  it("and a page with no pairs still publishes the business", () => {
    const graph = storefrontJsonLd(identity, [], [])!;
    const types = (graph["@graph"] as any[]).map((n) => n["@type"]);
    expect(types).toEqual(["LocalBusiness"]);
  });

  it("the escaping still holds, so an answer cannot close the script tag", () => {
    const graph = storefrontJsonLd(identity, [], [{ question: "Why?", answer: "Because </script><script>alert(1)</script>" }]);
    expect(jsonLdText(graph)).not.toContain("</script>");
  });
});

// ---------------------------------------------------------------------
describe("4. THE JSON-LD IS ON EVERY PAGE KIND, not just the home page", () => {
  const INNER = "src/app/site/[slug]/[page]/page.tsx";
  const PRODUCT = "src/app/site/[slug]/products/[productId]/page.tsx";
  const HOME = "src/app/site/[slug]/page.tsx";

  it("THE INNER PAGE RENDERS STRUCTURED DATA", () => {
    const src = code(INNER);
    expect(src).toMatch(/<StructuredData node=\{jsonLd\} \/>/);
    expect(src).toMatch(/const jsonLd = identity \? storefrontJsonLd\(/);
  });

  it("AND IT PASSES ITS OWN PAGE'S QUESTIONS", () => {
    expect(code(INNER)).toMatch(/faqPairsFromBlocks\(blocks\)/);
  });

  it("THE PRODUCT PAGE RENDERS STRUCTURED DATA", () => {
    const src = code(PRODUCT);
    expect(src).toMatch(/<StructuredData node=\{jsonLd\} \/>/);
    expect(src).toMatch(/const jsonLd = loaded \? productPageJsonLd\(loaded\.identity, storefrontProduct\) : null;/);
  });

  it("and the home page passes its questions too", () => {
    expect(code(HOME)).toMatch(/storefrontJsonLd\(identity, products, faqPairsFromBlocks\(blocks\)\)/);
  });

  it("AN ITEMLIST IS NOT CLAIMED ON A PAGE THAT SHOWS NO PRODUCTS", () => {
    // An About page carrying a catalogue it does not display is
    // structured data describing content a visitor cannot find.
    expect(code(INNER)).toMatch(/needsProducts \? products : \[\]/);
  });

  it("THE PRODUCT PAGE DESCRIBES THE PRODUCT, with the same node the home page uses", () => {
    const graph = productPageJsonLd(identity, {
      id: "p1",
      name: "200g soy jar",
      description: "Hand-poured.",
      price: 650,
      compare_at_price: null,
      images: [],
      inventory_count: 4,
      kind: "product",
      duration_minutes: null,
      book_href: null,
    } as any)!;
    const nodes = graph["@graph"] as any[];
    expect(nodes[0]["@type"]).toBe("Product");
    expect(nodes[0].url).toBe("https://hawlai.online/site/candle-by-qaaf/products/p1");
    expect(nodes[1]["@type"]).toBe("LocalBusiness");
  });

  it("and a product with no name publishes nothing rather than an empty shell", () => {
    expect(productPageJsonLd(identity, null)).toBeNull();
    expect(productPageJsonLd(identity, { id: "p", name: "" } as any)).toBeNull();
    expect(productPageJsonLd({ ...identity, businessName: " " }, { id: "p", name: "Jar" } as any)).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("5. THE BUSINESS IS DESCRIBED THE SAME WAY ON EVERY PAGE", () => {
  it("THE IDENTITY'S URL IS THE STOREFRONT ROOT, on every page", async () => {
    // Setting it to the page being rendered would point LocalBusiness.url
    // at the About page and turn an inner page's product URLs into
    // /site/slug/about/products/x — a machine-readable 404.
    const { loadSiteIdentity } = await import("@/lib/seo/siteIdentity");
    const rows: Record<string, any> = {
      dealerships: { dealership_name: "Candle by Qaaf", business_category: "candles", city: "Shahjahanpur", booking_slug: "qaaf" },
      brand_profiles: { business_description: "Hand-poured soy candles." },
      brand_kits: { logo_url: null },
    };
    const supabase = {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null }) }) }),
      }),
    };
    const loaded = (await loadSiteIdentity(supabase, { dealershipId: "d1", slug: "candle-by-qaaf" }))!;
    expect(loaded.identity.siteUrl).toMatch(/\/site\/candle-by-qaaf$/);
    expect(loaded.identity.businessName).toBe("Candle by Qaaf");
    // Handed back so the product page does not read the same row twice.
    expect(loaded.bookingSlug).toBe("qaaf");
  });

  it("A BUSINESS WITH NO NAME PUBLISHES NOTHING, not \"the business\"", async () => {
    // FOUND BY THIS TEST. businessDisplayName falls back to "the
    // business" for a missing name AND for the signup placeholder, and
    // the home page called it with that default — so a business that
    // had not yet typed its name was publishing
    // LocalBusiness { name: "the business" } to every machine reading
    // its storefront. The reader asks for an empty fallback instead.
    const { loadSiteIdentity } = await import("@/lib/seo/siteIdentity");
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    };
    expect(await loadSiteIdentity(supabase, { dealershipId: "d1", slug: "s" })).toBeNull();
    expect(await loadSiteIdentity(supabase, { dealershipId: "", slug: "s" })).toBeNull();

    // AND THE SIGNUP PLACEHOLDER IS NOT A NAME EITHER — the half a
    // null check alone would miss, because the row is present and the
    // column is not empty.
    const { PLACEHOLDER_BUSINESS_NAME } = await import("@/lib/onboarding/signup");
    const placeholder = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === "dealerships" ? { dealership_name: PLACEHOLDER_BUSINESS_NAME } : null }),
          }),
        }),
      }),
    };
    expect(await loadSiteIdentity(placeholder, { dealershipId: "d1", slug: "s" })).toBeNull();
  });

  it("and the product page reads the dealership row through that one reader", () => {
    // It used to read booking_slug inline, in the middle of an
    // expression, for services only.
    const src = code("src/app/site/[slug]/products/[productId]/page.tsx");
    expect(src).toMatch(/loadSiteIdentity\(supabase, \{ dealershipId: website\.dealership_id, slug \}\)/);
    expect(src).not.toMatch(/await supabase\.from\("dealerships"\)/);
  });
});

// ---------------------------------------------------------------------
describe("6. THE AUDIT DOES NOT ASK FOR AN FAQ THE PAGE ALREADY HAS", () => {
  const withFaq = {
    slug: "home",
    page_type: "home",
    title: "Home",
    meta_description: "x".repeat(60),
    sections: legacyToBlocks([LEGACY_FAQ]),
  };
  const withoutFaq = { ...withFaq, sections: legacyToBlocks([{ type: "text", heading: "About us", body: "We make candles." }]) };

  it("AN FAQ BLOCK COUNTS AS AN FAQ", () => {
    const audit = auditSite({ published: true, pages: [withFaq] });
    expect(audit.findings.map((f) => f.code)).not.toContain("no_faq");
  });

  it("AND A PAGE WITH NO QUESTIONS STILL GETS THE FINDING", () => {
    const audit = auditSite({ published: true, pages: [withoutFaq] });
    expect(audit.findings.map((f) => f.code)).toContain("no_faq");
  });

  it("a pair with no answer is not an FAQ either", () => {
    const half = { ...withFaq, sections: legacyToBlocks([{ type: "faq", heading: "Q", items: [{ question: "Open?", answer: "" }] }]) };
    expect(auditSite({ published: true, pages: [half] }).findings.map((f) => f.code)).toContain("no_faq");
  });
});

// ---------------------------------------------------------------------
describe("7. A VISITOR READS BOTH HALVES", () => {
  it("THE QUESTION AND THE ANSWER ARE BOTH IN THE MARKUP", () => {
    // The schema may only describe content that is on the page. These
    // render the REAL renderer rather than asserting on the stored
    // value, because the stored value is not what a crawler reads.
    const html = render(legacyToBlocks([LEGACY_FAQ]));
    expect(html).toContain("How long does one candle burn?");
    expect(html).toContain("About 40 hours for the 200g jar.");
    expect(html).toContain("Questions we get asked");
  });

  it("THE ANSWER IS NOT HIDDEN BEHIND A CLICK", () => {
    // No accordion, deliberately: the storefront has no other
    // interactive disclosure, and a <details> adds a way for the answer
    // to be the thing nobody sees.
    const html = render(legacyToBlocks([LEGACY_FAQ]));
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });

  it("THE QUESTION IS A HEADING, and the pair is valid markup on its own", () => {
    const html = render(legacyToBlocks([LEGACY_FAQ]));
    expect(html).toMatch(/<h3[^>]*>How long does one candle burn\?<\/h3>/);
    // <dt>/<dd> are only valid inside a <dl>, and a pair can sit
    // anywhere the owner drags it.
    expect(html).not.toContain("<dt");
    expect(html).not.toContain("<dd");
  });

  it("AND NO TAG REACHES THE PAGE AS TEXT", () => {
    // The 2026-09-21 incident: the prop is named `html` and nothing has
    // ever rendered it as HTML.
    const blocks = legacyToBlocks([{ type: "faq", heading: "Q", items: [{ question: "<b>Safe?</b>", answer: "<p>Yes.</p>" }] }]);
    const html = render(blocks);
    // Not as visible characters...
    expect(html).not.toContain("&lt;p&gt;");
    expect(html).not.toContain("&lt;b&gt;");
    // ...AND NOT AS REAL MARKUP. Asserting only the escaped form passes
    // happily if the answer is injected with dangerouslySetInnerHTML,
    // which is the other half of the same mistake and the worse one:
    // the stored string would then be live HTML on a public page.
    expect(html).not.toContain("<p>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Safe?");
    expect(html).toContain("Yes.");
  });

  it("A BLOCK THE OWNER DROPPED INTO THE FAQ STILL RENDERS, pair or not", () => {
    // FOUND BY A MUTATION. `allowedChildren` is advisory (lib/blocks/
    // types.ts), so the owner can drag anything in here — and a page
    // that silently drops a block they placed does not match the editor
    // they placed it in. Every fixture above held only pairs, so
    // filtering the children to pairs changed nothing that was measured.
    const html = render([
      { id: "s", type: "section", props: {}, children: [
        { id: "f", type: "faq", props: { heading: "Common questions" }, children: [
          { id: "t", type: "text", props: { html: "Ask us anything below." } },
          { id: "q", type: "faq_item", props: { heading: "Open on Sunday?", html: "Yes." } },
        ] },
      ] },
    ] as any);
    expect(html).toContain("Ask us anything below.");
    expect(html).toContain("Open on Sunday?");
  });

  it("a pair with no question renders nothing rather than an empty heading", () => {
    const html = render([{ id: "x", type: "faq_item", props: { heading: "  ", html: "Yes." } } as any]);
    expect(html).toBe("");
  });
});

// ---------------------------------------------------------------------
describe("8. THE PLAN SAYS WHAT THIS DOES AND DOES NOT BUY", () => {
  it("IT DOES NOT PROMISE A RICH RESULT GOOGLE HAS TAKEN AWAY", () => {
    const plan = readFileSync("docs/PLAN-AEO-GEO.md", "utf8");
    expect(plan).toMatch(/rich-result eligibility in Google\s*\n?has narrowed since 2023/);
    expect(plan).toMatch(/The reason to do it is \*\*extractability\*\*/);
  });

  it("and the schema file says the same thing where someone will read it", () => {
    const src = readFileSync("src/lib/seo/structuredData.ts", "utf8");
    expect(src).toMatch(/narrowed FAQPage's rich-result eligibility in 2023/);
  });
});
