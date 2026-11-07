// Duplicate body text and pages nobody has touched (G1 of
// docs/AUDIT-GROWTH-LOOP.md).
//
// WHAT THE AUDIT ALREADY HAD, and the correction behind this file: I
// told the founder on 6 November that technicalAudit.ts "does not check
// speed, duplicate or thin content". Two of three were wrong —
// `thin_content`, `duplicate_title` and `duplicate_description` have
// been findings there all along. What was genuinely missing is duplicate
// BODY text and any sense of a page's age, which is what this adds.
//
// THE RULE BOTH FINDINGS ARE SHAPED BY: a finding that fires against
// work the owner has already done teaches them to ignore findings. That
// is the reasoning that fixed `no_faq` in A2, and it decides both of
// this file's exemptions and both of its thresholds.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

import { auditSite, daysSinceChange, longPassages } from "@/lib/seo/technicalAudit";

const PARAGRAPH =
  "We make everything to order in small batches and let each one rest overnight before it is packed, which is why a parcel takes two or three days to leave us rather than going out the same afternoon.";
const OTHER =
  "Our workshop is open through the week and someone is always there to answer a question about an order, a delivery date or anything that has gone wrong with one.";

const page = (slug: string, text: string, over: Record<string, any> = {}) => ({
  slug,
  page_type: slug,
  title: slug,
  meta_description: "x".repeat(60),
  sections: [{ id: slug, type: "section", props: {}, children: [{ id: `${slug}-t`, type: "text", props: { html: text } }] }],
  ...over,
});

const codesFor = (pages: any[]) => auditSite({ published: true, pages }).findings.map((f) => f.code);
const findingFor = (pages: any[], code: string) => auditSite({ published: true, pages }).findings.find((f) => f.code === code);

// ---------------------------------------------------------------------
describe("1. THE SAME PARAGRAPH ON TWO PAGES IS A FINDING", () => {
  it("TWO PAGES SHARING A PARAGRAPH ARE BOTH NAMED", () => {
    const f = findingFor([page("about", PARAGRAPH), page("delivery", PARAGRAPH)], "duplicate_body")!;
    expect(f.where.sort()).toEqual(["about", "delivery"]);
  });

  it("AND A PAGE THAT SHARES NOTHING IS NOT NAMED", () => {
    const f = findingFor([page("about", PARAGRAPH), page("delivery", PARAGRAPH), page("contact", OTHER)], "duplicate_body")!;
    expect(f.where).not.toContain("contact");
  });

  it("ONE PAGE WITH ITS OWN PARAGRAPH IS NOT A DUPLICATE OF ITSELF", () => {
    expect(codesFor([page("about", PARAGRAPH)])).not.toContain("duplicate_body");
  });

  it("AND NOR IS A PAGE THAT REPEATS A PARAGRAPH ON ITSELF", () => {
    // FOUND BY A MUTATION. The fixture above has one page and one
    // paragraph, so dropping the de-duplication of slugs changed
    // nothing — the push happened once either way. A page with the SAME
    // paragraph twice is what needs the de-duplication, and it is a
    // real shape: a long passage pasted into two sections of one page.
    //
    // It is not duplicate CONTENT either: search engines compare pages,
    // and this is one page. Repetition within a page is a writing
    // problem, not a ranking one.
    const repeated = {
      ...page("about", PARAGRAPH),
      sections: [
        { id: "s", type: "section", props: {}, children: [
          { id: "a", type: "text", props: { html: PARAGRAPH } },
          { id: "b", type: "text", props: { html: PARAGRAPH } },
        ] },
      ],
    };
    expect(codesFor([repeated])).not.toContain("duplicate_body");
  });

  it("A PAGE IS NAMED ONCE, however many paragraphs it shares", () => {
    const two = [
      page("about", PARAGRAPH),
      {
        ...page("delivery", PARAGRAPH),
        sections: [
          { id: "s", type: "section", props: {}, children: [
            { id: "a", type: "text", props: { html: PARAGRAPH } },
            { id: "b", type: "text", props: { html: OTHER } },
          ] },
        ],
      },
      page("contact", OTHER),
    ];
    const f = findingFor(two, "duplicate_body")!;
    expect(f.where.filter((s) => s === "delivery").length).toBe(1);
  });

  it("and nothing is reported when no page shares anything", () => {
    expect(codesFor([page("about", PARAGRAPH), page("contact", OTHER)])).not.toContain("duplicate_body");
  });
});

