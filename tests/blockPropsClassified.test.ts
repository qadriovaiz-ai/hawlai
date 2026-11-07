// Every block prop is classified, so a new one cannot fall through.
//
// WHY THIS FILE EXISTS. The audit's text reader has now been wrong twice,
// in opposite directions, and both times because a list of prop names
// went stale without anything failing:
//
//   7 Nov 2026 (G5)  — it read text/html/label/alt and missed `heading`,
//                      where faq, faq_item, product_grid and the contact
//                      block keep their words. A page whose only mention
//                      of its city was a section heading read as never
//                      mentioning it.
//   7 Nov 2026 (same day, the fix) — a second reader took EVERY string
//                      prop instead, which pulls in `href`, `url`,
//                      `align`, `background` and `style`. A thin page
//                      with fifty buttons would pass the word count, and
//                      "/candles-in-a-city" would answer "the page says
//                      the city" when no reader ever sees it.
//
// The lesson was never "read everything". It was that an inclusion list
// nobody checks goes stale silently. So the list is checked here, against
// the registry, and THE REGISTRY ALREADY KNOWS: every propField declares
// a `type`, and "text" and "richtext" are the ones that hold words.
// Add a new text prop to a block and this file fails until the reader is
// told about it.

import { describe, it, expect } from "vitest";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import { READABLE_PROPS, pageText, auditSite } from "@/lib/seo/technicalAudit";
import { TEXT_PROPS } from "@/lib/pages/provenance";
import { code } from "./helpers/source";

/** The propField types that hold words a visitor reads. */
const WORD_TYPES = ["text", "richtext"];

type Field = { key: string; type?: string };

function allFields(): Field[] {
  const out: Field[] = [];
  for (const def of Object.values(BLOCK_REGISTRY)) {
    for (const f of (def as any).propFields ?? []) {
      if (f && typeof f.key === "string") out.push({ key: f.key, type: f.type });
    }
  }
  return out;
}

describe("1. EVERY PROP THAT HOLDS WORDS IS IN THE READER", () => {
  it("THE REGISTRY'S OWN text AND richtext FIELDS ARE ALL READ", () => {
    // THE LOAD-BEARING ASSERTION. A new block with a `question` or
    // `caption` prop fails here until the audit is told it holds words —
    // which is the failure G5 shipped with and nothing caught.
    const wordProps = [...new Set(allFields().filter((f) => WORD_TYPES.includes(String(f.type))).map((f) => f.key))].sort();
    expect(wordProps.length).toBeGreaterThan(0);
    for (const key of wordProps) {
      expect(READABLE_PROPS.includes(key), `block prop "${key}" holds words but the audit does not read it`).toBe(true);
    }
  });

  it("AND NOTHING THE READER TAKES IS A MACHINE VALUE", () => {
    // The other direction: a URL, an alignment or a colour must not be
    // counted as prose. Anything in READABLE_PROPS that the registry
    // declares as a non-word type is a mistake.
    const byKey = new Map<string, Set<string>>();
    for (const f of allFields()) {
      if (!byKey.has(f.key)) byKey.set(f.key, new Set());
      byKey.get(f.key)!.add(String(f.type));
    }
    for (const key of READABLE_PROPS) {
      const types = byKey.get(key);
      if (!types) continue; // a prop the registry does not expose for editing
      for (const t of types) {
        expect(WORD_TYPES.includes(t), `the audit reads "${key}" as prose but the registry calls it "${t}"`).toBe(true);
      }
    }
  });

  it("the machine-value props are present in the registry, so this is a real test", () => {
    // If the registry stopped declaring href/url/align at all, the
    // assertion above would pass by having nothing to check.
    const keys = new Set(allFields().map((f) => f.key));
    expect(keys.has("href") || keys.has("url")).toBe(true);
    expect(keys.has("align")).toBe(true);
  });

  it("NEITHER href NOR url IS READ AS PROSE", () => {
    // Named explicitly, because this is the one that would let a slug
    // answer a question about what the page says.
    expect(READABLE_PROPS).not.toContain("href");
    expect(READABLE_PROPS).not.toContain("url");
    expect(READABLE_PROPS).not.toContain("align");
    expect(READABLE_PROPS).not.toContain("style");
    expect(READABLE_PROPS).not.toContain("background");
  });
});

describe("2. ONE DECLARATION, NOT A FOURTH COPY", () => {
  it("THE FOUR WORD PROPS COME FROM provenance.ts", () => {
    // provenance.ts's own comment says "the same four everywhere", and it
    // imports nothing on purpose so that both the client builder and the
    // server readers can share it.
    for (const key of TEXT_PROPS) {
      expect(READABLE_PROPS).toContain(key);
    }
  });

  it("AND IT IS SPREAD FROM THERE, NOT RE-TYPED", () => {
    // Mutation M3: a hand-typed list with the same four values passes
    // every assertion about VALUES, and then drifts the first time
    // provenance changes. The declaration has to be the same object.
    const src = code("src/lib/seo/technicalAudit.ts");
    expect(src).toMatch(/READABLE_PROPS[^=]*=\s*\[\.\.\.TEXT_PROPS,\s*"alt"\]/);
    expect(src).toMatch(/import \{ TEXT_PROPS \} from "@\/lib\/pages\/provenance"/);
  });

  it("AND alt IS THE ONE ADDITION, with a different question behind it", () => {
    // provenance answers "which props did the OWNER write"; this reader
    // answers "what can a visitor or a crawler see". Alt text is read
    // aloud and indexed, but nobody edits it as authored copy.
    expect(READABLE_PROPS).toContain("alt");
    expect(TEXT_PROPS as readonly string[]).not.toContain("alt");
    expect([...READABLE_PROPS].sort()).toEqual([...TEXT_PROPS, "alt"].sort());
  });
});

