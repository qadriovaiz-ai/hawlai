// Shopify pages and blog posts — 3.2, 20 November 2026.
//
// `write_content` has been granted since 4 September 2026 and nothing
// used it. These reuse the ActionKeys the built-in site already
// defines — `update_page_text` and `update_page_meta` — rather than
// inventing Shopify-shaped twins, so the tool layer, the approval
// registry and undo all behave the same whichever surface the owner's
// page lives on.
//
// AND publish_post IS NOW SUPPORTED, reversing a judgement recorded in
// this adapter that "Shopify is not a CMS in the sense those mean".
// Shopify has Blog and Article objects and the scope covers them.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createShopifyPlatform } from "@/lib/publish/platforms/shopify";
import type { PublishActionRecord } from "@/lib/publish/types";

const CREDS = { shop: "hawlaitest.myshopify.com", accessToken: "tok" };

/** A fetch that answers each GraphQL call with the next scripted body. */
function sequence(bodies: Record<string, unknown>[]) {
  const sent: any[] = [];
  let i = 0;
  // `text()`, not `json()` — shopifyGraphQL reads the body as text so
  // it can report Shopify's own words when the reply is not JSON. The
  // first version of this fake used json() and every call threw.
  const impl = (async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { impl, sent };
}

const platform = (impl: typeof fetch) =>
  createShopifyPlatform({ getCredentials: async () => CREDS, fetchImpl: impl });

const action = (over: Partial<PublishActionRecord> = {}): PublishActionRecord =>
  ({
    id: "act-1",
    dealershipId: "d1",
    actionKey: "update_page_text",
    targetRef: "gid://shopify/Page/1",
    requestedChanges: {},
    preview: null,
    ...over,
  }) as PublishActionRecord;

// SHAPED LIKE THE REAL SCHEMA, which it was not until 20 November
// 2026. This held `seo: { title, description }` — and `Page` has no
// `seo` field in the 2026-07 Admin API, so every test here passed
// against a page that cannot exist. A live read failed on the first
// try with "Field 'seo' doesn't exist on type 'Page'".
//
// Page SEO is two metafields in the `global` namespace, aliased by
// PAGE_QUERY. `id` is present because an existing metafield is updated
// by id rather than by namespace+key.
const PAGE = {
  id: "gid://shopify/Page/1",
  title: "About us",
  handle: "about-us",
  body: "<p>We pour candles.</p>",
  isPublished: true,
  seoTitle: { id: "gid://shopify/Metafield/11", value: "About Qaaf" },
  seoDescription: { id: "gid://shopify/Metafield/12", value: "Hand poured candles" },
};

const pageBody = (over: Record<string, unknown> = {}) => ({ data: { page: { ...PAGE, ...over } } });

describe("1. A PAGE'S TEXT", () => {
  it("THE LOAD-BEARING ONE: the whole prior body is the before-value", async () => {
    // Undo is built from preview.changes[].before and there is no
    // history table. Anything less than the complete prior body is an
    // undo that loses text.
    const { impl } = sequence([pageBody()]);
    const r = await platform(impl).preview(
      action({ requestedChanges: { html: "<p>We hand pour candles in Lucknow.</p>" } })
    );
    expect(r.ok).toBe(true);
    const change = r.ok && r.preview.changes.find((c) => c.field === "body");
    expect(change && change.before).toBe("<p>We pour candles.</p>");
    expect(change && change.after).toBe("<p>We hand pour candles in Lucknow.</p>");
  });

  it("names the page the merchant will recognise, not the id", async () => {
    const { impl } = sequence([pageBody()]);
    const r = await platform(impl).preview(action({ requestedChanges: { html: "x" } }));
    expect(r.ok && r.preview.summary).toMatch(/About us/);
    expect(r.ok && r.preview.summary).toMatch(/\/pages\/about-us/);
  });

  it("AN UNPUBLISHED PAGE IS SAID SO, because the edit will not be visible", async () => {
    const { impl } = sequence([pageBody({ isPublished: false })]);
    const r = await platform(impl).preview(action({ requestedChanges: { html: "x" } }));
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/not published/i);
  });

  it("no text given is a refusal, not an empty edit", async () => {
    const { impl } = sequence([pageBody()]);
    expect((await platform(impl).preview(action({ requestedChanges: {} }))).ok).toBe(false);
  });

  it("a page that has gone is a refusal", async () => {
    const { impl } = sequence([{ data: { page: null } }]);
    const r = await platform(impl).preview(action({ requestedChanges: { html: "x" } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/no longer exists/);
  });
});

describe("2. THE SEARCH TITLE AND DESCRIPTION", () => {
  const meta = (changes: Record<string, unknown>) =>
    action({ actionKey: "update_page_meta", requestedChanges: changes });

  it("either half may change on its own", async () => {
    const { impl } = sequence([pageBody()]);
    const r = await platform(impl).preview(meta({ metaTitle: "Qaaf Candles — About" }));
    expect(r.ok && r.preview.changes.map((c) => c.field)).toEqual(["seoTitle"]);
  });

  it("THE LOAD-BEARING ONE: writing one half carries the other through", async () => {
    // The INTENT is unchanged — sending only the title must not lose a
    // description nobody asked to remove. The MECHANISM changed: this
    // asserted an `seo` object, which does not exist on a Page.
    //
    // Metafields upsert per namespace+key, so omitting one would not
    // actually blank it. Both are still sent, so this file holds one
    // rule rather than two that differ by resource — and a
    // Collection's `seo` input genuinely does replace the whole
    // object.
    const { impl, sent } = sequence([
      pageBody(),
      pageBody(),
      { data: { pageUpdate: { page: { id: PAGE.id }, userErrors: [] } } },
    ]);
    const p = platform(impl);
    const previewed = await p.preview(meta({ metaTitle: "New title" }));
    expect(previewed.ok).toBe(true);
    await p.execute(action({ actionKey: "update_page_meta", requestedChanges: { metaTitle: "New title" }, preview: previewed.ok ? previewed.preview : null }));
    const mutation = sent[sent.length - 1];
    // NO `seo` KEY AT ALL. Sending one is the bug this whole change
    // exists to remove, and it would be accepted by a mock for ever.
    expect(mutation.variables.page.seo).toBeUndefined();
    const written = mutation.variables.page.metafields as any[];
    // Updated BY ID, because both already exist on this page.
    expect(written).toEqual([
      { id: "gid://shopify/Metafield/11", value: "New title" },
      { id: "gid://shopify/Metafield/12", value: "Hand poured candles" },
    ]);
  });

  it("creates the metafield with its type when the page has never had one", async () => {
    // A first write has no id to update, so it must carry
    // namespace/key/type or Shopify rejects it. title_tag is a single
    // line and description_tag is not, and sending the wrong type
    // fails against any existing definition.
    const { impl, sent } = sequence([
      pageBody({ seoTitle: null, seoDescription: null }),
      pageBody({ seoTitle: null, seoDescription: null }),
      { data: { pageUpdate: { page: { id: PAGE.id }, userErrors: [] } } },
    ]);
    const p = platform(impl);
    const previewed = await p.preview(meta({ metaTitle: "First title", metaDescription: "First description" }));
    expect(previewed.ok).toBe(true);
    await p.execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { metaTitle: "First title", metaDescription: "First description" },
        preview: previewed.ok ? previewed.preview : null,
      })
    );
    expect(sent[sent.length - 1].variables.page.metafields).toEqual([
      { namespace: "global", key: "title_tag", type: "single_line_text_field", value: "First title" },
      { namespace: "global", key: "description_tag", type: "multi_line_text_field", value: "First description" },
    ]);
  });

  it("DOES NOT WRITE AN EMPTY VALUE to carry a half that was never set", async () => {
    // Shopify rejects an empty metafield value, which would fail the
    // whole write — so a page with no description must not gain an
    // empty one just because the title changed.
    const { impl, sent } = sequence([
      pageBody({ seoDescription: null }),
      pageBody({ seoDescription: null }),
      { data: { pageUpdate: { page: { id: PAGE.id }, userErrors: [] } } },
    ]);
    const p = platform(impl);
    const previewed = await p.preview(meta({ metaTitle: "Only a title" }));
    await p.execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { metaTitle: "Only a title" },
        preview: previewed.ok ? previewed.preview : null,
      })
    );
    const written = sent[sent.length - 1].variables.page.metafields as any[];
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ value: "Only a title" });
  });

  it("A PAGE EDIT NEVER TOUCHES THE SEARCH LISTING", async () => {
    // The separation update_page_text and update_page_meta exist to
    // enforce. A body write that also carried metafields would make
    // "chat changed my homepage" and "chat changed what Google shows"
    // the same audit record.
    const { impl, sent } = sequence([
      pageBody(),
      pageBody(),
      { data: { pageUpdate: { page: { id: PAGE.id }, userErrors: [] } } },
    ]);
    const p = platform(impl);
    const previewed = await p.preview(
      action({ actionKey: "update_page_text", requestedChanges: { html: "<p>New words.</p>" } })
    );
    expect(previewed.ok).toBe(true);
    await p.execute(
      action({
        actionKey: "update_page_text",
        requestedChanges: { html: "<p>New words.</p>" },
        preview: previewed.ok ? previewed.preview : null,
      })
    );
    const page = sent[sent.length - 1].variables.page;
    expect(page.body).toBe("<p>New words.</p>");
    expect(page.metafields).toBeUndefined();
    expect(page.seo).toBeUndefined();
  });

  it("THE QUERY ASKS FOR NOTHING A PAGE DOES NOT HAVE", async () => {
    // The guard against the whole class. `Page` has no `seo` field in
    // the 2026-07 schema, and one bad field in a shared query broke the
    // page TEXT read too — the body write was valid all along and could
    // never get past its own preview.
    const { impl, sent } = sequence([pageBody()]);
    await platform(impl).preview(meta({ metaTitle: "x" }));
    const query = String(sent[0].query);
    expect(query).toMatch(/metafield\(namespace: "global", key: "title_tag"\)/);
    expect(query).toMatch(/metafield\(namespace: "global", key: "description_tag"\)/);
    // The field that did not exist.
    expect(query).not.toMatch(/\bseo\s*\{/);
  });

  it("neither half given is a refusal", async () => {
    const { impl } = sequence([pageBody()]);
    expect((await platform(impl).preview(meta({}))).ok).toBe(false);
  });
});

