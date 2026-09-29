// Three SEO bugs found on a live site, and the claims check SEO never had.
//
// 1. The health check graded website_pages.title — the NAVIGATION label,
//    "Home" on every generated site — and told an owner with a good
//    search title that their title was 4 characters long.
// 2. A generated description ran to 164 characters, past what Google
//    shows, and the check failed the page for it. The schema had asked
//    for "under 160" all along.
// 3. The SEO page linked the site as /p/{slug}, the legacy landing-page
//    route. /p/candle-by-qaaf returns 404.
//
// And the claims check: SEO was the one copy surface that never ran it,
// so "No paraffin, no fake fragrance" could be proposed for a business
// whose Business Story says nothing of the kind.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { auditWebsite } from "../src/lib/agents/seoAgent";
import { resolvePageTitle } from "../src/lib/seo/pageTitle";
import { fitMetaDescription, META_DESCRIPTION_LIMIT } from "../src/lib/seo/metaLength";

/** The live homepage on 2026-09-29, as the database held it. */
const LIVE_HOME = {
  slug: "home",
  title: "Home",
  seo_title: null as string | null,
  meta_description:
    "Candle by Qaaf — handcrafted soy wax scented candles from Uttar Pradesh. Turn everyday moments into a ritual with warm, lingering home fragrance & Diwali gift sets.",
  sections: [{ heading: "A", body: "x".repeat(200), imageUrl: "https://example.test/a.png" }, { heading: "B", body: "y".repeat(80) }],
};

const SITE = { published: true, slug: "candle-by-qaaf" };

function check(audit: ReturnType<typeof auditWebsite>, label: string) {
  return audit.pages[0].checks.find((c) => c.label === label)!;
}

describe("the health check grades the title the page actually serves", () => {
  it("passes a good search title even though the menu link says Home", () => {
    const audit = auditWebsite(SITE, [{ ...LIVE_HOME, seo_title: "Handmade Soy Candles in Shahjahanpur | Candle by Qaaf" }], "candle_by_qaaf");
    const title = check(audit, "Title length");
    expect(title.passed).toBe(true);
    expect(title.detail).toContain("53 characters");
  });

  it("no longer reports a 4-character title for every homepage in the product", () => {
    const audit = auditWebsite(SITE, [LIVE_HOME], "candle_by_qaaf");
    // With no seo_title the page serves the business name — formatted,
    // so this reads "Candle by Qaaf" and never the signup handle.
    expect(check(audit, "Title length").detail).toContain("Candle by Qaaf");
    expect(check(audit, "Title length").detail).not.toContain("candle_by_qaaf");
    expect(resolvePageTitle("home", LIVE_HOME, "candle_by_qaaf")).toBe("Candle by Qaaf");
  });

  it("grades an inner page as '<page> | <business>', which is what it serves", () => {
    const audit = auditWebsite(SITE, [{ ...LIVE_HOME, slug: "about", title: "About", meta_description: "x".repeat(100) }], "candle_by_qaaf");
    expect(check(audit, "Title length").passed).toBe(true);
    expect(resolvePageTitle("about", { title: "About" }, "candle_by_qaaf")).toBe("About | Candle by Qaaf");
  });
});

describe("the meta-description rule stays at 160", () => {
  it("still fails the live 164-character description — the limit is not raised", () => {
    expect(LIVE_HOME.meta_description.length).toBe(164);
    const description = check(auditWebsite(SITE, [LIVE_HOME], "candle_by_qaaf"), "Meta description");
    expect(description.passed).toBe(false);
    expect(description.detail).toContain("164 characters");
  });

  it("passes at exactly the limit and fails one character past it", () => {
    const at = auditWebsite(SITE, [{ ...LIVE_HOME, meta_description: "a".repeat(160) }], "x");
    const over = auditWebsite(SITE, [{ ...LIVE_HOME, meta_description: "a".repeat(161) }], "x");
    expect(check(at, "Meta description").passed).toBe(true);
    expect(check(over, "Meta description").passed).toBe(false);
  });
});

