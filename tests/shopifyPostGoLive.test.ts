// Taking a drafted blog post live — from the chat, not from Shopify.
//
// THE GAP THE OWNER REPORTED, 22 November 2026. Approving a blog post
// created a DRAFT and the card said: "go live whenever you're ready by
// hitting Publish in Shopify." Every other content approval applies in
// full from the chat, so this one step sent him into another dashboard
// — against the chat-first principle the whole product is built on.
//
// IT WAS DELIBERATE, AND THE REASON WAS REVERSIBILITY, not caution
// about public content. `articleCreate` sends `isPublished: false`, and
// that is load-bearing three times over: a creation has no undo, a
// double write leaves a duplicate draft rather than two live posts, and
// `canHoldL1` refuses L1 to anything with no undo. What was missing was
// the SECOND step — the same shape as a Meta campaign, where every
// object is created PAUSED and activation is its own gated action.
//
// `update_post` WAS DECLARED AND IMPLEMENTED NOWHERE. It was in
// ActionKey, in ALWAYS_REQUIRES_APPROVAL, in ACTION_RISK and in
// executionPolicy.ts, with no branch in any platform — the slot was
// left and never filled. tests/shopifyPlatform.test.ts kept it out of
// `supports` for a stated reason: "a separate read and a separate
// staleness contract". It has both now.
//
// AND THIS STEP IS REVERSIBLE, which is why it could be built at all.
// `isPublished: false` is the exact inverse of `isPublished: true`.
// Un-creating a post is a deletion and is the reverse of nothing, so
// publish_post stays out of `undoes` and this key goes in. The owner
// settled the semantics on 22 November: undo UNPUBLISHES, never deletes.
//
// THE MUTATION IS UNVERIFIED AGAINST A LIVE STORE. `article(id:)` and
// its fields are live-confirmed — scripts/verify-shopify-content.ts has
// run that read against a real shop. `articleUpdate` and `isPublished`
// on ArticleUpdateInput come from the version-pinned 2026-07
// documentation and nothing else. This file's subject has three
// recorded live failures from exactly that gap, so the verification
// script gained a step for this in the same commit and the first real
// run is the test. Nothing below claims otherwise.

import { describe, it, expect } from "vitest";
import { createShopifyPlatform } from "@/lib/publish/platforms/shopify";
import type { PublishActionRecord } from "@/lib/publish/types";
import { code } from "./helpers/source";

const CREDS = { shop: "a-test-store.myshopify.com", accessToken: "shpat_x" };
const ARTICLE_ID = "gid://shopify/Article/1";

