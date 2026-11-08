// The four prop names that hold the owner's words are declared ONCE.
//
// WHY THIS FILE EXISTS. On 8 November 2026 the same four names —
// text, heading, html, label — were declared in SIX places:
//
//   src/lib/pages/provenance.ts          TEXT_PROPS (the canonical one)
//   src/lib/claims/guardBlocks.ts        BLOCK_TEXT_KEYS
//   src/app/api/seo/claims-review/route.ts   an inline array, VALIDATING
//                                        the owner's "remove this line"
//                                        request — a word prop missing
//                                        here makes that button fail
//   src/components/website-builder/blocks/PropertiesPanel.tsx
//                                        a Set named TEXT_PROPS, which
//                                        SHADOWED the real one, so a
//                                        reader would have believed it
//                                        was the shared list
//   src/lib/businessBrain/toolSchemas.ts an enum in a model-facing tool
//                                        schema — a prop missing here
//                                        cannot be named by the model
//   src/lib/claims/siteClaimsReview.ts   the union type, three times
//
// THE RISK IS NOT UNTIDINESS. `faq_item` keeps its question on `heading`
// and its answer on `html`. A new prop called `answer` would have been
// invisible to every one of those six, so an AI-written FAQ answer would
// have reached a live page UNGUARDED — the 2026-09-30 incident that put
// the claims guard on the builder in the first place. Six copies means
// six chances to forget, and the one that gets forgotten is the one
// nobody is looking at.
//
// WHAT THIS TEST ASSERTS A DECLARATION, NOT A WORD. These names appear
// legitimately all over the codebase: in comments explaining why
// `faq_item` is named as it is, in a tool-schema description telling the
// model what each prop holds, in registry prop keys. Grepping for the
// WORD would fail on all of that. So this looks for the SHAPE of a
// declaration — an array literal, a Set of them, or a repeated union
// type — which is the thing that can drift.
//
// That distinction is the lesson the project recorded as rule 8: a test
// that greps source asserts the declaration, not the word.

import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TEXT_PROPS, isTextProp } from "@/lib/pages/provenance";
import { code, sourceWithComments } from "./helpers/source";

const CANONICAL = "src/lib/pages/provenance.ts";

function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path.split("\\").join("/"));
    }
  }
  return out;
}

/**
 * The shapes a second copy would take.
 *
 * Each is a DECLARATION of the set, in some order, not a mention of the
 * names. The order is not fixed because a copy written later would not
 * necessarily keep it.
 */
const NAMES = ["text", "heading", "html", "label"];

/**
 * The files swept, computed ONCE and shared by both tests below.
 *
 * Shared on purpose. Mutation M17 narrowed the sweep inside the "no
 * other file" test and survived, because the test that checks the sweep
 * is real was calling sourceFiles() separately — so each test was
 * happy about its own list. One list means narrowing it fails both.
 *
 * The residual limit, stated rather than papered over: a mutation that
 * guts THIS test's loop in place is not catchable by another test, the
 * same way any assertion can be deleted. What is pinned here is the
 * input they share.
 */
const FILES = sourceFiles();

function declaresTheSet(src: string): string | null {
  // An array or Set literal holding all four, in any order, with
  // nothing but the four in it.
  const arrays = src.match(/\[\s*"(?:text|heading|html|label)"(?:\s*,\s*"(?:text|heading|html|label)")*\s*,?\s*\]/g) ?? [];
  for (const literal of arrays) {
    const found = NAMES.filter((n) => literal.includes(`"${n}"`));
    if (found.length === NAMES.length) return literal;
  }
  // A union type of all four.
  const unions = src.match(/"(?:text|heading|html|label)"(?:\s*\|\s*"(?:text|heading|html|label)")+/g) ?? [];
  for (const union of unions) {
    const found = NAMES.filter((n) => union.includes(`"${n}"`));
    if (found.length === NAMES.length) return union;
  }
  return null;
}