describe("what the builder writes now fits", () => {
  it("leaves a description that already fits completely alone", () => {
    const fits = "Hand-poured soy candles from Shahjahanpur, in small batches.";
    expect(fitMetaDescription(fits)).toBe(fits);
  });

  it("keeps almost all of the real 164-character description", () => {
    const fitted = fitMetaDescription(LIVE_HOME.meta_description);
    expect(fitted.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
    // Its first sentence ends at 71 characters, and cutting there would
    // throw away more than half of a description that is only four
    // characters too long. So this one takes the word-boundary branch
    // and keeps the rest — an ellipsis is ordinary in a search result.
    expect(fitted.startsWith("Candle by Qaaf — handcrafted soy wax scented candles from Uttar Pradesh. Turn everyday")).toBe(true);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.length).toBeGreaterThan(140);
  });

  it("ends on the full stop when the first sentence is substantial on its own", () => {
    const text = `${"A sentence with real content in it that runs on".padEnd(100, " x")}. And a second one that pushes it past the limit entirely, well beyond what Google will show.`;
    const fitted = fitMetaDescription(text);
    expect(fitted.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
    expect(fitted.endsWith(".")).toBe(true);
    expect(fitted).not.toContain("And a second one");
  });

  it("is applied by the builder, not merely available to it", () => {
    // Without this the helper can be perfect and unused: removing the
    // call from websiteBuilderAgent broke no test until this one. The
    // generator runs unattended over every page of a new site, so the
    // wiring is the part that matters.
    const builder = readFileSync("src/lib/agents/websiteBuilderAgent.ts", "utf8");
    expect(builder).toContain('import { fitMetaDescription } from "@/lib/seo/metaLength"');
    expect(builder).toMatch(/metaDescription:[^\n]*fitMetaDescription\(input\.metaDescription\)/);
    expect(builder).not.toMatch(/metaDescription:[^\n]*\?\s*input\.metaDescription\.trim\(\)/);
  });

  it("cuts on a word, never mid-word, when there is no sentence to end on", () => {
    const long = `${"word ".repeat(40)}finalword`;
    const fitted = fitMetaDescription(long);
    expect(fitted.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted).not.toMatch(/wor…$/);
  });
});

describe("the site link points at the site", () => {
  it("uses /site/, not the legacy /p/ route that 404s", () => {
    expect(auditWebsite(SITE, [LIVE_HOME], "x").siteUrl).toBe("/site/candle-by-qaaf");
    // Including the no-pages-yet branch, which had the same link.
    expect(auditWebsite(SITE, [], "x").siteUrl).toBe("/site/candle-by-qaaf");
  });

  it("leaves the legacy landing-page audit alone — /p/ is correct there", () => {
    const seoAgent = require("fs").readFileSync("src/lib/agents/seoAgent.ts", "utf8");
    // auditLandingPage really does read a landing_pages row.
    expect(seoAgent).toContain('page.slug ? `/p/${page.slug}` : "No URL set yet."');
    expect(seoAgent).not.toContain("`/p/${website.slug}`");
  });
});

describe("content depth counts words, not block ids", () => {
  // A real block-built page: the copy lives in props, and the only
  // strings at the top level of a block are its id and its type.
  const blocks = [
    { id: "b1", type: "section", props: { background: "none", paddingY: "md" }, children: [
      { id: "b2", type: "heading", props: { text: "No paraffin. No synthetic shortcuts.", level: 1, align: "center" } },
      { id: "b3", type: "text", props: { html: "<p>Hand-poured soy wax candles, made in Shahjahanpur, in small batches, with fragrance chosen because it actually works in a real room rather than on a label.</p>", align: "left" } },
      { id: "b4", type: "image", props: { url: "https://cdn.test/hero.jpg", alt: "Candles" } },
      { id: "b5", type: "button", props: { label: "Shop the Collection", href: "/shop" } },
    ] },
    { id: "b6", type: "section", props: {}, children: [
      { id: "b7", type: "heading", props: { text: "Poured by hand, cured properly" } },
      { id: "b8", type: "text", props: { html: "<p>Every candle is poured by hand and left to cure before it ever reaches a box. That wait is why the scent carries across a room instead of fading at the wick.</p>" } },
    ] },
  ];

  it("measures the copy, not the identifiers", () => {
    const audit = auditWebsite(SITE, [{ slug: "home", title: "Home", seo_title: "x".repeat(20), meta_description: "y".repeat(100), sections: blocks }], "x");
    const depth = check(audit, "Content depth");
    expect(depth.passed).toBe(true);
    // Machine ids ("b1", "section") are not content. Counting those is
    // what reported "~172 characters" for a homepage; counting the words
    // gives 401 for this one.
    expect(depth.detail).toContain("~401 characters");
  });

  it("finds the picture a block keeps in props.url", () => {
    const audit = auditWebsite(SITE, [{ slug: "home", title: "Home", seo_title: "x".repeat(20), meta_description: "y".repeat(100), sections: blocks }], "x");
    expect(check(audit, "Has a visual").passed).toBe(true);
  });

  it("still fails a genuinely thin page, and says what it is aiming for", () => {
    const thin = [{ id: "a", type: "section", props: {}, children: [{ id: "b", type: "heading", props: { text: "Contact" } }] }];
    const depth = check(auditWebsite(SITE, [{ slug: "about", title: "About", seo_title: "x".repeat(20), meta_description: "y".repeat(100), sections: thin }], "x"), "Content depth");
    expect(depth.passed).toBe(false);
    expect(depth.detail).toContain("aim for 300+");
  });

  it("asks less of a contact page, which is a form and not an essay", () => {
    // A real contact page: a heading, an address, hours, and a form.
    // Around 200 characters of words, and nothing wrong with that.
    const contact = [
      { id: "a", type: "section", props: {}, children: [{ id: "b", type: "heading", props: { text: "Get in touch with Candle by Qaaf" } }] },
      { id: "c", type: "section", props: {}, children: [
        { id: "d", type: "text", props: { html: "<p>We reply to every message within a day. Shahjahanpur, Uttar Pradesh. Open Monday to Saturday, 10am to 7pm.</p>" } },
        { id: "e", type: "form", props: { heading: "Send us a message" } },
        { id: "f", type: "button", props: { label: "Send", href: "#" } },
      ] },
    ];
    const audit = auditWebsite(SITE, [{ slug: "contact", page_type: "contact", title: "Contact", seo_title: "x".repeat(20), meta_description: "y".repeat(100), sections: contact }], "x");
    expect(check(audit, "Content depth").passed).toBe(true);
  });
});

describe("a privacy policy is not marked down for having no photograph", () => {
  const legalPage = (slug: string) => ({ slug, title: "Legal", seo_title: "x".repeat(20), meta_description: "y".repeat(100), sections: [
    { id: "a", type: "section", props: {}, children: [{ id: "b", type: "text", props: { html: `<p>${"Legal wording. ".repeat(40)}</p>` } }] },
    { id: "c", type: "section", props: {}, children: [{ id: "d", type: "text", props: { html: "<p>More legal wording that goes on for a while.</p>" } }] },
  ] });

  it("drops the visual check entirely on legal pages", () => {
    const audit = auditWebsite(SITE, [legalPage("privacy-policy")], "x");
    expect(audit.pages[0].checks.map((c) => c.label)).not.toContain("Has a visual");
    // And so a complete legal page scores full marks instead of 60.
    expect(audit.pages[0].score).toBe(100);
  });

  it("keeps the visual check on an ordinary page", () => {
    const audit = auditWebsite(SITE, [legalPage("about")], "x");
    expect(audit.pages[0].checks.map((c) => c.label)).toContain("Has a visual");
    expect(audit.pages[0].score).toBeLessThan(100);
  });
});
