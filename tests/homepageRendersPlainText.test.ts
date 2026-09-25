// No tags on the page a customer reads (2026-09-21).
//
// THE LIVE BUG: the owner approved an AI subheadline through the chat's
// Approve & Publish card, and hawlai.online/site/candle-by-qaaf then
// showed, to every visitor:
//
//   <p>No paraffin. No synthetic shortcuts. Just clean-burning candles…</p>
//
// The block's prop is NAMED `html`, so the copy-edit path wrapped the new
// sentence in <p>…</p>. Nothing has ever rendered it as HTML: the text
// block goes through lib/richText, a markdown subset (**bold**,
// *italic*, [link](url)) where everything else is escaped — which is
// precisely what a visitor then reads. The headline was fine because it
// is stored on a different prop that nothing wrapped.
//
// These tests render the REAL blocks through the REAL renderer and look
// at the markup, rather than asserting on the stored value, because the
// stored value is not what was wrong for the owner — the page was.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import BlockRenderer from "@/components/website-builder/blocks/BlockRenderer";
import { applyHomepageCopy } from "@/lib/chat/homepageCopy";
import { getTheme } from "@/lib/landingThemes";
import { stripTags } from "@/lib/richText";

const SUB = "No paraffin. No synthetic shortcuts. Just clean-burning candles crafted by hand, one pour at a time — with fragrances chosen because they actually work.";
const HEAD = "Hand-poured soy wax candles, made in Shahjahanpur.";

/** The hero of a real block-builder page. */
const hero = () => [
  {
    id: "s1",
    type: "section",
    props: { background: "dark" },
    children: [
      {
        id: "st1",
        type: "stack",
        props: { direction: "column", align: "center" },
        children: [
          { id: "h1", type: "heading", props: { text: "Candles by Qaaf", level: 1, align: "center" }, children: [] },
          { id: "t1", type: "text", props: { html: "Small-batch soy candles.", align: "center" }, children: [] },
          { id: "b1", type: "button", props: { label: "Shop now", href: "/shop", style: "solid" }, children: [] },
        ],
      },
    ],
  },
];

function render(sections: any[]): string {
  const ctx = { theme: getTheme(undefined as any), slug: "candle-by-qaaf" };
  return sections.map((block, i) => renderToStaticMarkup(createElement(BlockRenderer, { key: i, block, ctx }))).join("");
}

/** What a visitor sees: the markup with the page's own tags taken off. */
function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("an approved homepage edit renders as words, not tags", () => {
  it("THE LIVE CASE: the subheadline has no tag characters anywhere in the page", () => {
    const { sections, changed } = applyHomepageCopy(hero(), { headline: HEAD, subheadline: SUB, ctaText: "Book a workshop" });
    expect(changed.map((c) => c.field)).toEqual(["headline", "subheadline", "ctaText"]);

    const markup = render(sections);
    const seen = visibleText(markup);

    expect(seen).toContain(SUB);
    // The exact thing the owner reported, in the exact form a browser
    // shows it: React escapes a stored "<p>" into "&lt;p&gt;".
    expect(markup).not.toContain("&lt;");
    expect(markup).not.toContain("&gt;");
    expect(seen).not.toContain("<p>");
    expect(seen).not.toContain("</p>");
  });

  it("every text field on the page, not just the one that broke", () => {
    // Each field gets a tag put into it deliberately; none may reach the
    // page as characters.
    const { sections } = applyHomepageCopy(hero(), {
      headline: "<h1>Hand-poured candles</h1>",
      subheadline: "<p>Clean-burning, <strong>always</strong>.</p>",
      ctaText: "<span>Book now</span>",
    });
    const markup = render(sections);
    expect(markup).not.toContain("&lt;");
    const seen = visibleText(markup);
    expect(seen).toContain("Hand-poured candles");
    expect(seen).toContain("Clean-burning, always.");
    expect(seen).toContain("Book now");
  });

  it("the page already published with the broken value comes good on its own", () => {
    // The owner's live row still holds "<p>…</p>". Nobody should have to
    // regenerate the copy to stop showing tags to customers.
    const stored = hero();
    (stored[0].children[0].children[1] as any).props.html = `<p>${SUB}</p>`;
    const markup = render(stored);
    expect(markup).not.toContain("&lt;");
    expect(visibleText(markup)).toContain(SUB);
  });

  it("the markdown the field really holds still works", () => {
    const stored = hero();
    (stored[0].children[0].children[1] as any).props.html = "Hand-poured **soy wax**, *always*. [See the range](/shop)";
    const markup = render(stored);
    expect(markup).toContain("<strong>soy wax</strong>");
    expect(markup).toContain("<em>always</em>");
    expect(markup).toContain('href="/shop"');
    expect(markup).not.toContain("&lt;");
  });

  it("the stored value is plain text now, so nothing downstream has to undo it", () => {
    // The card's diff, the facts read for copy, and the builder's own
    // editor all read this value directly.
    const { sections } = applyHomepageCopy(hero(), { subheadline: SUB });
    const block = (sections as any)[0].children[0].children[1];
    expect(block.props.html).toBe(SUB);
    expect(block.props.html).not.toContain("<p>");
  });
});

describe("what counts as a tag", () => {
  it("tags go, and the words either side don't run together", () => {
    expect(stripTags("<p>One.</p><p>Two.</p>")).toBe("One. Two.");
    expect(stripTags("Line one<br>Line two")).toBe("Line one Line two");
    expect(stripTags('<a href="/x" class="y">Shop</a>')).toBe("Shop");
  });

  it("a less-than sign someone actually typed is left alone", () => {
    expect(stripTags("Burns at < 200°C")).toBe("Burns at < 200°C");
    expect(stripTags("Made with <3 in Shahjahanpur")).toBe("Made with <3 in Shahjahanpur");
    expect(stripTags("2 < 3 and 5 > 4")).toBe("2 < 3 and 5 > 4");
  });

  it("text with no tags in it is returned untouched, character for character", () => {
    expect(stripTags(SUB)).toBe(SUB);
    expect(stripTags("  spacing  kept  ")).toBe("  spacing  kept  ");
  });
});
