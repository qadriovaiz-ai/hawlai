// propose_page_meta, routed by platform rather than duplicated.
//
// THE TOOL WAS ALREADY THERE and wrote only to the business's own
// Hawlai site. A merchant on Shopify asking to change their search
// title got "This business doesn't have a Hawlai website yet" — the
// wrong answer, since they have pages, just not Hawlai ones.
//
// Routing it was the alternative to a fourth new tool, and it keeps one
// claims check, one approval shape and one card for a decision that is
// the same decision whichever site the page is on.
//
// THE ORDER IS THE SAFETY PROPERTY. The claims guard runs ABOVE the
// routing, because what the guard does to a sentence has nothing to do
// with where the sentence is going — and a guard copied per platform is
// a guard that drifts on one of them.

import { describe, it, expect } from "vitest";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";
import { code, sourceWithComments } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** The propose_page_meta case body, and none of its neighbours'. */
function body(): string {
  const src = code(BRAIN);
  const start = src.indexOf('case "propose_page_meta": {');
  expect(start, "propose_page_meta has no case").toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.indexOf('\n    case "', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("1. THE CLAIMS GUARD RUNS BEFORE THE ROUTING", () => {
  it("THE LOAD-BEARING ONE: one guard, above the branch", () => {
    // If the guard sat inside each branch there would be two copies of
    // Decision C, and the Shopify one would be the copy nobody
    // remembered to update. Asserted by POSITION, which is the only
    // way to state it.
    const b = body();
    const guard = b.indexOf("guardGenerated");
    const route = b.indexOf("wantsShopify");
    expect(guard, "the guard is missing entirely").toBeGreaterThan(-1);
    expect(route, "the routing is missing entirely").toBeGreaterThan(-1);
    expect(guard, "the claims guard must run BEFORE the surface is chosen").toBeLessThan(route);
  });

  it("and there is only ONE call to it", () => {
    const b = body();
    expect(b.match(/guardGenerated\(/g) ?? []).toHaveLength(1);
  });
});

describe("2. WHICH SURFACE — it asks when it cannot know", () => {
  it("THE LOAD-BEARING ONE: both sites means a question, not a preference", () => {
    // "Update my About page" with a Hawlai site AND a Shopify store is
    // genuinely two different pages. Picking one would put an approved
    // change on a page the owner was not looking at.
    const b = body();
    // THE CONDITION IS THE ANCHOR, not the words inside it. Asserting
    // `/bothExist/` let a mutation replacing the whole test with
    // `if (false)` survive: every word this looks for was still in the
    // file, and a source test cannot see a dead branch unless the
    // branch's own condition is what it reads. That is the ceiling of
    // a source-grep test and it is worth naming rather than working
    // around.
    expect(b).toMatch(/if \(bothExist && !askedSurface\) \{/);
    expect(b).toMatch(/needs_clarification: true/);
    expect(b).toMatch(/Which site/);
    // It offers both, by name, so the answer is one word.
    expect(b).toMatch(/surface: "hawlai"/);
    expect(b).toMatch(/surface: "shopify"/);
  });

  it("the question names the actual store, not merely the word Shopify", () => {
    // A merchant with one store still deserves to see which domain is
    // connected, because a wrong connection is exactly what this
    // moment would otherwise hide.
    expect(body()).toMatch(/shopify_store_url\}/);
  });

  it("asks WITHOUT decrypting a token", () => {
    // Deciding a branch must not require a secret. The presence check
    // reads one column from the caller's own client; the token is
    // resolved only inside the Shopify branch, where it is actually
    // used. Resolving it up front broke every existing test of this
    // tool, and deserved to.
    const b = body();
    const presence = b.indexOf("shopify_store_url");
    const decrypt = b.indexOf("shopifyCredentialsAdapter");
    expect(presence).toBeGreaterThan(-1);
    expect(decrypt).toBeGreaterThan(-1);
    expect(presence, "the presence check must come before the token is resolved").toBeLessThan(decrypt);
    // And the resolve sits inside the branch, after it is chosen.
    expect(b.indexOf("wantsShopify")).toBeLessThan(decrypt);
  });

  it("READS `websites` ONCE, not once per decision", () => {
    // It read twice at first — the routing decision and then the
    // Hawlai branch — which broke the mocks and cost a round trip for
    // a row already in hand.
    const b = body();
    expect(b.match(/from\("websites"\)/g) ?? []).toHaveLength(1);
  });
});

describe("3. the Shopify branch tells the truth about what it can do", () => {
  it("A SHOPIFY PAGE HAS NO SHARE IMAGE, and it refuses rather than dropping it", () => {
    // Introspected from the live 2026-07 schema: Page carries body,
    // title, handle, isPublished and metafields, and nothing else. An
    // owner who asked for a share image and got no warning would
    // believe one was set.
    const b = body();
    // The condition, for the reason above: `if (false)` left the
    // message in place and this test green.
    expect(b).toMatch(/if \(shareImageUrl !== undefined\) \{/);
    expect(b).toMatch(/error: "A Shopify page has no share-image field/);
  });

  it("uses the SAME payload keys as the built-in site", () => {
    // One ActionKey, one payload shape — the rule
    // publishPayloadContract.test.ts exists to hold, after shopify.ts
    // spent a day reading `metaTitle` while hawlaiSite read `seoTitle`
    // and the mismatch would have looked like "no title was given".
    const b = body();
    const shopifyBranch = b.slice(b.indexOf("if (wantsShopify)"));
    expect(shopifyBranch).toMatch(/seoTitle: safeTitle/);
    expect(shopifyBranch).toMatch(/metaDescription: safeDescription/);
    expect(shopifyBranch).not.toMatch(/metaTitle/);
  });

  it("carries the claim bookkeeping, both counts", () => {
    // S7's demotion rule reads these, and the two mean opposite
    // things: what the guard removed, versus what the owner kept and
    // stood behind himself.
    const shopifyBranch = body().slice(body().indexOf("if (wantsShopify)"));
    expect(shopifyBranch).toMatch(/removed: metaRemoved/);
    expect(shopifyBranch).toMatch(/keptUnsupported: metaKeptByOwner/);
    expect(shopifyBranch).toMatch(/ownerWords:/);
  });

  it("resolves the page, and asks rather than picking", () => {
    const shopifyBranch = body().slice(body().indexOf("if (wantsShopify)"));
    expect(shopifyBranch).toMatch(/resolveShopifyResource|resolveMetaPage/);
    expect(shopifyBranch).toMatch(/candidates: pageHit\.candidates\.map/);
    expect(shopifyBranch).not.toMatch(/candidates: \[\]/);
    expect(shopifyBranch).not.toMatch(/candidates\[0\]/);
  });

  it("goes through createPublishAction, never a sender", () => {
    const shopifyBranch = body().slice(body().indexOf("if (wantsShopify)"));
    expect(shopifyBranch).toMatch(/createMetaAction|createPublishAction/);
    expect(shopifyBranch).not.toMatch(/\.execute\(/);
    expect(shopifyBranch).not.toMatch(/shopifyMutation/);
  });

  it("says NOTHING WAS SAVED when the insert fails", () => {
    const shopifyBranch = body().slice(body().indexOf("if (wantsShopify)"));
    expect(shopifyBranch).toMatch(/Nothing was saved anywhere/);
    expect(shopifyBranch).toMatch(/saved: false/);
  });
});

describe("4. the schema tells the model not to guess", () => {
  it("`surface` is omittable, and the description says the tool asks", () => {
    const schema = (TOOLS as any[]).find((t) => t.name === "propose_page_meta")!;
    const surface = schema.input_schema.properties.surface;
    expect(surface).toBeDefined();
    expect(surface.enum).toEqual(["hawlai", "shopify"]);
    expect(schema.input_schema.required ?? []).not.toContain("surface");
    // The model must know it is NOT its job to pick.
    expect(surface.description).toMatch(/ASKS/);
  });

  it("the reason the guard sits above the routing is written down", () => {
    // Read WITH comments deliberately — rule 8's named exception, for
    // when the comment IS the thing being asserted. A later tidy-up
    // that moved the guard into the branches would read as reasonable
    // without this.
    // SLICED TO THE CASE FIRST. This searched the whole file for
    // "// ---- WHICH SURFACE" and passed — until edit_page_text gained
    // the same routing and the same comment heading, EARLIER in the
    // file, so indexOf found the wrong one. Fifth time that shape has
    // cost something here: a bare indexOf finds somebody else's
    // occurrence and reports on it with total confidence.
    const withComments = sourceWithComments(BRAIN);
    const caseStart = withComments.indexOf('case "propose_page_meta": {');
    expect(caseStart, "propose_page_meta has no case").toBeGreaterThan(-1);
    const caseEnd = withComments.indexOf("\n    case \"", caseStart + 1);
    const thisCase = withComments.slice(caseStart, caseEnd === -1 ? undefined : caseEnd);
    const start = thisCase.indexOf("// ---- WHICH SURFACE");
    expect(start, "the routing comment is not in this case").toBeGreaterThan(-1);
    expect(thisCase.slice(start, start + 1200)).toMatch(/deliberately ABOVE this line/);
  });
});
