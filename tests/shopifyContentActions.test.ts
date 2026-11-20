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

import { describe, it, expect } from "vitest";
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

const PAGE = {
  id: "gid://shopify/Page/1",
  title: "About us",
  handle: "about-us",
  body: "<p>We pour candles.</p>",
  isPublished: true,
  seo: { title: "About Qaaf", description: "Hand poured candles" },
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
    // Shopify's seo input replaces the object, so sending only the
    // title would blank a description nobody asked to remove.
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
    expect(mutation.variables.page.seo.title).toBe("New title");
    expect(mutation.variables.page.seo.description).toBe("Hand poured candles");
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
    expect(p.undoes).toEqual(["update_page_text", "update_page_meta"]);
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
