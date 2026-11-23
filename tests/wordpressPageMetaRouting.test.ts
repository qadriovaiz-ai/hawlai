// WordPress as a third surface for propose_page_meta.
//
// THE RULE THIS INHERITS, and the reason the tool asks at all: a
// business can have a Hawlai website, a Shopify store, a WordPress
// site, or several. "Update my About page" with two of them is
// genuinely two different pages, and picking one would put an approved
// change on a page the owner was not looking at. The page resolver's
// own record says it plainly — the predecessor fell through and
// reported success.
//
// WHAT CHANGED ON 22 NOVEMBER 2026. `bothExist` became
// `surfaces.length > 1`. "Do both exist?" has no honest answer once
// there are three, and a fourth surface would have needed the question
// rewritten again. The rule is unchanged; only its arithmetic is.
//
// AND A SURFACE THEY NAMED BUT DO NOT HAVE IS NOW REFUSED. Before
// three surfaces, an unrecognised `surface` fell through to the Hawlai
// site — so asking for "wordpress" on a business without one would
// have set the title on a different website entirely.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** The tool's own case, bounded at both ends. */
function metaCase(): string {
  const src = code(BRAIN);
  const start = src.indexOf('case "propose_page_meta": {');
  expect(start, "the propose_page_meta case is gone").toBeGreaterThan(-1);
  const end = src.indexOf('case "', start + 30);
  expect(end, "no case follows it, so this slice has no end").toBeGreaterThan(start);
  const block = src.slice(start, end);
  expect(block.length).toBeGreaterThan(2000);
  return block;
}