function sequence(bodies: Record<string, unknown>[]) {
  const sent: any[] = [];
  let i = 0;
  // text(), not json() — shopifyGraphQL reads the body as text so it can
  // report Shopify's own words when the reply is not JSON.
  const impl = (async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { impl, sent };
}

const platform = (impl: typeof fetch) => createShopifyPlatform({ getCredentials: async () => CREDS, fetchImpl: impl });

const articleBody = (over: Record<string, unknown> = {}) => ({
  data: {
    article: {
      id: ARTICLE_ID,
      title: "How these are made",
      handle: "how-these-are-made",
      isPublished: false,
      publishedAt: null,
      blog: { id: "gid://shopify/Blog/1", title: "News" },
      ...over,
    },
  },
});

const written = { data: { articleUpdate: { article: { id: ARTICLE_ID, isPublished: true }, userErrors: [] } } };

const action = (over: Partial<PublishActionRecord> = {}): PublishActionRecord =>
  ({
    id: "act-1",
    dealershipId: "d1",
    actionKey: "update_post",
    platform: "shopify",
    targetRef: ARTICLE_ID,
    targetLabel: "How these are made",
    requestedChanges: { published: true },
    preview: null,
    previewedAt: null,
    ...over,
  }) as unknown as PublishActionRecord;

/** The preview a real approval would carry, for the execute path. */
const previewed = (before: string, after: string) => ({
  summary: "s",
  target: { title: "How these are made", variantTitle: null, currentPrice: null, imageUrl: null },
  changes: [{ field: "isPublished", before, after }],
  warnings: [],
});

describe("1. THE PREVIEW SAYS WHICH POST, WHICH BLOG, AND WHICH DIRECTION", () => {
  it("THE LOAD-BEARING ONE: going live is named as going live", async () => {
    const { impl } = sequence([articleBody()]);
    const r = await platform(impl).preview(action());
    expect(r.ok, !r.ok ? r.reason : "").toBe(true);
    if (!r.ok) return;
    expect(r.preview.summary).toMatch(/goes live/);
    expect(r.preview.summary).toMatch(/How these are made/);
    expect(r.preview.summary).toMatch(/News/);
    // THE ONLY CONSEQUENCE THAT REACHES A STRANGER, said out loud.
    expect(r.preview.warnings.join(" ")).toMatch(/customers and search engines/);
  });

  it("the before-value is the real current state, because undo is built from it", async () => {
    const { impl } = sequence([articleBody({ isPublished: false })]);
    const r = await platform(impl).preview(action());
    expect(r.ok && r.preview.changes).toEqual([{ field: "isPublished", before: "false", after: "true" }]);
  });

  it("GOING BACK TO A DRAFT IS A DIFFERENT SENTENCE, and says nothing is deleted", async () => {
    const { impl } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).preview(action({ requestedChanges: { published: false } }));
    expect(r.ok, !r.ok ? r.reason : "").toBe(true);
    if (!r.ok) return;
    expect(r.preview.summary).toMatch(/back to a draft/);
    expect(r.preview.warnings.join(" ")).toMatch(/[Nn]othing is deleted/);
  });

  it("a no-op is said rather than hidden", async () => {
    const { impl } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).preview(action());
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/already live/);
  });

  it("PREVIEW NEVER WRITES — one read, no mutation", async () => {
    const { impl, sent } = sequence([articleBody()]);
    await platform(impl).preview(action());
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).not.toMatch(/articleUpdate|mutation/i);
  });

  it("a post that is gone is a refusal, not a write", async () => {
    const { impl, sent } = sequence([{ data: { article: null } }]);
    const r = await platform(impl).preview(action());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/no longer exists/i);
    expect(sent).toHaveLength(1);
  });

  it("A MISSING DIRECTION IS REFUSED, not guessed", async () => {
    const { impl } = sequence([articleBody()]);
    const r = await platform(impl).preview(action({ requestedChanges: {} }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/publish the post or unpublish/i);
  });

  it('THE STRING "false" IS NOT TRUE, which a loose cast would have published', async () => {
    // A JSON round trip through a jsonb column can hand this back as a
    // string. Boolean("false") is true, and the failure direction of
    // that cast is a live post nobody approved.
    const { impl, sent } = sequence([articleBody()]);
    const r = await platform(impl).preview(action({ requestedChanges: { published: "false" } as any }));
    expect(r.ok).toBe(false);
    expect(sent.length).toBeLessThanOrEqual(1);
  });
});

describe("2. EXECUTE RE-READS, like every other edit here", () => {
  it("THE LOAD-BEARING ONE: it writes only isPublished", async () => {
    const { impl, sent } = sequence([articleBody({ isPublished: false }), written]);
    const r = await platform(impl).execute(action({ preview: previewed("false", "true") as any, previewedAt: "2026-11-22T00:00:00Z" }));
    expect(r.ok, !r.ok && !("stale" in r) ? r.reason : "").toBe(true);
    const mutation = sent.find((s) => /articleUpdate/.test(JSON.stringify(s)));
    expect(mutation, "no articleUpdate was sent").toBeTruthy();
    // THE TITLE AND BODY ARE NOT ITS BUSINESS, whatever the approval
    // row happens to carry.
    expect(mutation.variables.article).toEqual({ isPublished: true });
    expect(mutation.variables.id).toBe(ARTICLE_ID);
  });

  it("A POST PUBLISHED BY HAND IN THE MEANTIME IS STALE, not overwritten", async () => {
    // The approval was for a TRANSITION, not for a final state.
    const { impl, sent } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).execute(action({ preview: previewed("false", "true") as any, previewedAt: "2026-11-22T00:00:00Z" }));
    // Already at the target reads as a no-op rather than a conflict,
    // and either way nothing is written.
    expect(sent.filter((s) => /articleUpdate/.test(JSON.stringify(s)))).toHaveLength(0);
    expect(r.ok && (r.platformResponse as any)?.skipped).toMatch(/already live/);
  });

  it("AND A GENUINE CONFLICT IS REPORTED AS STALE", async () => {
    // Asked to unpublish a post the preview saw as live, and somebody
    // has since made it a draft: the transition no longer applies.
    const { impl, sent } = sequence([articleBody({ isPublished: false })]);
    const r = await platform(impl).execute(
      action({ requestedChanges: { published: true }, preview: previewed("true", "false") as any, previewedAt: "2026-11-22T00:00:00Z" })
    );
    expect(!r.ok && (r as any).stale).toBe(true);
    expect(sent.filter((s) => /articleUpdate/.test(JSON.stringify(s)))).toHaveLength(0);
  });

  it("no preview means nothing to verify against, so nothing is written", async () => {
    const { impl, sent } = sequence([articleBody()]);
    const r = await platform(impl).execute(action({ preview: { ...previewed("false", "true"), changes: [] } as any, previewedAt: "x" }));
    expect(r.ok).toBe(false);
    expect(sent.filter((s) => /articleUpdate/.test(JSON.stringify(s)))).toHaveLength(0);
  });
});