describe("3. THE SAME THREE STEPS AS THE PRICE PATH", () => {
  const previewFor = (before: string, after: string) => ({
    summary: "s",
    target: { title: "About us", variantTitle: null, currentPrice: null, imageUrl: null },
    changes: [{ field: "body", before, after }],
    warnings: [],
  });

  it("THE LOAD-BEARING ONE: already at the target is a no-op, not a stale report", async () => {
    // Checked BEFORE staleness, and the order is the whole of retry
    // safety: a successful write followed by a timeout and a retry
    // must not read as needing re-approval.
    const { impl, sent } = sequence([pageBody({ body: "<p>new</p>" })]);
    const r = await platform(impl).execute(
      action({ requestedChanges: { html: "<p>new</p>" }, preview: previewFor("<p>old</p>", "<p>new</p>") as any })
    );
    expect(r.ok).toBe(true);
    expect(r.ok && (r.platformResponse as any).skipped).toMatch(/already reads this way/);
    // And nothing was written.
    expect(sent).toHaveLength(1);
  });

  it("THE PAGE MOVING UNDERNEATH IS STALE, AND WRITES NOTHING", async () => {
    // A merchant can edit their own page in another tab between the
    // preview and the approval. This is the case `hawlai_site` could
    // never have.
    const { impl, sent } = sequence([pageBody({ body: "<p>they edited it</p>" })]);
    const r = await platform(impl).execute(
      action({ requestedChanges: { html: "<p>new</p>" }, preview: previewFor("<p>old</p>", "<p>new</p>") as any })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.stale).toBe(true);
    // Narrowed by the discriminant rather than cast: the stale arm of
    // ExecuteResult carries `changed` and no `reason`, and reaching
    // through a union for whichever field is wanted is how a refusal
    // gets read as a result.
    expect(!r.ok && "changed" in r && r.changed[0]).toMatchObject({
      before: "<p>old</p>",
      after: "<p>they edited it</p>",
    });
    expect(sent).toHaveLength(1);
  });

  it("an unchanged page is written", async () => {
    const { impl, sent } = sequence([pageBody(), { data: { pageUpdate: { page: { id: PAGE.id }, userErrors: [] } } }]);
    const r = await platform(impl).execute(
      action({ requestedChanges: { html: "<p>new</p>" }, preview: previewFor(PAGE.body, "<p>new</p>") as any })
    );
    expect(r.ok).toBe(true);
    expect(sent[1].variables.page.body).toBe("<p>new</p>");
  });

  it("A SHOPIFY userErrors REPLY IS A FAILURE, not a success", async () => {
    // Shopify declines a write with HTTP 200, empty `errors` and a
    // populated `userErrors`.
    const { impl } = sequence([
      pageBody(),
      // `field` is an ARRAY in Shopify's UserError, and the first version
      // of this passed a string — shopifyMutation joins it, so the mock
      // threw instead of the assertion failing.
      { data: { pageUpdate: { page: null, userErrors: [{ field: ["body"], message: "Body is too long" }] } } },
    ]);
    const r = await platform(impl).execute(
      action({ requestedChanges: { html: "<p>new</p>" }, preview: previewFor(PAGE.body, "<p>new</p>") as any })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && "reason" in r && r.reason).toMatch(/too long/i);
  });

  it("an action that was never previewed is refused", async () => {
    const { impl } = sequence([pageBody()]);
    expect((await platform(impl).execute(action({ requestedChanges: { html: "x" }, preview: null }))).ok).toBe(false);
  });
});

