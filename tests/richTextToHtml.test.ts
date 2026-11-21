// Markdown in, HTML out — for the one surface that really renders it.
//
// WHY THIS EXISTS AT ALL. `renderRichText` beside it returns React
// nodes for this product's own site, where a tag is escaped and a
// `<p>` is printed to the visitor literally — the live bug of
// 2026-09-21, when the homepage read "<p>No paraffin. No synthetic
// shortcuts…</p>" to every visitor.
//
// A Shopify page body is the opposite: it IS markup. So markdown sent
// straight through shows asterisks on a real storefront, and the tool
// schema's promise to the model — "**bold**, *italic*, [text](url),
// never HTML tags" — needs a second output rather than a second
// definition. Both go through the same PATTERN, so there is one answer
// to "what is the model allowed to write".
//
// AND THIS TEXT COMES FROM A MODEL, then goes to a merchant's live
// page. Everything below about escaping is that, not neatness.

import { describe, it, expect } from "vitest";
import { richTextToHtml } from "@/lib/richText";

describe("1. the markdown subset the schema promises", () => {
  it("bold, italic and links, and nothing else", () => {
    const html = richTextToHtml("We are **small** and *honest*. [Reach us](https://wa.me/91)");
    expect(html).toContain("<strong>small</strong>");
    expect(html).toContain("<em>honest</em>");
    expect(html).toContain('<a href="https://wa.me/91"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("A BLANK LINE IS A PARAGRAPH, because otherwise the page is one run-on block", () => {
    // What a merchant would actually see on their storefront if this
    // joined everything together.
    expect(richTextToHtml("First line.\n\nSecond line.")).toBe("<p>First line.</p>\n<p>Second line.</p>");
  });

  it("and a single newline is a line break, not a new paragraph", () => {
    expect(richTextToHtml("Line one\nLine two")).toBe("<p>Line one<br>Line two</p>");
  });

  it("nothing in, nothing out — never an empty <p>", () => {
    for (const empty of ["", "   ", "\n\n", null, undefined]) {
      expect(richTextToHtml(empty as any), JSON.stringify(empty)).toBe("");
    }
  });
});

describe("2. NOTHING THE MODEL TYPED BECOMES MARKUP", () => {
  it("THE LOAD-BEARING ONE: a tag is stripped, not passed through", () => {
    // The order is strip, then escape, then insert: the only markup in
    // the output is the markup this function wrote. A model that
    // decided to be helpful with HTML cannot reach a merchant's page.
    const html = richTextToHtml("Hello <script>alert(1)</script> world");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script");
    // The words survive as words.
    expect(html).toContain("alert(1)");
  });

  it("a stray less-than is escaped, not eaten", () => {
    // "a < b" is something a person writes. It must read back the same
    // on the page, and it must not open a tag.
    const html = richTextToHtml("a < b and 3 > 2");
    expect(html).toBe("<p>a &lt; b and 3 &gt; 2</p>");
  });

  it("an ampersand is escaped, so entities cannot be smuggled", () => {
    expect(richTextToHtml("Tea &amp; cake")).toContain("&amp;amp;");
  });

  it("A javascript: URL IS NOT A LINK", () => {
    // PATTERN restricts hrefs to http(s), mailto and relative paths.
    // Anything else stays literal text — visible and harmless rather
    // than clickable.
    const html = richTextToHtml("[click](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("javascript:alert(1)\"");
    expect(html).toContain("[click]");
  });

  it("and a data: URL is not a link either", () => {
    const html = richTextToHtml("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(html).not.toContain("<a ");
  });

  it("link text itself is escaped", () => {
    // The visible half of a link is still model output.
    const html = richTextToHtml("[a > b](https://example.com/x)");
    expect(html).toContain("a &gt; b");
    expect(html).toContain('href="https://example.com/x"');
  });

  it("THE OUTPUT CONTAINS ONLY THE TAGS THIS FUNCTION WRITES", () => {
    // The whole class, rather than one case at a time: whatever goes
    // in, every tag that comes out is from the short list below.
    const nasty = [
      "<img src=x onerror=alert(1)>",
      "<iframe src='//evil'></iframe>",
      "<div onclick=\"steal()\">hi</div>",
      "plain **bold** [l](https://a.b) <b>no</b>",
      "<svg/onload=alert(1)>",
      "</p><script>x</script><p>",
    ];
    const ALLOWED = /^(p|br|strong|em|a)$/;
    for (const input of nasty) {
      const html = richTextToHtml(input);
      for (const m of html.matchAll(/<\/?([a-z][a-z0-9-]*)/gi)) {
        expect(ALLOWED.test(m[1].toLowerCase()), `${input} produced <${m[1]}>`).toBe(true);
      }
      // And no event handler survived as an attribute anywhere.
      expect(html, input).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });
});