// ---------------------------------------------------------------------
describe("2. A SHORT REPEATED LINE IS A VOICE, NOT DUPLICATE CONTENT", () => {
  it("A TAGLINE ON EVERY PAGE IS NOT FLAGGED", () => {
    // Too low a threshold would flag every well-built site, and a
    // finding that fires on good work teaches the owner to ignore
    // findings.
    const tagline = "Made by hand, delivered with care.";
    expect(codesFor([page("about", tagline), page("contact", tagline), page("delivery", tagline)])).not.toContain(
      "duplicate_body"
    );
  });

  it("THE THRESHOLD IS A PARAGRAPH'S WORTH OF WORDS", () => {
    const twentyFour = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");
    const twentyFive = Array.from({ length: 25 }, (_, i) => `word${i}`).join(" ");
    expect(longPassages([{ type: "text", props: { html: twentyFour } }])).toEqual([]);
    expect(longPassages([{ type: "text", props: { html: twentyFive } }]).length).toBe(1);
  });

  it("A HEADING OR A BUTTON IS NEVER A PASSAGE, however long", () => {
    // Duplicate headings are already `duplicate_title`'s business, and a
    // button label is not prose.
    expect(longPassages([{ type: "heading", props: { text: PARAGRAPH } }])).toEqual([]);
    expect(longPassages([{ type: "button", props: { label: PARAGRAPH } }])).toEqual([]);
  });

  it("THE PROSE BLOCKS ARE DECLARED, AND THEY ARE TWO", () => {
    // FOUND BY A MUTATION. Adding "heading" to PROSE_BLOCKS changed
    // nothing above, because the prop filter blocked it anyway — two
    // overlapping guards, so neither could be tested through the other.
    // The declaration is what to pin: a third prose block has to be
    // added deliberately, and a check that decides whether a page is
    // discounted is worth that friction.
    const audit = code("src/lib/seo/technicalAudit.ts");
    expect(audit).toMatch(/const PROSE_BLOCKS = \["text", "faq_item"\];/);
  });

  it("AN FAQ ANSWER IS A PASSAGE AND ITS QUESTION IS NOT", () => {
    // THE CASE THE PROP FILTER ACTUALLY EXISTS FOR, and the other
    // mutation's answer: `faq_item` holds its question on `heading` and
    // its answer on `html`. Without the prop filter the question would
    // be read as prose — and two pages asking the same question is
    // normal, while two pages giving the same long answer is a copy.
    const answerOnly = longPassages([
      { type: "faq_item", props: { heading: PARAGRAPH, html: OTHER } },
    ]);
    expect(answerOnly.length).toBe(1);
    expect(answerOnly[0]).toContain("workshop is open");
    expect(answerOnly[0]).not.toContain("small batches");
  });

  it("CASE, SPACING AND PUNCTUATION DO NOT HIDE A COPY", () => {
    // A passage pasted between pages is rarely re-typed identically.
    const a = longPassages([{ type: "text", props: { html: PARAGRAPH } }])[0];
    const b = longPassages([{ type: "text", props: { html: `  ${PARAGRAPH.toUpperCase()}!!  ` } }])[0];
    expect(a).toBe(b);
  });

  it("and it reads the prose props, not every string on the block", () => {
    expect(longPassages([{ type: "image", props: { url: PARAGRAPH, alt: PARAGRAPH } }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("3. A LEGAL PAGE IS EXEMPT FROM BOTH", () => {
  const legal = (slug: string, text: string, over: Record<string, any> = {}) =>
    page(slug, text, { page_type: "legal", ...over });

  it("A PRIVACY POLICY SHARING STANDARD WORDING IS NOT A DUPLICATE FINDING", () => {
    // Nothing penalises standard legal wording — and more to the point,
    // a sentence is never removed from one on Hawlai's initiative
    // (lib/seo/pageKinds.ts records why), so the finding would have no
    // action behind it.
    const pages = [legal("privacy-policy", PARAGRAPH), legal("terms", PARAGRAPH)];
    expect(codesFor(pages)).not.toContain("duplicate_body");
  });

  it("AND A LEGAL PAGE IS NEVER CALLED STALE", () => {
    const old = new Date(Date.now() - 800 * 86400000).toISOString();
    expect(codesFor([legal("privacy-policy", PARAGRAPH, { updated_at: old })])).not.toContain("stale_content");
  });

  it("A MARKETING PAGE SHARING WITH A LEGAL ONE IS STILL NOT FLAGGED", () => {
    // The exemption is per page, which is the honest reading: the
    // marketing page's copy is only "shared" with something the audit
    // deliberately does not read.
    const pages = [legal("terms", PARAGRAPH), page("about", PARAGRAPH)];
    expect(codesFor(pages)).not.toContain("duplicate_body");
  });

  it("the exemption uses the one shared definition of a legal page", () => {
    const audit = code("src/lib/seo/technicalAudit.ts");
    expect(audit).toMatch(/import \{ isLegalPage \} from "\.\/pageKinds"/);
    expect(audit).toMatch(/if \(!isLegalPage\(page\)\) \{/);
  });
});

// ---------------------------------------------------------------------
describe("4. A STALE PAGE IS A HINT, AND AN UNREADABLE DATE IS NOT ONE", () => {
  const withDate = (slug: string, daysAgo: number) =>
    page(slug, PARAGRAPH, { updated_at: new Date(Date.now() - daysAgo * 86400000).toISOString() });

  it("A PAGE UNTOUCHED FOR OVER A YEAR IS NAMED", () => {
    const f = findingFor([withDate("about", 400)], "stale_content")!;
    expect(f.where).toEqual(["about"]);
    expect(f.priority).toBe("low");
  });

  it("AND ONE CHANGED LAST MONTH IS NOT", () => {
    expect(codesFor([withDate("about", 30)])).not.toContain("stale_content");
  });

  it("A MISSING DATE IS NOT A STALE PAGE", () => {
    // "The audit could not see a date" and "nobody has touched this in a
    // year" are different facts, and only one is the owner's problem.
    expect(daysSinceChange(null)).toBeNull();
    expect(daysSinceChange("")).toBeNull();
    expect(daysSinceChange("not a date")).toBeNull();
    expect(codesFor([page("about", PARAGRAPH)])).not.toContain("stale_content");
  });

  it("AND NOR IS A DATE IN THE FUTURE", () => {
    // A clock problem, not a stale page.
    expect(daysSinceChange(new Date(Date.now() + 86400000 * 5).toISOString())).toBeNull();
  });

  it("the threshold is read from the constant, not written into the words", () => {
    const f = findingFor([withDate("about", 400)], "stale_content")!;
    expect(f.problem).toMatch(/not changed in over 12 months/);
  });

  it("it says the page may need nothing, because most of the time it does not", () => {
    // A page that has not changed is not automatically wrong.
    const f = findingFor([withDate("about", 400)], "stale_content")!;
    expect(f.fix).toMatch(/If it is all still true, it needs nothing/);
  });
});

// ---------------------------------------------------------------------
describe("5. THE AUDIT STILL SAYS WHAT IT SAID BEFORE", () => {
  it("THE NINE EXISTING FINDINGS ARE UNTOUCHED", () => {
    // G1 adds two; it does not reword or remove any of the findings the
    // daily run has been producing.
    const audit = code("src/lib/seo/technicalAudit.ts");
    for (const existing of [
      "not_published",
      "broken_internal_link",
      "no_description",
      "no_heading",
      "thin_content",
      "duplicate_title",
      "duplicate_description",
      "description_length",
      "multiple_h1",
      "image_no_alt",
      "no_faq",
    ]) {
      expect(audit).toContain(`code: "${existing}"`);
    }
  });

  it("AND THE TWO NEW ONES ARE THERE", () => {
    const audit = code("src/lib/seo/technicalAudit.ts");
    expect(audit).toContain('code: "duplicate_body"');
    expect(audit).toContain('code: "stale_content"');
  });

  it("A FINDING WITH NOTHING TO REPORT IS NOT REPORTED", () => {
    // `add` only keeps a finding that names pages. A site with no
    // duplicates and no old pages gets neither.
    const clean = [page("about", PARAGRAPH), page("contact", OTHER)];
    const codes = codesFor(clean);
    expect(codes).not.toContain("duplicate_body");
    expect(codes).not.toContain("stale_content");
  });

  it("AND THE DAILY RUN READS THE DATE IT NEEDS", () => {
    // Without this the stale finding can never fire: the column is not
    // in the select, so every page looks undated.
    const runner = code("src/lib/seo/runTechnicalAudit.ts");
    expect(runner).toMatch(/select\("slug, title, meta_description, page_type, sections, og_image_url, updated_at"\)/);
  });
});