describe("4. A NEW BLOG POST", () => {
  const blogs = (nodes: unknown[]) => ({ data: { blogs: { nodes } } });
  const ONE = [{ id: "gid://shopify/Blog/9", title: "News", handle: "news" }];
  const post = (over: Record<string, unknown> = {}) =>
    action({ actionKey: "publish_post", targetRef: null, requestedChanges: { title: "Diwali hours", html: "<p>Open late.</p>", ...over } });

  it("THE LOAD-BEARING ONE: it is created UNPUBLISHED, and says so", async () => {
    // Nothing goes live on approval. Publishing is a separate step the
    // owner takes in Shopify, which is what makes this safe to approve
    // from a phone.
    // THREE SCRIPTED REPLIES, because execute re-reads the blogs
    // before writing: preview's read, execute's read, then the
    // mutation. With two, execute's read fell through to the last body
    // and the adapter correctly refused for want of a blog — the test
    // was wrong, not the code.
    const { impl, sent } = sequence([
      blogs(ONE),
      blogs(ONE),
      { data: { articleCreate: { article: { id: "a1" }, userErrors: [] } } },
    ]);
    const p = platform(impl);
    const previewed = await p.preview(post());
    expect(previewed.ok && previewed.preview.warnings.join(" ")).toMatch(/created unpublished/i);

    // A PREVIEW IS STILL REQUIRED, creation or not — execute refuses an
    // action nobody approved, and the first version of this test
    // omitted it and read the refusal as a bug.
    const approved = { ...post(), preview: previewed.ok ? previewed.preview : null } as any;
    const done = await p.execute(approved);
    expect(done.ok).toBe(true);
    const mutation = sent[sent.length - 1];
    expect(mutation.variables.article.isPublished).toBe(false);
  });

  it("A CREATION HAS NO BEFORE-VALUE, and does not pretend to", async () => {
    const { impl } = sequence([blogs(ONE)]);
    const r = await platform(impl).preview(post());
    expect(r.ok && r.preview.changes[0]).toMatchObject({ field: "article", before: null });
  });

  it("A STORE WITH NO BLOG IS TOLD WHAT TO DO, not given an error", async () => {
    const { impl } = sequence([blogs([])]);
    const r = await platform(impl).preview(post());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/no blog yet/i);
    expect(!r.ok && r.reason).toMatch(/Online Store/);
  });

  it("THE LOAD-BEARING ONE: SEVERAL BLOGS MEANS ASKING, NOT PICKING", async () => {
    // Publishing to a blog nobody named is the same class of mistake
    // as resolving the wrong product.
    const { impl } = sequence([blogs([...ONE, { id: "gid://shopify/Blog/10", title: "Recipes", handle: "recipes" }])]);
    const r = await platform(impl).preview(post());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/2 blogs/);
    expect(!r.ok && r.reason).toMatch(/News, Recipes/);
  });

  it("and a named blog is used", async () => {
    const { impl } = sequence([blogs([...ONE, { id: "gid://shopify/Blog/10", title: "Recipes", handle: "recipes" }])]);
    const r = await platform(impl).preview(
      action({ actionKey: "publish_post", targetRef: "recipes", requestedChanges: { title: "t", html: "<p>b</p>" } })
    );
    expect(r.ok && r.preview.summary).toMatch(/Recipes/);
  });

  it("AN UNREADABLE BLOG LIST IS NOT AN EMPTY ONE", async () => {
    // "Could not read your blogs" and "this store has no blog" lead to
    // different sentences, and only one is the merchant's to fix.
    const impl = (async () => ({ ok: false, status: 500, text: async () => "" })) as unknown as typeof fetch;
    const r = await platform(impl).preview(post());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Couldn't read/);
    expect(!r.ok && r.reason).toMatch(/Nothing was created/);
  });

  it("a post with no title or no text is refused", async () => {
    const { impl } = sequence([blogs(ONE)]);
    const p = platform(impl);
    expect((await p.preview(post({ title: "   " }))).ok).toBe(false);
    expect((await p.preview(post({ html: "" }))).ok).toBe(false);
  });
});

describe("5. SUPPORTS AND EXECUTE CANNOT DISAGREE", () => {
  it("THE LOAD-BEARING ONE: execute reads the same list the tool layer reads", async () => {
    // execute used to test `actionKey !== "update_product_price"`, so a
    // key could be declared in supports and still refused here. Two
    // lists drift the moment either changes.
    const { impl } = sequence([{}]);
    const p = platform(impl);
    for (const key of p.supports) {
      const r = await p.execute(action({ actionKey: key, preview: null }));
      // Refused for want of a preview or a target — never for "not built".
      expect(!r.ok && "reason" in r && r.reason, key).not.toMatch(/not built yet/);
    }
  });

  it("and an unsupported key is still refused by both", async () => {
    const { impl } = sequence([{}]);
    const p = platform(impl);
    expect((await p.preview(action({ actionKey: "create_discount_code" }))).ok).toBe(false);
    const e = await p.execute(action({ actionKey: "create_discount_code" }));
    expect(!e.ok && "reason" in e && e.reason).toMatch(/not built yet/);
  });
});

