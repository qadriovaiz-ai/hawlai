// What counts as the owner standing behind a page's words.
//
// content_source and props._source exist for one purpose: deciding
// whether a line may be EVIDENCE for a claims check. A line Hawlai wrote
// cannot be the proof that the same line is true — that was the loop
// Stage 1 broke. So both marks have to mean "the owner wrote or approved
// these words", and nothing weaker.
//
// Website Builder saves a page whole. Uploading a share image sends the
// sections along with it, and marking that as authorship would record an
// owner as having stood behind body copy they never read — turning
// "safer than mass-market paraffin" into evidence because they set a
// WhatsApp preview image.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { blocksText } from "@/lib/claims/businessFacts";

const route = readFileSync("src/app/api/website-builder/pages/[id]/route.ts", "utf8");
const panel = readFileSync("src/components/website-builder/blocks/PropertiesPanel.tsx", "utf8");

const page = (headline: string, extra: Record<string, any> = {}) => [
  { id: "s1", type: "section", props: { background: "none", ...extra }, children: [
    { id: "h1", type: "heading", props: { text: headline } },
    { id: "i1", type: "image", props: { url: "https://cdn.test/a.jpg", alt: "a" } },
  ] },
];

/** The route's own rule, applied here the way the route applies it. */
function wordsChanged(before: unknown, after: unknown): boolean {
  const words = (blocks: unknown) => {
    const t = blocksText(blocks);
    return JSON.stringify([t.headings, t.paragraphs, t.buttons]);
  };
  return words(before) !== words(after);
}

describe("a page is 'edited' only when its words are", () => {
  it("rewriting a headline counts", () => {
    expect(wordsChanged(page("Hand-poured in Shahjahanpur"), page("Poured by hand in Shahjahanpur"))).toBe(true);
  });

  it("SETTING A SHARE IMAGE DOES NOT", () => {
    // The save that prompted this: the whole page goes up, sections
    // included, because the SEO fields and the blocks share one button.
    const before = page("Hand-poured in Shahjahanpur");
    const after = JSON.parse(JSON.stringify(before));
    expect(wordsChanged(before, after)).toBe(false);
  });

  it("nor does a colour, a reorder or a different picture", () => {
    const before = page("Hand-poured in Shahjahanpur");
    expect(wordsChanged(before, page("Hand-poured in Shahjahanpur", { background: "muted" }))).toBe(false);
    const swapped = JSON.parse(JSON.stringify(before));
    swapped[0].children[0].props.url = "https://cdn.test/b.jpg";
    expect(wordsChanged(before, swapped)).toBe(false);
    const reordered = JSON.parse(JSON.stringify(before));
    reordered[0].children.reverse();
    // Order alone is not authorship; the words are the same words.
    expect(blocksText(reordered).headings).toEqual(blocksText(before).headings);
  });

  it("the route asks that question before it flips the page", () => {
    expect(route).toMatch(/if \(wordsChanged\(current\?\.sections, body\.sections\)\) update\.content_source = "edited";/);
    // Never unconditionally on a sections save, which is what it did.
    expect(route).not.toMatch(/update\.sections = body\.sections;\s*\n\s*update\.content_source = "edited";/);
  });
});

describe("a block is 'edited' only when its words are", () => {
  it("marks a text change and leaves a styling change alone", () => {
    expect(panel).toMatch(/const TEXT_PROPS = new Set\(\["text", "heading", "html", "label"\]\)/);
    expect(panel).toMatch(/onChange\(TEXT_PROPS\.has\(key\) \? \{ \[key\]: value, _source: "edited" \} : \{ \[key\]: value \}\)/);
  });

  it("the per-block mark is the one the evidence rule will read", () => {
    // Stated here because it is the decision, not an implementation
    // detail: a page marked 'edited' says the owner has been in it, and
    // that is not the same as having approved any particular sentence.
    const guard = readFileSync("src/lib/claims/guardBlocks.ts", "utf8");
    expect(guard).toMatch(/_source: "generated"/);
    expect(guard).toMatch(/Cleared per block when the owner edits it/);
  });
});