describe("3. UNDO UNPUBLISHES, AND NEVER DELETES — the owner's decision", () => {
  it("THE LOAD-BEARING ONE: it proposes the prior state, not a deletion", async () => {
    const { impl, sent } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).undo!(action({ preview: previewed("false", "true") as any }));
    expect(r.ok, !r.ok ? r.reason : "").toBe(true);
    expect(r.ok && r.requestedChanges).toEqual({ published: false });
    expect(JSON.stringify(sent)).not.toMatch(/[Dd]elete/);
  });

  it("it says in words that nothing is deleted", async () => {
    const { impl } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).undo!(action({ preview: previewed("false", "true") as any }));
    expect(r.ok && r.warnings.join(" ")).toMatch(/[Nn]othing is deleted/);
  });

  it("A POST THAT WAS LIVE BEFORE HAWLAI TOUCHED IT GOES BACK TO LIVE", async () => {
    // Not vacuous, and the direction that matters: an undo which always
    // unpublished would take down a post the owner had published
    // themselves before ever asking Hawlai about it.
    const { impl } = sequence([articleBody({ isPublished: false })]);
    const r = await platform(impl).undo!(action({ preview: previewed("true", "false") as any }));
    expect(r.ok && r.requestedChanges).toEqual({ published: true });
  });

  it("NOTHING RECORDED MEANS NOTHING OFFERED, rather than a guessed prior state", async () => {
    const { impl } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).undo!(action({ preview: { ...previewed("false", "true"), changes: [] } as any }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/didn't record whether the post was live/i);
  });

  it("an empty before-value is not read as false", async () => {
    // "" and "false" are different values, and reading a blank as
    // false is an undo that unpublishes a post nobody asked about.
    const { impl } = sequence([articleBody({ isPublished: true })]);
    const r = await platform(impl).undo!(action({ preview: previewed("", "true") as any }));
    expect(r.ok).toBe(false);
  });
});

describe("4. THE DISTINCTION FROM publish_post IS STILL THERE", () => {
  it("THE LOAD-BEARING ONE: creating stays one-way, publishing does not", () => {
    const { impl } = sequence([articleBody()]);
    const p = platform(impl);
    expect(p.undoes, "un-creating a post is a deletion, and that has not changed").not.toContain("publish_post");
    expect(p.undoes, "publishing has an exact inverse, so it is undoable").toContain("update_post");
    expect(p.supports).toContain("update_post");
  });

  it("and a created post is still created UNPUBLISHED", () => {
    // The whole second step exists because of this, so a change here
    // would make this file pointless rather than wrong.
    const src = code("src/lib/publish/platforms/shopify.ts");
    const create = src.indexOf('action.actionKey === "publish_post"', src.indexOf("async execute"));
    expect(create, "the create branch is gone").toBeGreaterThan(-1);
    const end = src.indexOf("return { ok: true, platformResponse: result.data };", create);
    expect(end).toBeGreaterThan(create);
    expect(src.slice(create, end)).toMatch(/isPublished: false,/);
  });
});

describe("5. rule 3 — no business, product or trade is named", () => {
  it("the new branches carry no tenant vocabulary", () => {
    const src = code("src/lib/publish/platforms/shopify.ts");
    const start = src.indexOf("const ARTICLE_QUERY");
    const end = src.indexOf("const COLLECTION_QUERY", start);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toMatch(/candle|qaaf|kurta|dealership|salon|bakery/i);
  });
});