describe("6. UNDO: THE DECLARATION AND THE METHOD MUST AGREE", () => {
  const previewed = {
    summary: "s",
    target: { title: "About us", variantTitle: null, currentPrice: null, imageUrl: null },
    changes: [{ field: "body", before: "<p>was</p>", after: "<p>now</p>" }],
    warnings: [],
  };

  it("THE LOAD-BEARING ONE: everything it CLAIMS to undo, it actually undoes", () => {
    // Two mutations survived without this: declaring
    // update_product_price as undoable, and deleting the guard that
    // refuses keys the method cannot handle. `undoes` is what the
    // autonomy layer reads, so a declaration the method does not
    // honour is a promise about reversibility that nothing keeps.
    const { impl } = sequence([pageBody()]);
    const p = platform(impl);
    expect(p.undoes).toEqual(["update_page_text", "update_page_meta", "update_collection_text"]);
    // And it is a subset of what the platform can do at all.
    for (const key of p.undoes ?? []) expect(p.supports).toContain(key);
  });

  it("A KEY IT DOES NOT CLAIM IS REFUSED BY THE METHOD TOO", async () => {
    const { impl } = sequence([pageBody()]);
    const p = platform(impl);
    for (const key of ["update_product_price", "publish_post"] as const) {
      const r = await p.undo!(action({ actionKey: key, preview: previewed as any }));
      expect(r.ok, key).toBe(false);
      expect(!r.ok && r.reason, key).toMatch(/nothing to put back/i);
    }
  });

  it("PUBLISH_POST IS NOT UNDOABLE, and that is a decision", async () => {
    // Un-creating a post is a deletion, and a deletion is not the
    // reverse of a creation in any sense an owner would accept — the
    // article may have been edited since. It is created unpublished,
    // so nothing went live to take back.
    const { impl } = sequence([pageBody()]);
    expect(platform(impl).undoes).not.toContain("publish_post");
  });

  it("IT PROPOSES THE EXACT PRIOR TEXT, word for word", async () => {
    const { impl } = sequence([pageBody()]);
    const r = await platform(impl).undo!(action({ actionKey: "update_page_text", preview: previewed as any }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.requestedChanges.html).toBe("<p>was</p>");
    // from and to are the REVERSE journey: what it says now goes back.
    expect(r.ok && r.changed[0]).toMatchObject({ what: "Page text", from: "<p>now</p>", to: "<p>was</p>" });
  });

  it("AN EDIT THAT RECORDED NOTHING IS NOT OFFERED AS AN UNDO", async () => {
    // An undo card with no prior value is a button that would blank
    // the page.
    const { impl } = sequence([pageBody()]);
    const r = await platform(impl).undo!(
      action({ actionKey: "update_page_text", preview: { ...previewed, changes: [] } as any })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/didn't record what the page said before/);
  });

  it("and a page that has gone cannot be put back", async () => {
    const { impl } = sequence([{ data: { page: null } }]);
    const r = await platform(impl).undo!(action({ actionKey: "update_page_text", preview: previewed as any }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/isn't in Shopify any more/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// COLLECTIONS — 3.3
// ─────────────────────────────────────────────────────────────────────

const COLLECTION = {
  id: "gid://shopify/Collection/9",
  title: "Diwali gifting",
  handle: "diwali-gifting",
  descriptionHtml: "<p>Soy candles for the festival of lights.</p>",
  productsCount: { count: 12 },
};

const collBody = (over: Record<string, unknown> = {}) => ({
  data: { collection: { ...COLLECTION, ...over } },
});

const collAction = (over: Partial<PublishActionRecord> = {}) =>
  action({
    actionKey: "update_collection_text",
    targetRef: COLLECTION.id,
    requestedChanges: { html: "<p>Gifting sets, hand poured.</p>" },
    ...over,
  });

/** A preview that recorded the whole prior description. */
const collPreview = (before: string | null, after: string) =>
  ({ summary: "", changes: [{ field: "descriptionHtml", before, after }], warnings: [] }) as any;

describe("7. A COLLECTION PAGE'S DESCRIPTION", () => {
  it("is a key of its own, NOT update_page_text", () => {
    // The load-bearing reason, and it is a safety property rather than
    // tidiness: `update_page_meta` is the single key on the L2
    // unattended-autonomy allowlist, and growth/measures.ts scores
    // both page keys against `page_events` — a table that holds the
    // business's own Hawlai site and nothing else. Letting a
    // merchant's live storefront ride in on either key would have
    // widened unattended autonomy onto a real shop and scored the
    // result against visits it cannot see.
    const p = platform(sequence([collBody()]).impl);
    expect(p.supports).toContain("update_collection_text");
  });

  it("previews the WHOLE prior description as the before-value", async () => {
    // Undo is built from preview.changes[].before, so anything less
    // than the complete prior text is an undo that loses words.
    const { impl, sent } = sequence([collBody()]);
    const r = await platform(impl).preview(collAction());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.changes).toEqual([
      { field: "descriptionHtml", before: COLLECTION.descriptionHtml, after: "<p>Gifting sets, hand poured.</p>" },
    ]);
    expect(r.preview.summary).toContain("Diwali gifting");
    expect(r.preview.summary).toContain("/collections/diwali-gifting");
    // One call, and it is a read.
    expect(sent.length).toBe(1);
    expect(sent[0].query).not.toContain("mutation");
  });

  it("WARNS when the collection holds no products, without blocking", async () => {
    // Not an error, but almost always a sign the wrong collection was
    // resolved — and the preview is the only place that can be caught.
    const r = await platform(sequence([collBody({ productsCount: { count: 0 } })]).impl).preview(collAction());
    expect(r.ok).toBe(true);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/no products/i);
  });

  it("warns when it already reads that way", async () => {
    const r = await platform(sequence([collBody()]).impl).preview(
      collAction({ requestedChanges: { html: COLLECTION.descriptionHtml } })
    );
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/already/i);
  });

  it("refuses a collection that has gone, and one with no new text", async () => {
    const gone = await platform(sequence([{ data: { collection: null } }]).impl).preview(collAction());
    expect(gone.ok).toBe(false);
    const empty = await platform(sequence([collBody()]).impl).preview(collAction({ requestedChanges: {} }));
    expect(empty.ok).toBe(false);
  });

  it("THE LOAD-BEARING ONE: refuses when the text moved since the preview", async () => {
    // Approved as A becomes B. Someone else wrote C in between.
    // Applying the approved intent would erase words nobody saw.
    const { impl, sent } = sequence([collBody({ descriptionHtml: "<p>Someone else rewrote this.</p>" })]);
    const r = await platform(impl).execute(
      collAction({ preview: collPreview(COLLECTION.descriptionHtml, "<p>new</p>") })
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.stale).toBe(true);
    // And crucially: NOTHING was written. One read, no mutation.
    expect(sent.length).toBe(1);
  });

  it("is idempotent: already at the target writes nothing", async () => {
    // What makes a retry safe. A timeout leaves the caller unable to
    // tell whether the write landed, so the retry must be harmless —
    // and this check comes BEFORE the staleness one, or a successful
    // write plus a retry would report a succeeded action as stale.
    const { impl, sent } = sequence([collBody({ descriptionHtml: "<p>new</p>" })]);
    const r = await platform(impl).execute(
      collAction({ preview: collPreview(COLLECTION.descriptionHtml, "<p>new</p>") })
    );
    expect(r.ok).toBe(true);
    expect(sent.length).toBe(1);
  });

  it("writes with the id INSIDE the collection argument, never as `input`", async () => {
    // As of API 2026-07 `collectionUpdate` takes
    // `collection: CollectionUpdateInput!` and the `input:` form is
    // Deprecated. Several of Shopify's own examples still show the old
    // one, which is exactly how a copied snippet gets in.
    const { impl, sent } = sequence([
      collBody(),
      { data: { collectionUpdate: { collection: { id: COLLECTION.id }, userErrors: [] } } },
    ]);
    const r = await platform(impl).execute(
      collAction({ preview: collPreview(COLLECTION.descriptionHtml, "<p>new</p>") })
    );
    expect(r.ok).toBe(true);
    const mutation = sent[1];
    expect(mutation.query).toContain("collectionUpdate(collection:");
    expect(mutation.query).not.toContain("collectionUpdate(input:");
    expect(mutation.variables.collection).toEqual({ id: COLLECTION.id, descriptionHtml: "<p>new</p>" });
    // Nothing else is sent. A CollectionUpdateInput carrying only the
    // changed field leaves the rest alone.
    expect(Object.keys(mutation.variables.collection).sort()).toEqual(["descriptionHtml", "id"]);
  });

  it("surfaces a DECLINED write instead of reporting success", async () => {
    const { impl } = sequence([
      collBody(),
      {
        data: {
          collectionUpdate: {
            collection: null,
            userErrors: [{ field: ["descriptionHtml"], message: "Body is too long" }],
          },
        },
      },
    ]);
    const r = await platform(impl).execute(
      collAction({ preview: collPreview(COLLECTION.descriptionHtml, "<p>new</p>") })
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && !r.stale && r.reason).toContain("Body is too long");
  });

  it("puts the exact prior text back, word for word", async () => {
    const { impl } = sequence([collBody()]);
    const r = await platform(impl).undo!(collAction({ preview: collPreview("<p>was</p>", "<p>now</p>") }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.requestedChanges.html).toBe("<p>was</p>");
    expect(r.ok && r.changed[0]).toMatchObject({ what: "Collection text", from: "<p>now</p>", to: "<p>was</p>" });
  });

  it("AN EDIT THAT RECORDED NOTHING IS NOT OFFERED AS AN UNDO", async () => {
    // An undo card with no prior value is a button that would blank
    // the collection.
    const { impl } = sequence([collBody()]);
    const r = await platform(impl).undo!(
      collAction({ preview: { summary: "", changes: [], warnings: [] } as any })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/didn't record what the page said before/);
  });

  it("and a collection that has gone cannot be put back", async () => {
    const { impl } = sequence([{ data: { collection: null } }]);
    const r = await platform(impl).undo!(collAction({ preview: collPreview("<p>was</p>", "<p>now</p>") }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/isn't in Shopify any more/);
  });

  it("THE UNDO GUARD READS `undoes`, so the two cannot drift", async () => {
    // This method named its two keys inline until 3.3. `undoes` is
    // what the autonomy layer reads when it decides an action is
    // reversible, so a key it gains must be one this method obeys —
    // and a key declared there with no branch has to fail loudly
    // rather than fall through and read the wrong object.
    const p = platform(sequence([collBody()]).impl);
    expect((p.undoes ?? []).length).toBeGreaterThan(0);
    for (const key of p.undoes ?? []) expect(p.supports).toContain(key);
    let refused = 0;
    for (const key of p.supports) {
      if ((p.undoes ?? []).includes(key)) continue;
      const r = await p.undo!(
        collAction({ actionKey: key, preview: { summary: "", changes: [], warnings: [] } as any })
      );
      expect(r.ok, `${key} is not in undoes, so undo must refuse it`).toBe(false);
      expect(!r.ok && r.reason, key).toMatch(/nothing to put back/i);
      refused += 1;
    }
    // Not vacuous: there IS at least one supported-but-not-undoable
    // key, so the loop above actually ran.
    expect(refused).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// FILES — 3.3b
// ─────────────────────────────────────────────────────────────────────

const STORAGE = "https://abcdefgh.supabase.co";
const OURS = `${STORAGE}/storage/v1/object/public/ad-creatives/d1/diwali.png`;

const fileOk = (over: Record<string, unknown> = {}) => ({
  data: {
    fileCreate: {
      files: [{ id: "gid://shopify/MediaImage/5", fileStatus: "READY", alt: "Diwali candles", image: { url: "https://cdn.shopify.com/s/files/1/diwali.png" }, ...over }],
      userErrors: [],
    },
  },
});

const uploadAction = (over: Partial<PublishActionRecord> = {}) =>
  action({
    actionKey: "upload_image",
    targetRef: null,
    requestedChanges: { imageUrl: OURS, alt: "Diwali candles" },
    ...over,
  });

describe("8. A PICTURE INTO THE STORE'S OWN FILE LIBRARY", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("THE LOAD-BEARING ONE: only a picture Hawlai made can be uploaded", async () => {
    // An arbitrary URL in requestedChanges is an injection surface. A
    // page or a document saying "upload this image" would otherwise
    // put a stranger's file into a merchant's store under the
    // merchant's own name — so the source has to be this product's own
    // storage origin, and it is checked in preview AND in execute,
    // because approval arrives later against a record written
    // elsewhere.
    const strangers = [
      "https://evil.example.com/payload.png",
      // The right path on the wrong host.
      "https://evil.example.com/storage/v1/object/public/ad-creatives/x.png",
      // The right host over plain http.
      OURS.replace("https://", "http://"),
      // Two near-misses, in BOTH directions, because a host check
      // written with the wrong string method lets exactly one through
      // and looks right against the other. A mutation swapping `===`
      // for `endsWith` survived until the second line was here.
      //
      // ours is a SUFFIX of theirs — defeats startsWith/includes:
      "https://abcdefgh.supabase.co.evil.example.com/x.png",
      // ours is a PREFIX of nothing but their host ENDS with ours —
      // defeats endsWith:
      "https://evil-abcdefgh.supabase.co/x.png",
      "https://notabcdefgh.supabase.co/x.png",
      "not-a-url-at-all",
      "",
    ];
    for (const src of strangers) {
      const { impl, sent } = sequence([fileOk()]);
      const p = platform(impl);
      const a = uploadAction({ requestedChanges: { imageUrl: src } });
      const pv = await p.preview(a);
      expect(pv.ok, `preview must refuse ${src || "(empty)"}`).toBe(false);
      const ex = await p.execute(
        uploadAction({
          requestedChanges: { imageUrl: src },
          preview: { summary: "", changes: [{ field: "file", before: null, after: src }], warnings: [] } as any,
        })
      );
      expect(ex.ok, `execute must refuse ${src || "(empty)"}`).toBe(false);
      // And nothing was sent to Shopify either time.
      expect(sent.length, `nothing may reach Shopify for ${src || "(empty)"}`).toBe(0);
    }
  });

  it("AND REFUSES EVERYTHING when the storage origin is not configured", async () => {
    // The safe direction. A missing origin must not mean "allow
    // anything" — an upload is never the urgent half of anything.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { impl, sent } = sequence([fileOk()]);
    const r = await platform(impl).preview(uploadAction());
    expect(r.ok).toBe(false);
    expect(sent.length).toBe(0);
  });

  it("previews the picture itself, and says plainly that nothing goes live", async () => {
    const { impl, sent } = sequence([fileOk()]);
    const r = await platform(impl).preview(uploadAction({ requestedChanges: { imageUrl: OURS, filename: "diwali.png" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The approver looks at the image, not at a URL.
    expect(r.preview.target?.imageUrl).toBe(OURS);
    expect(r.preview.warnings.join(" ")).toMatch(/no customer sees it/i);
    // `before: null` is what marks a creation.
    expect(r.preview.changes).toEqual([{ field: "file", before: null, after: OURS }]);
    // A preview reads nothing and writes nothing.
    expect(sent.length).toBe(0);
  });

  it("refuses alt text over Shopify's limit rather than silently shortening it", async () => {
    // Shortening it would mean the approver agreed to words that are
    // not the words written — and Shopify rejects the whole create
    // anyway.
    const r = await platform(sequence([fileOk()]).impl).preview(
      uploadAction({ requestedChanges: { imageUrl: OURS, alt: "a".repeat(513) } })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/512/);
    const fine = await platform(sequence([fileOk()]).impl).preview(
      uploadAction({ requestedChanges: { imageUrl: OURS, alt: "a".repeat(512) } })
    );
    expect(fine.ok).toBe(true);
  });

  it("hands Shopify the URL to fetch — no staged upload, no bytes", async () => {
    const { impl, sent } = sequence([fileOk()]);
    const r = await platform(impl).execute(
      uploadAction({
        requestedChanges: { imageUrl: OURS, alt: "Diwali candles", filename: "diwali.png" },
        preview: { summary: "", changes: [{ field: "file", before: null, after: OURS }], warnings: [] } as any,
      })
    );
    expect(r.ok).toBe(true);
    expect(sent.length).toBe(1);
    expect(sent[0].query).toContain("fileCreate(files:");
    expect(sent[0].variables.files).toEqual([
      { originalSource: OURS, contentType: "IMAGE", alt: "Diwali candles", filename: "diwali.png" },
    ]);
  });

  it("omits alt and filename rather than sending empty strings", async () => {
    // An empty `alt` is not the same as no alt: it would overwrite
    // nothing here, but it is a blank description on a real image.
    const { impl, sent } = sequence([fileOk()]);
    await platform(impl).execute(
      uploadAction({
        requestedChanges: { imageUrl: OURS },
        preview: { summary: "", changes: [{ field: "file", before: null, after: OURS }], warnings: [] } as any,
      })
    );
    expect(Object.keys(sent[0].variables.files[0]).sort()).toEqual(["contentType", "originalSource"]);
  });

  it("THE ASYNCHRONOUS ONE: a file still processing reports no URL, not an empty one", async () => {
    // Shopify's own words: "Files are processed asynchronously. Check
    // the fileStatus field to monitor processing completion." So a
    // perfectly successful create can carry no URL yet. A caller that
    // read a missing field as an empty string would put a broken image
    // on a page.
    const { impl } = sequence([fileOk({ fileStatus: "UPLOADED", image: null })]);
    const r = await platform(impl).execute(
      uploadAction({
        preview: { summary: "", changes: [{ field: "file", before: null, after: OURS }], warnings: [] } as any,
      })
    );
    expect(r.ok).toBe(true);
    expect(r.ok && (r.platformResponse as any).url).toBeNull();
    expect(r.ok && (r.platformResponse as any).processing).toBe(true);
    expect(r.ok && (r.platformResponse as any).fileStatus).toBe("UPLOADED");
  });

  it("and a READY file is not reported as still processing", async () => {
    const { impl } = sequence([fileOk()]);
    const r = await platform(impl).execute(
      uploadAction({
        preview: { summary: "", changes: [{ field: "file", before: null, after: OURS }], warnings: [] } as any,
      })
    );
    expect(r.ok && (r.platformResponse as any).processing).toBe(false);
    expect(r.ok && (r.platformResponse as any).url).toBe("https://cdn.shopify.com/s/files/1/diwali.png");
  });

  it("surfaces a DECLINED upload instead of reporting success", async () => {
    const { impl } = sequence([
      { data: { fileCreate: { files: [], userErrors: [{ field: ["files"], message: "The file type is not supported.", code: "UNACCEPTABLE_ASSET" }] } } },
    ]);
    const r = await platform(impl).execute(
      uploadAction({
        preview: { summary: "", changes: [{ field: "file", before: null, after: OURS }], warnings: [] } as any,
      })
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && !r.stale && r.reason).toContain("not supported");
  });

  it("NO ERRORS AND NO FILE IS NOT A SUCCESS", async () => {
    // Reporting one would record a picture in the library that is not
    // there, and the next action would reference nothing.
    const { impl } = sequence([{ data: { fileCreate: { files: [], userErrors: [] } } }]);
    const r = await platform(impl).execute(
      uploadAction({
        preview: { summary: "", changes: [{ field: "file", before: null, after: OURS }], warnings: [] } as any,
      })
    );
    expect(r.ok).toBe(false);
  });

  it("IS NOT UNDOABLE, and that is a decision", async () => {
    // Same reason as publish_post: deleting a file is a deletion, not
    // a reverse, and by the time anyone asks, a page may already point
    // at it.
    const p = platform(sequence([fileOk()]).impl);
    expect(p.undoes).not.toContain("upload_image");
    const r = await p.undo!(
      uploadAction({ preview: { summary: "", changes: [], warnings: [] } as any })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/nothing to put back/i);
  });

  it("is the only publish action classified low, and still requires approval", async () => {
    // Nothing is published and no customer can see the file, which is
    // what makes it low — and writing to a merchant's store unasked is
    // what keeps it gated. One field to relax if it turns out to put a
    // second card in front of one decision.
    const { ACTION_RISK, ALWAYS_REQUIRES_APPROVAL } = await import("@/lib/publish/types");
    const { getActionPolicy } = await import("@/lib/executionPolicy");
    expect(ACTION_RISK.upload_image).toBe("low");
    expect(getActionPolicy("upload_image")?.requiresApproval).toBe(true);
    expect(getActionPolicy("upload_image")?.riskLevel).toBe("low");
    // Absent from the list this codebase treats as settled, on purpose.
    expect(ALWAYS_REQUIRES_APPROVAL).not.toContain("upload_image");
    // Not vacuous: every OTHER key in the risk table is above low.
    for (const [key, risk] of Object.entries(ACTION_RISK)) {
      if (key === "upload_image") continue;
      expect(risk, `${key} should not be low`).not.toBe("low");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// WHAT THE LIVE RUN FOUND — 20 November 2026
// ─────────────────────────────────────────────────────────────────────
//
// Both of these passed every mock test in this file and failed on
// first contact with a real store. They are here so they cannot come
// back, and so the next person reads what a mock cannot tell them.

describe("9. CLEARING A SEARCH TITLE, AND THE SILENT NO-OP IT USED TO BE", () => {
  const metaPreview = (changes: { field: string; before: string; after: string }[]) =>
    ({ summary: "", changes, warnings: [] }) as any;

  const deleted = {
    data: { metafieldsDelete: { deletedMetafields: [{ namespace: "global", key: "title_tag" }], userErrors: [] } },
  };
  const updated = { data: { pageUpdate: { page: { id: PAGE.id }, userErrors: [] } } };

  it("THE LOAD-BEARING ONE: an empty target is a DELETE, with the owner named", async () => {
    // FOUND LIVE, 20 November 2026. Shopify rejects an empty metafield
    // value, so the old code SKIPPED empty values — which meant
    // "clear the search title" produced no metafield to write, execute
    // sent `pageUpdate(id, page: {})`, Shopify accepted the empty
    // mutation, and the run reported success. An undo said "restored"
    // having restored nothing. Every mock test in this file passed.
    //
    // metafieldsDelete is keyed on ownerId+namespace+key, NOT on the
    // metafield's own id.
    const { impl, sent } = sequence([pageBody(), deleted, updated]);
    const r = await platform(impl).execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { metaTitle: "" },
        preview: metaPreview([{ field: "seoTitle", before: "About Qaaf", after: "" }]),
      })
    );
    expect(r.ok).toBe(true);
    const del = sent.find((c) => String(c.query).includes("metafieldsDelete"));
    expect(del, "a delete must have been sent").toBeTruthy();
    expect(del.variables.metafields).toEqual([{ ownerId: PAGE.id, namespace: "global", key: "title_tag" }]);
  });

  it("A DELETE-ONLY CHANGE SENDS NO EMPTY pageUpdate", async () => {
    // Both halves cleared, so after the deletes there is nothing left
    // to write. The old code would have sent `page: {}` here and
    // called it a success; now there is no pageUpdate at all and the
    // result names what was removed.
    const { impl, sent } = sequence([pageBody(), deleted]);
    const r = await platform(impl).execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { metaTitle: "", metaDescription: "" },
        preview: metaPreview([
          { field: "seoTitle", before: "About Qaaf", after: "" },
          { field: "seoDescription", before: "Hand poured candles", after: "" },
        ]),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.ok && (r.platformResponse as any).removed).toEqual(["title_tag", "description_tag"]);
    expect(sent.filter((c) => String(c.query).includes("pageUpdate")), "no empty pageUpdate").toHaveLength(0);
    const del = sent.find((c) => String(c.query).includes("metafieldsDelete"));
    expect(del.variables.metafields).toEqual([
      { ownerId: PAGE.id, namespace: "global", key: "title_tag" },
      { ownerId: PAGE.id, namespace: "global", key: "description_tag" },
    ]);
  });

  it("NO EMPTY VALUE EVER REACHES SHOPIFY, on any path", async () => {
    // The whole class rather than one path: Shopify rejects an empty
    // metafield value outright, so a payload carrying one fails the
    // entire mutation. Every combination of cleared and set is run and
    // every metafield sent is inspected.
    const cases: { title: string | null; description: string | null }[] = [
      { title: "", description: null },
      { title: null, description: "" },
      { title: "", description: "" },
      { title: "New", description: "" },
      { title: "", description: "New description" },
    ];
    for (const c of cases) {
      const changes = [];
      if (c.title !== null) changes.push({ field: "seoTitle", before: "About Qaaf", after: c.title });
      if (c.description !== null) {
        changes.push({ field: "seoDescription", before: "Hand poured candles", after: c.description });
      }
      const { impl, sent } = sequence([pageBody(), deleted, updated]);
      await platform(impl).execute(
        action({ actionKey: "update_page_meta", requestedChanges: {}, preview: metaPreview(changes) })
      );
      for (const call of sent) {
        for (const mf of (call.variables?.page?.metafields ?? []) as any[]) {
          expect(mf.value, `empty value sent for ${JSON.stringify(c)}`).toBeTruthy();
        }
      }
    }
  });

  it("a failed delete is reported, not swallowed", async () => {
    const { impl } = sequence([
      pageBody(),
      { data: { metafieldsDelete: { deletedMetafields: [], userErrors: [{ field: ["metafields"], message: "Owner not found" }] } } },
    ]);
    const r = await platform(impl).execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { metaTitle: "" },
        preview: metaPreview([{ field: "seoTitle", before: "About Qaaf", after: "" }]),
      })
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && !r.stale && r.reason).toContain("Owner not found");
  });

  it("clearing a title that was never set is ALREADY AT TARGET, not a delete", async () => {
    // No metafield to remove and nothing to write — and the
    // already-at-target check is what makes a retry after a timeout
    // harmless rather than a false stale.
    const { impl, sent } = sequence([pageBody({ seoTitle: null })]);
    const r = await platform(impl).execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { metaTitle: "" },
        preview: metaPreview([{ field: "seoTitle", before: "", after: "" }]),
      })
    );
    expect(r.ok).toBe(true);
    expect(sent.filter((c) => String(c.query).includes("mutation"))).toHaveLength(0);
  });
});

describe("10. AN ARTICLE REQUIRES AN AUTHOR", () => {
  const postAction = (over: Record<string, unknown> = {}) =>
    action({
      actionKey: "publish_post",
      targetRef: null,
      requestedChanges: { title: "Diwali care", html: "<p>Trim the wick.</p>", ...over },
    });

  const blogsThen = (extra: Record<string, unknown>[], shop: string | null = "Qaaf Candles") => {
    const body: Record<string, unknown> = { blogs: { nodes: [{ id: "gid://shopify/Blog/7", title: "News", handle: "news" }] } };
    if (shop !== null) body.shop = { name: shop };
    return sequence([{ data: body }, { data: body }, ...extra]);
  };

  const created = { data: { articleCreate: { article: { id: "gid://shopify/Article/3", isPublished: false }, userErrors: [] } } };

  it("THE LOAD-BEARING ONE: it sends an author, because the schema demands one", async () => {
    // FOUND LIVE, and invisible to every mock in this file:
    //   Variable $article of type ArticleCreateInput! was provided
    //   invalid value for author (Expected AuthorInput! to not be null)
    // `author: AuthorInput!` is non-null on ArticleCreateInput.
    const { impl, sent } = blogsThen([created]);
    const p = platform(impl);
    const pv = await p.preview(postAction());
    expect(pv.ok).toBe(true);
    const r = await p.execute({ ...postAction(), preview: pv.ok ? pv.preview : null } as any);
    expect(r.ok).toBe(true);
    const mutation = sent.find((c) => String(c.query).includes("articleCreate"));
    expect(mutation.variables.article.author).toBeTruthy();
    expect(mutation.variables.article.author.name).toBeTruthy();
  });

  it("the byline is the STORE'S name, never this product's", async () => {
    // Rule 3. A literal here would put Hawlai's name on a merchant's
    // blog post, and a merchant's own store name is the only honest
    // byline available without asking.
    const { impl, sent } = blogsThen([created], "Qaaf Candles");
    const p = platform(impl);
    const pv = await p.preview(postAction());
    await p.execute({ ...postAction(), preview: pv.ok ? pv.preview : null } as any);
    const mutation = sent.find((c) => String(c.query).includes("articleCreate"));
    expect(mutation.variables.article.author.name).toBe("Qaaf Candles");
    expect(JSON.stringify(mutation.variables).toLowerCase()).not.toContain("hawlai");
  });

  it("a caller-supplied author wins", async () => {
    const { impl, sent } = blogsThen([created]);
    const p = platform(impl);
    const act = postAction({ author: "Ovaiz" });
    const pv = await p.preview(act);
    await p.execute({ ...act, preview: pv.ok ? pv.preview : null } as any);
    expect(sent.find((c) => String(c.query).includes("articleCreate")).variables.article.author.name).toBe("Ovaiz");
  });

  it("AND STILL SENDS ONE when the store's name cannot be read", async () => {
    // A non-null argument has no safe omission. An unreadable shop
    // name must not turn into a missing author and a failed write.
    const { impl, sent } = blogsThen([created], null);
    const p = platform(impl);
    const pv = await p.preview(postAction());
    const r = await p.execute({ ...postAction(), preview: pv.ok ? pv.preview : null } as any);
    expect(r.ok).toBe(true);
    expect(sent.find((c) => String(c.query).includes("articleCreate")).variables.article.author.name).toBeTruthy();
  });

  it("and the post is STILL created unpublished", async () => {
    // The property the author fix must not have disturbed.
    const { impl, sent } = blogsThen([created]);
    const p = platform(impl);
    const pv = await p.preview(postAction());
    await p.execute({ ...postAction(), preview: pv.ok ? pv.preview : null } as any);
    expect(sent.find((c) => String(c.query).includes("articleCreate")).variables.article.isPublished).toBe(false);
  });
});