describe("1. ONE DECLARATION, AND THE TEST CAN TELL", () => {
  it("THE CANONICAL FILE DECLARES IT", () => {
    // If this fails the test below is meaningless — it would be passing
    // by having nothing to find anywhere.
    expect(declaresTheSet(code(CANONICAL))).not.toBeNull();
  });

  it("AND NO OTHER FILE UNDER src/ DOES", () => {
    // THE LOAD-BEARING ASSERTION. A seventh copy fails the suite here.
    const copies: string[] = [];
    for (const file of FILES) {
      if (file === CANONICAL) continue;
      const found = declaresTheSet(code(file));
      if (found) copies.push(`${file} declares ${found}`);
    }
    expect(copies, `declare these names in ${CANONICAL} and import them:\n${copies.join("\n")}`).toEqual([]);
  });

  it("THE SWEEP ACTUALLY WALKS THE TREE", () => {
    // Mutation M17: narrowing the sweep to the canonical file alone left
    // every assertion green, because the detector is unit-tested
    // separately. Without this, "no other file declares it" could be
    // true by never looking at another file.
    expect(FILES.length).toBeGreaterThan(200);
    for (const known of [
      "src/lib/claims/guardBlocks.ts",
      "src/components/website-builder/blocks/PropertiesPanel.tsx",
      "src/lib/businessBrain/toolSchemas.ts",
      "src/app/api/seo/claims-review/route.ts",
      "src/lib/claims/siteClaimsReview.ts",
    ]) {
      expect(FILES, `${known} is one of the former copies and must be swept`).toContain(known);
    }
  });

  it("the detector finds a copy when there is one, in any order", () => {
    // So the assertion above cannot pass because the detector is broken.
    expect(declaresTheSet('const X = ["text", "heading", "html", "label"];')).not.toBeNull();
    expect(declaresTheSet('const X = ["label", "html", "heading", "text"];')).not.toBeNull();
    expect(declaresTheSet('const X = new Set(["text", "heading", "html", "label"]);')).not.toBeNull();
    expect(declaresTheSet('type F = "text" | "heading" | "html" | "label";')).not.toBeNull();
    expect(declaresTheSet('enum: ["text", "heading", "html", "label"],')).not.toBeNull();
  });

  it("AND IGNORES A MENTION THAT IS NOT A DECLARATION", () => {
    // These are the false positives that make a word-grep useless here:
    // prose that names the props, and a partial list that is somebody
    // else's legitimate business.
    expect(declaresTheSet('description: "\\"text\\" or \\"heading\\" for a heading, \\"html\\" for a paragraph, \\"label\\" for a button."')).toBeNull();
    expect(declaresTheSet('const LEGACY = ["headline", "subheadline", "heading", "body", "text", "ctaText"];')).toBeNull();
    expect(declaresTheSet('const THREE = ["text", "heading", "html"];')).toBeNull();
  });
});

describe("2. THE SIX FORMER COPIES NOW ASK THE ONE DECLARATION", () => {
  const asks = (file: string) => code(file);

  it("THE CLAIMS GUARD", () => {
    const src = asks("src/lib/claims/guardBlocks.ts");
    expect(src).toMatch(/import \{ TEXT_PROPS \} from "@\/lib\/pages\/provenance"/);
    expect(src).not.toMatch(/BLOCK_TEXT_KEYS/);
  });

  it("THE ROUTE THAT VALIDATES THE OWNER'S REMOVE REQUEST", () => {
    // The one where a forgotten prop does not fail open or closed in the
    // abstract — it makes a button in the owner's own review not work.
    const src = asks("src/app/api/seo/claims-review/route.ts");
    expect(src).toMatch(/isTextProp\(field\)/);
  });

  it("THE BUILDER'S PROPERTIES PANEL, which no longer shadows the name", () => {
    const src = asks("src/components/website-builder/blocks/PropertiesPanel.tsx");
    expect(src).toMatch(/isTextProp\(key\)/);
    expect(src).not.toMatch(/const TEXT_PROPS =/);
  });

  it("THE MODEL-FACING TOOL SCHEMA", () => {
    // A prop the model cannot name is a prop the model cannot edit.
    const src = asks("src/lib/businessBrain/toolSchemas.ts");
    expect(src).toMatch(/enum: \[\.\.\.TEXT_PROPS\]/);
  });

  it("THE OWNER'S CLAIMS REVIEW, where the union was repeated three times", () => {
    const src = asks("src/lib/claims/siteClaimsReview.ts");
    expect(src).toMatch(/import type \{ TextProp \} from "@\/lib\/pages\/provenance"/);
    expect((src.match(/TextProp/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("and the legacy prop names are DELIBERATELY still their own list", () => {
    // Not a seventh copy: `headline`, `body` and `ctaText` are the names
    // a converter maps ONTO the four. Sharing one declaration would
    // invite a caller to write `ctaText` back to a page the builder can
    // no longer edit. The reason is recorded beside it.
    const src = asks("src/lib/claims/guardBlocks.ts");
    // ITS CONTENT, not just its name. Mutation M15 replaced the whole
    // list with TEXT_PROPS and nothing noticed — which would have left
    // every page written before the block builder unguarded, because the
    // words on those pages live under `headline`, `body` and `ctaText`.
    const list = src.match(/const LEGACY_TEXT_KEYS = \[([^\]]+)\]/);
    expect(list, "LEGACY_TEXT_KEYS must still be its own literal list").not.toBeNull();
    for (const legacyOnly of ["headline", "subheadline", "body", "ctaText", "buttonText", "cta"]) {
      expect(list![1], `"${legacyOnly}" is a pre-builder prop name and only this list has it`).toContain(`"${legacyOnly}"`);
    }
    const withComments = sourceWithComments("src/lib/claims/guardBlocks.ts");
    expect(withComments).toMatch(/DELIBERATELY NOT FOLDED/);
  });
});

describe("3. THE SHARED QUESTION ANSWERS CORRECTLY", () => {
  it("every canonical name is a text prop", () => {
    for (const name of TEXT_PROPS) expect(isTextProp(name)).toBe(true);
  });

  it("AND A STYLING OR MACHINE PROP IS NOT", () => {
    for (const name of ["align", "href", "url", "background", "style", "level", "alt", "src"]) {
      expect(isTextProp(name), `"${name}" must not count as the owner's words`).toBe(false);
    }
  });

  it("nothing is a text prop by accident", () => {
    expect(isTextProp(null)).toBe(false);
    expect(isTextProp(undefined)).toBe(false);
    expect(isTextProp("")).toBe(false);
    expect(isTextProp("TEXT")).toBe(false);
    expect(isTextProp(" text")).toBe(false);
  });
});