describe("1. THE SURFACES ARE A LIST, so a third one is not a rewrite", () => {
  it("THE LOAD-BEARING ONE: more than one means a question", () => {
    // ANCHORED ON THE CONDITION, not on the words inside it. A source
    // test cannot see a dead branch unless the branch's own condition
    // is what it reads — the lesson this file's neighbour records
    // after `if (false)` survived an assertion on `/bothExist/`.
    const b = metaCase();
    expect(b).toMatch(/if \(surfaces\.length > 1 && !askedSurface\) \{/);
    expect(b).toMatch(/needs_clarification: true/);
  });

  it("all three are offered by name, so the answer is one word", () => {
    const b = metaCase();
    for (const surface of ["hawlai", "shopify", "wordpress"]) {
      expect(b, `${surface} is not offered`).toMatch(new RegExp(`surface: "${surface}"`));
    }
  });

  it("ONE SURFACE IS NOT A QUESTION", () => {
    // Without this the clarify branch could be widened to fire always,
    // which reads as cautious and is a tool that never does anything.
    const b = metaCase();
    expect(b).toMatch(/surfaces\.length === 1 \? surfaces\[0\]\.surface : ""/);
  });

  it("and the question names the actual site, not merely the word WordPress", () => {
    // A merchant with one site still deserves to see which domain is
    // connected, because a wrong connection is exactly what this
    // question exists to catch.
    const b = metaCase();
    expect(b).toMatch(/Your WordPress site \(\$\{\(metaShopRow as any\)\.wordpress_site_url\}\)/);
  });
});

describe("2. A SURFACE THEY DO NOT HAVE IS REFUSED, never redirected", () => {
  it("THE LOAD-BEARING ONE: the check exists and names what they do have", () => {
    const b = metaCase();
    expect(b).toMatch(/if \(askedSurface && !surfaces\.some\(\(s\) => s\.surface === askedSurface\)\) \{/);
    expect(b).toMatch(/has no \$\{askedSurface\} site connected/);
    expect(b).toMatch(/What they do have/);
  });
});

describe("3. THE WORDPRESS BRANCH, and what it refuses to guess", () => {
  it("THE LOAD-BEARING ONE: it creates a wordpress action through the approval path", () => {
    const b = metaCase();
    expect(b).toMatch(/platform: "wordpress"/);
    expect(b).toMatch(/actionKey: "update_page_meta"/);
    // createPublishAction is the gate. Driving the adapter directly
    // would skip the card entirely.
    expect(b).toMatch(/createMetaAction\(/);
    expect(b).not.toMatch(/createWordPressPlatform\([^)]*\)\s*\.\s*(execute|preview)\(/);
  });

  it("THE SECRET IS DECRYPTED ONLY INSIDE THE BRANCH", () => {
    // The Shopify half records why: resolving credentials up front
    // decrypts a secret to decide a branch that may not need one, and
    // it broke every existing test of this tool when it was tried.
    const b = metaCase();
    const branch = b.indexOf("if (wantsWordPress) {");
    const creds = b.indexOf("wordpressCredentialsAdapter");
    expect(branch).toBeGreaterThan(-1);
    expect(creds, "the application password is resolved before the branch").toBeGreaterThan(branch);
  });

  it("THE SAME PAYLOAD KEYS AS THE OTHER TWO SURFACES", () => {
    // One ActionKey, one payload shape — what
    // publishPayloadContract.test.ts exists to keep true after
    // shopify.ts spent a day reading `metaTitle` while hawlaiSite read
    // `seoTitle`. A third surface is a third chance to drift.
    const b = metaCase();
    const branch = b.slice(b.indexOf("if (wantsWordPress) {"), b.indexOf("if (wantsShopify) {"));
    expect(branch.length).toBeGreaterThan(500);
    expect(branch).toMatch(/seoTitle: safeTitle/);
    expect(branch).toMatch(/metaDescription: safeDescription/);
    expect(branch).not.toMatch(/metaTitle\s*:/);
  });

  it("a share image is REFUSED, not silently dropped", () => {
    // An owner who asked for one and got no warning would believe it
    // was set. Yoast takes it from the featured image, which is not
    // this tool's to set.
    const branch = metaCase();
    const wp = branch.slice(branch.indexOf("if (wantsWordPress) {"), branch.indexOf("if (wantsShopify) {"));
    expect(wp).toMatch(/if \(shareImageUrl !== undefined\) \{/);
    expect(wp).toMatch(/no share-image field/);
  });

  it("A LOOSE PAGE MATCH ASKS, and only an exact one is remembered", () => {
    // settledSlots carries the turn-two failure this prevents, and
    // "the only one there is" is a target WE chose rather than an
    // answer he gave — so it must not skip a later question.
    const branch = metaCase();
    const wp = branch.slice(branch.indexOf("if (wantsWordPress) {"), branch.indexOf("if (wantsShopify) {"));
    expect(wp).toMatch(/clarifyWpPage\(/);
    expect(wp).toMatch(/if \(wpHit\.matchType !== "only_one"\) \{/);
    expect(wp).toMatch(/settleWpPageSlot\(/);
  });

  it("an unreadable site and an empty one get different answers", () => {
    const branch = metaCase();
    const wp = branch.slice(branch.indexOf("if (wantsWordPress) {"), branch.indexOf("if (wantsShopify) {"));
    expect(wp).toMatch(/wpHit\.reason === "unreadable"/);
    expect(wp).toMatch(/wpHit\.reason === "none_exist"/);
    // "pages or posts" since 23 November 2026: the resolver reads both
    // content types, so a site with posts and no pages is not empty.
    expect(wp).toMatch(/has no pages or posts yet/);
  });

  it("POSTS AND PAGES ARE RESOLVED TOGETHER, and the owner is not asked which", () => {
    // Yoast 28.9 does not expose its SEO fields for `page` through the
    // REST API, so a pages-only version of this could never work —
    // and posts are the surface most WordPress businesses rank with.
    // "Set the search title on my about page" is a sentence about a
    // thing, not about a WordPress taxonomy.
    const b = metaCase();
    const wp = b.slice(b.indexOf("if (wantsWordPress) {"), b.indexOf("if (wantsShopify) {"));
    expect(wp).toMatch(/resolveWordPressContent\(wpFor, askedWpPage\)/);
    expect(wp, "it still resolves only one content type").not.toMatch(/resolveWordPressResource\(/);
  });

  it("A TIE HANDS BACK THE QUALIFIED REFERENCE, not a bare slug", () => {
    // A post and a page can share a slug, so answering with a handle
    // alone could be ambiguous a second time — and "About us, About
    // us" is not a question anyone can answer.
    const b = metaCase();
    const wp = b.slice(b.indexOf("if (wantsWordPress) {"), b.indexOf("if (wantsShopify) {"));
    expect(wp).toMatch(/key: c\.id,/);
    expect(wp).toMatch(/\$\{kindOfRef\(c\.id\) \?\? "item"\}/);
    // And what is remembered is the reference too, for the same reason.
    expect(wp).toMatch(/settleWpPageSlot\(supabase, conversationId, "page", wpHit\.resource\.id,/);
  });

  it("A FAILED CREATE SAYS NOTHING WAS SAVED, in those words", () => {
    // The shape every other surface uses: an owner told their wording
    // is "being held" goes away believing it will land.
    const branch = metaCase();
    const wp = branch.slice(branch.indexOf("if (wantsWordPress) {"), branch.indexOf("if (wantsShopify) {"));
    expect(wp).toMatch(/Nothing was saved anywhere/);
    expect(wp).toMatch(/Do NOT tell them their wording is being held/);
  });
});

describe("4. THE SCHEMA MATCHES THE ROUTING", () => {
  it("THE LOAD-BEARING ONE: the enum is exactly the surfaces that are wired", () => {
    // A value the routing cannot handle is worse than a missing one:
    // the model passes it confidently and the tool refuses every time.
    const schema = (TOOLS as any[]).find((t) => t.name === "propose_page_meta")!;
    expect(schema.input_schema.properties.surface.enum).toEqual(["hawlai", "shopify", "wordpress"]);
  });

  it("and the description warns that Yoast may not be set up for the type", () => {
    // The live finding: on the sandbox, Yoast exposed its editable
    // fields for posts and not for pages, while being active for both.
    const schema = (TOOLS as any[]).find((t) => t.name === "propose_page_meta")!;
    expect(schema.input_schema.properties.surface.description).toMatch(/Yoast/);
  });
});

describe("5. THE CLAIMS GUARD STILL SITS ABOVE THE ROUTING", () => {
  it("THE LOAD-BEARING ONE: one guard, above all three branches", () => {
    // What the guard does to a sentence has nothing to do with where
    // the sentence is going, and duplicating it per platform is how
    // one copy drifts. A third surface is the moment that gets
    // forgotten.
    const b = metaCase();
    const guard = b.indexOf("guardOrMark({");
    const wordpress = b.indexOf("if (wantsWordPress) {");
    const shopify = b.indexOf("if (wantsShopify) {");
    expect(guard).toBeGreaterThan(-1);
    expect(guard, "the claims guard must run BEFORE the surface is chosen").toBeLessThan(wordpress);
    expect(guard).toBeLessThan(shopify);
    // Still exactly one call, so Decision C cannot exist in copies.
    expect(b.match(/guardOrMark\(/g) ?? []).toHaveLength(1);
  });

  it("and the reason is written down where the next reader will see it", () => {
    // Read WITH comments deliberately — rule 8's named exception, for
    // when the comment IS the thing being asserted.
    const withComments = sourceWithComments(BRAIN);
    const at = withComments.indexOf("WORDPRESS IS A THIRD SURFACE");
    expect(at, "the third surface is undocumented").toBeGreaterThan(-1);
  });
});

describe("6. rule 3 — no business, product or trade is named", () => {
  it("the new branch carries no tenant vocabulary", () => {
    const b = metaCase();
    const wp = b.slice(b.indexOf("if (wantsWordPress) {"), b.indexOf("if (wantsShopify) {"));
    expect(wp).not.toMatch(/candle|qaaf|kurta|salon|bakery|gruesome/i);
  });
});
