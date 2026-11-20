// A Shopify page, read and edited through the tool that already
// existed — 21 November 2026, the last piece of the chat wiring.
//
// THE DECISION AND ITS CONDITION. `edit_page_text` addresses a BLOCK
// ID. A Shopify page is one HTML body with no blocks, so the contract
// did not transfer and the choice was: share the tool, write a second
// one, or leave Shopify page text unreachable.
//
// Sharing it was only acceptable because the guards transfer.
// statesPriceOrStock and unknownProductName read a string;
// legalWarning takes {before, after} pairs, which a whole-body edit
// supplies as one pair; the fact-bound check reads strings behind a
// flag. Only applyEdits is block-shaped, and that is plumbing rather
// than a guard.
//
// SO THIS FILE'S REAL JOB is to prove the Shopify branch did not get a
// thinner set of guards than the Hawlai one. Every "same guard"
// assertion below is that claim, stated so it fails if a guard is
// dropped from one side.

import { describe, it, expect } from "vitest";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";
import { code, sourceWithComments } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** The shared read_page / edit_page_text case, and none of its neighbours'. */
function pageCase(): string {
  const src = code(BRAIN);
  const start = src.indexOf('case "read_page":');
  expect(start, "the page case is gone").toBeGreaterThan(-1);
  const rest = src.slice(start);
  // Past the `case "edit_page_text":` label that shares this body.
  const afterLabels = rest.indexOf("{");
  const end = rest.indexOf("\n    case \"", afterLabels);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Just the Shopify half — BOUNDED AT BOTH ENDS.
 *
 * This returned `b.slice(start)` at first, which runs to the end of
 * the case and therefore includes the HAWLAI half that follows. A
 * mutation disabling the Shopify fact-bound check survived, because
 * the Hawlai branch's own `FACT_BOUND_COPY` line was still inside the
 * slice and the assertion matched that one instead.
 *
 * Sixth time in this project that an unbounded or unsliced search has
 * reported on somebody else's occurrence. A slice with only a start is
 * not a slice.
 */
function shopifyHalf(): string {
  const b = pageCase();
  const start = b.indexOf("if (textWantsShopify)");
  expect(start, "the Shopify branch is gone").toBeGreaterThan(-1);
  // The Hawlai branch begins at the refusal that follows it.
  const end = b.indexOf('if (!pageSite) return { error: "This business doesn\'t have a Hawlai website', start);
  expect(end, "cannot find where the Shopify branch ends").toBeGreaterThan(start);
  return b.slice(start, end);
}

describe("1. THE GUARDS TRANSFERRED — the condition the decision rested on", () => {
  it("THE LOAD-BEARING ONE: a price in page text is refused on BOTH surfaces", () => {
    // Not because the number is wrong, but because no number belongs
    // in prose that nothing keeps in step with the catalogue. A
    // Shopify body is prose on a live storefront, so the rule is the
    // same rule.
    const b = pageCase();
    const shop = shopifyHalf();
    expect(b).toMatch(/statesPriceOrStock/);
    expect(shop).toMatch(/shopStatesPrice\(newBody\)/);
    expect(shop).toMatch(/Do NOT retry with a different number/);
  });

  it("an unknown product name is refused when Hawlai wrote it, warned when the owner did", () => {
    // Rule C, on both surfaces: inventing a product is how a customer
    // comes to ask for something nobody can send — but a name the
    // OWNER dictated may be a product they are about to add.
    const shop = shopifyHalf();
    expect(shop).toMatch(/shopUnknownName\(newBody, shopFacts\)/);
    expect(shop).toMatch(/if \(!ownerWrote\)/);
    expect(shop).toMatch(/shopNameRefusal/);
    expect(shop).toMatch(/shopNameWarning/);
  });

  it("the fact-bound check runs BEHIND THE SAME FLAG, not ahead of it", () => {
    // Running it here while the other surfaces wait on
    // FACT_BOUND_COPY would be the split S2 spent its budget
    // preventing — one surface on a pipeline the other four are not.
    const shop = shopifyHalf();
    expect(shop).toMatch(/process\.env\.FACT_BOUND_COPY === "1"/);
    expect(shop).toMatch(/verifyEditedText/);
    // And it checks only what the MODEL wrote, like the Hawlai side.
    expect(shop).toMatch(/!ownerWrote/);
  });

  it("legalWarning is applied, which is why one pair was enough", () => {
    // It takes {before, after} pairs. A whole-body edit is one pair —
    // the detail that let this guard transfer at all rather than being
    // written off as block-shaped.
    const shop = shopifyHalf();
    expect(shop).toMatch(/shopLegalWarning\(\[\{ before: currentBody, after: newBody \}/);
  });

  it("THE WEAKER GUARD IS NAMED, not quietly equivalent", () => {
    // Hawlai pages carry a `page_type`; Shopify has none, so a legal
    // page is detected by HANDLE. A page the owner made by hand and
    // titled "Refund policy" will not match. Claiming equivalence here
    // would have been the dishonest option, so the asymmetry is in the
    // file — read with comments, rule 8's named exception.
    const withComments = sourceWithComments(BRAIN);
    const start = withComments.indexOf("A SHOPIFY PAGE IS A LEGAL PAGE BY ITS HANDLE");
    expect(start, "the asymmetry is no longer recorded").toBeGreaterThan(-1);
    const block = withComments.slice(start, start + 800);
    expect(block).toMatch(/weaker than the Hawlai check/);
    expect(block).toMatch(/will NOT match/);
  });
});

describe("2. ONE BLOCK, AND IT SAYS SO", () => {
  it("THE LOAD-BEARING ONE: the body comes back as a single line", () => {
    // Not a convenient fiction: the adapter writes the whole body and
    // there is nothing finer to address. The id is spelled so a reader
    // cannot mistake it for one of the builder's blocks.
    const shop = shopifyHalf();
    expect(shop).toMatch(/blockId: "shopify:page-body"/);
    expect(shop).toMatch(/blockType: "page_body"/);
  });

  it("and the note warns that an edit replaces the whole thing", () => {
    // An owner who thinks one sentence changed would be wrong, and so
    // would a model that sent only the changed part.
    const shop = shopifyHalf();
    expect(shop).toMatch(/ONE body rather than separate lines/);
    expect(shop).toMatch(/send the complete new text/);
    expect(shop).toMatch(/replaces the whole page body/);
  });

  it("an empty edit is refused with that explanation", () => {
    const shop = shopifyHalf();
    expect(shop).toMatch(/A Shopify page is replaced whole/);
  });

  it("it reads the page LIVE rather than trusting the resolver's listing", () => {
    // The resolver returns id, title and handle only. The body has to
    // be read, and read fresh — the preview's before-value is what
    // staleness compares against later.
    const shop = shopifyHalf();
    expect(shop).toMatch(/ChatReadShopifyPage/);
    expect(shop).toMatch(/body/);
  });
});

describe("3. the same routing rules as propose_page_meta", () => {
  it("both sites means a question", () => {
    const b = pageCase();
    expect(b).toMatch(/if \(textHasShopify && pageSite && !textSurface\) \{/);
    expect(b).toMatch(/Which site/);
  });

  it("asks WITHOUT decrypting a token, and reads websites once", () => {
    const b = pageCase();
    const presence = b.indexOf("shopify_store_url");
    const decrypt = b.indexOf("shopifyCredentialsAdapter");
    expect(presence).toBeGreaterThan(-1);
    expect(decrypt).toBeGreaterThan(-1);
    expect(presence).toBeLessThan(decrypt);
    expect(b.match(/from\("websites"\)/g) ?? []).toHaveLength(1);
  });

  it("resolves the page and asks rather than picking", () => {
    const shop = shopifyHalf();
    expect(shop).toMatch(/candidates: textHit\.candidates\.map/);
    expect(shop).not.toMatch(/candidates: \[\]/);
    expect(shop).not.toMatch(/candidates\[0\]/);
  });

  it("goes through createPublishAction, never a sender or a raw mutation", () => {
    const shop = shopifyHalf();
    expect(shop).toMatch(/createTextAction/);
    expect(shop).not.toMatch(/\.execute\(/);
    expect(shop).not.toMatch(/shopifyMutation/);
  });

  it("says NOTHING WAS SAVED when the insert fails", () => {
    const shop = shopifyHalf();
    expect(shop).toMatch(/Nothing was saved anywhere/);
    expect(shop).toMatch(/saved: false/);
  });

  it("uses the payload key the built-in site uses", () => {
    // One ActionKey, one payload shape. hawlaiSite reads `html` for a
    // body too.
    const shop = shopifyHalf();
    expect(shop).toMatch(/requestedChanges: \{ html: newBody/);
  });
});

describe("4. both page tools can be told which surface", () => {
  it.each(["read_page", "edit_page_text"] as const)("%s takes an optional `surface`", (name) => {
    const schema = (TOOLS as any[]).find((t) => t.name === name)!;
    const surface = schema.input_schema.properties.surface;
    expect(surface, `${name} has no surface parameter`).toBeDefined();
    expect(surface.enum).toEqual(["hawlai", "shopify"]);
    expect(schema.input_schema.required ?? []).not.toContain("surface");
    // The model must know it is not its job to pick, and that a
    // Shopify page behaves differently once it gets there.
    expect(surface.description).toMatch(/ASKS/);
    expect(surface.description).toMatch(/ONE body/);
  });
});