describe("3. THE READER ACTUALLY READS THEM", () => {
  it("A `heading` PROP ON A NON-HEADING BLOCK IS READ", () => {
    // The G5 bug, as a direct test of the reader rather than of a list.
    const sections = [{ type: "product_grid", props: { heading: "Our products in A City" } }];
    expect(pageText(sections)).toContain("A City");
  });

  it("A HEADING BLOCK IS READ, as it always was", () => {
    // Worth pinning: heading BLOCKS were never the problem — their words
    // live in props.text. Saying otherwise sent the first investigation
    // in the wrong direction.
    expect(pageText([{ type: "heading", props: { text: "A Heading", level: 1 } }])).toContain("A Heading");
  });

  it("EVERY WORD PROP IS READ, from a block that carries all of them", () => {
    const props: Record<string, string> = {};
    for (const key of READABLE_PROPS) props[key] = `value-for-${key}`;
    const text = pageText([{ type: "text", props }]);
    for (const key of READABLE_PROPS) {
      expect(text, `"${key}" was not read`).toContain(`value-for-${key}`);
    }
  });

  it("AND A URL IS NOT", () => {
    const text = pageText([{ type: "button", props: { label: "Shop", href: "/candles-in-a-city" } }]);
    expect(text).toContain("Shop");
    expect(text).not.toContain("candles-in-a-city");
  });

  it("nor an alignment, a colour or a style name", () => {
    const text = pageText([
      { type: "text", props: { html: "Real words.", align: "center", background: "#ffffff", style: "card" } },
    ]);
    expect(text).toContain("Real words.");
    expect(text).not.toContain("center");
    expect(text).not.toContain("#ffffff");
    expect(text).not.toContain("card");
  });

  it("children are read as well as the block itself", () => {
    const text = pageText([
      { type: "faq", props: { heading: "Common questions" }, children: [{ type: "faq_item", props: { heading: "Do you deliver?", html: "Yes." } }] },
    ]);
    expect(text).toContain("Common questions");
    expect(text).toContain("Do you deliver?");
    expect(text).toContain("Yes.");
  });

  it("AN EMPTY WORD PROP READS AS NOTHING, not as whitespace", () => {
    // Mutation M11: dropping the trim from the filter pushes empty
    // strings, and the join turns them into spaces. Word counts survive
    // that, but a caller asking "is there any text here" does not.
    expect(pageText([{ type: "text", props: { html: "", heading: "   " } }])).toBe("");
  });

  it("and nothing is read from a block with no props", () => {
    expect(pageText([{ type: "stack" }])).toBe("");
    expect(pageText(null)).toBe("");
    expect(pageText([])).toBe("");
  });
});

describe("4. A PAGE OF LINKS IS STILL A THIN PAGE", () => {
  it("URLs AND PROP NAMES ARE NOT CONTENT", () => {
    // Mutation M19b: measuring the word count over the raw JSON of the
    // sections instead of over the reader. Every fixture elsewhere is
    // long enough either way, so nothing noticed — and the harm is
    // exactly the one that ruled out reading every string prop: a page
    // whose only text is twenty button labels and twenty long URLs would
    // read as having plenty to say.
    const buttons = Array.from({ length: 20 }, (_, i) => ({
      type: "button",
      props: { label: "Shop", href: `/a-fairly-long-destination-slug-number-${i}` },
    }));
    const audit = auditSite({
      published: true,
      pages: [{
        slug: "links",
        title: "Links",
        meta_description: "A description that is comfortably long enough to pass the length check here.",
        page_type: "landing",
        sections: buttons,
        updated_at: new Date().toISOString(),
      }],
    });
    const thin = audit.findings.find((f) => f.code === "thin_content");
    expect(thin, "a page of twenty links has nothing to say and must be reported as thin").toBeTruthy();
    expect(thin!.where).toContain("links");
  });

  it("and real prose on the same page is not thin", () => {
    // The other half, so the test above cannot pass by the check being
    // broken in the other direction.
    const audit = auditSite({
      published: true,
      pages: [{
        slug: "about",
        title: "About",
        meta_description: "A description that is comfortably long enough to pass the length check here.",
        page_type: "landing",
        sections: [
          { type: "heading", props: { text: "What we do", level: 1 } },
          { type: "text", props: { html: Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") } },
        ],
        updated_at: new Date().toISOString(),
      }],
    });
    expect(audit.findings.find((f) => f.code === "thin_content")).toBeFalsy();
  });
});

describe("5. THE SECOND READER IS GONE", () => {
  it("THERE IS NO allText ANY MORE", async () => {
    // Two readers is how the two bugs above coexisted for an afternoon.
    const mod: Record<string, unknown> = await import("@/lib/seo/technicalAudit");
    expect("allText" in mod).toBe(false);
  });
});
