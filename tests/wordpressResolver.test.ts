// Turning what the owner typed into a WordPress reference.
//
// ONE MATCHER, TWO PLATFORMS. The decision logic moved to
// src/lib/publish/resolveResource.ts on 22 November 2026, unchanged,
// when WordPress needed exactly the same thing;
// `matchShopifyResource` is now a delegate and its eighteen existing
// assertions still exercise it. A second copy is how `metaTitle` and
// `seoTitle` came to mean one field on one ActionKey, and how the same
// four TEXT_PROPS came to be declared six times.
//
// So this file does not re-test the matching rules. It pins the two
// things that are WordPress's own:
//
//   1. THE REFERENCE IS QUALIFIED. WordPress shares an id space
//      between post types — /wp/v2/posts/5 and /wp/v2/pages/5 can both
//      exist and differ — so "5" is not a reference to anything and
//      the adapter refuses one. The resolver builds "page:5" so no
//      caller has to remember.
//
//   2. DRAFTS ARE LISTED. Verified against a live site, where the
//      Privacy Policy page is a draft: a resolver that only saw
//      published items would answer "nothing on this site is called
//      that" about a page in the owner's own editor.

import { describe, it, expect } from "vitest";
import { listWordPressResources, resolveWordPressResource } from "@/lib/publish/platforms/wordpressResources";
import { matchResource } from "@/lib/publish/resolveResource";
import { matchShopifyResource } from "@/lib/publish/platforms/shopifyResources";

const CREDS = { siteUrl: "https://a-test-site.example", username: "admin", appPassword: "p" };

/** The live shape: context=edit gives title.raw. */
const PAGES = [
  { id: 2, slug: "sample-page", status: "publish", title: { raw: "Sample Page", rendered: "Sample Page" } },
  { id: 3, slug: "privacy-policy", status: "draft", title: { raw: "Privacy Policy", rendered: "Privacy Policy" } },
];

function sequence(body: unknown) {
  const sent: string[] = [];
  const impl = (async (url: any) => {
    sent.push(String(url));
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { impl, sent };
}

describe("1. THE REFERENCE CARRIES ITS KIND, because the id space is shared", () => {
  it("THE LOAD-BEARING ONE: a page resolves to page:N, never to N", async () => {
    const { impl } = sequence(PAGES);
    const r = await resolveWordPressResource(CREDS, "page", "sample-page", impl);
    expect(r.ok, !r.ok ? r.message : "").toBe(true);
    expect(r.ok && r.resource.id).toBe("page:2");
  });

  it("and the same id under a different kind is a different reference", async () => {
    // The failure this prevents: /wp/v2/posts/2 and /wp/v2/pages/2 both
    // existing, and an edit landing on the wrong one.
    const { impl } = sequence([{ id: 2, slug: "sample-page", title: { raw: "Sample Page" } }]);
    const r = await resolveWordPressResource(CREDS, "post", "sample-page", impl);
    expect(r.ok && r.resource.id).toBe("post:2");
  });

  it("every listed item is qualified, not just the matched one", async () => {
    const { impl } = sequence(PAGES);
    const all = await listWordPressResources(CREDS, "page", impl);
    expect(all?.map((r) => r.id)).toEqual(["page:2", "page:3"]);
  });
});

describe("2. DRAFTS AND PRIVATE ITEMS ARE LISTED", () => {
  it("THE LOAD-BEARING ONE: an unpublished page is resolvable", async () => {
    // Confirmed against a live site, where this is the real case.
    const { impl } = sequence(PAGES);
    const r = await resolveWordPressResource(CREDS, "page", "privacy-policy", impl);
    expect(r.ok && r.resource.id).toBe("page:3");
  });

  it("and the request asks for them, rather than relying on a default", async () => {
    const { impl, sent } = sequence(PAGES);
    await listWordPressResources(CREDS, "page", impl);
    expect(sent[0]).toMatch(/status=publish,draft,pending,private/);
    // The editable context, like every other read in this adapter.
    expect(sent[0]).toMatch(/context=edit/);
  });
});

describe("3. THE TITLE IS THE STORED ONE", () => {
  it("raw, not rendered, so entities match what the owner types", async () => {
    // "Tom &amp; Jerry" rendered would never match "Tom & Jerry" typed.
    const { impl } = sequence([{ id: 9, slug: "t-and-j", title: { raw: "Tom & Jerry", rendered: "Tom &amp; Jerry" } }]);
    const all = await listWordPressResources(CREDS, "page", impl);
    expect(all?.[0].title).toBe("Tom & Jerry");
    const r = await resolveWordPressResource(CREDS, "page", "Tom & Jerry", sequence([{ id: 9, slug: "t-and-j", title: { raw: "Tom & Jerry", rendered: "Tom &amp; Jerry" } }]).impl);
    expect(r.ok && r.resource.id).toBe("page:9");
  });
});

describe("4. NULL IS NOT AN EMPTY LIST", () => {
  it("THE LOAD-BEARING ONE: an unreachable site is not 'no pages'", async () => {
    // Two different sentences, and only one of them is the owner's to
    // fix. Reporting "this site has no pages" for a site that is down
    // sends them to look for a page they already have.
    const impl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    expect(await listWordPressResources(CREDS, "page", impl)).toBeNull();
    const r = await resolveWordPressResource(CREDS, "page", "about", impl);
    expect(!r.ok && r.reason).toBe("unreadable");
    expect(!r.ok && r.message).toMatch(/Couldn't read this site/);
  });

  it("a site with genuinely no pages says so", async () => {
    const { impl } = sequence([]);
    const r = await resolveWordPressResource(CREDS, "page", "about", impl);
    expect(!r.ok && r.reason).toBe("none_exist");
    expect(!r.ok && r.message).toMatch(/This site has no pages yet/);
  });

  it("and a 200 that is not a list is unreadable, not empty", async () => {
    // A cache or security plugin answering in front of WordPress.
    const { impl } = sequence({ code: "rest_forbidden" });
    expect(await listWordPressResources(CREDS, "page", impl)).toBeNull();
  });
});

describe("5. ONE MATCHER, NOT TWO", () => {
  it("THE LOAD-BEARING ONE: Shopify's resolver delegates to the shared one", () => {
    // If these two ever disagree, one platform has learned something
    // the other has not — which is the whole reason the matcher moved.
    const items = [
      { id: "a", title: "About us", handle: "about-us" },
      { id: "b", title: "Privacy policy", handle: "privacy" },
    ];
    for (const asked of ["about-us", "About us", "about", "privacy", "nothing like this", ""]) {
      expect(matchShopifyResource(asked, items), asked).toEqual(matchResource(asked, items, "store"));
    }
  });

  it("the place word travels, because it belongs in the sentence", () => {
    // "This store has no items yet" is wrong about a WordPress site,
    // and the owner reads it.
    const site = matchResource("x", [], "site");
    const store = matchResource("x", [], "store");
    expect(!site.ok && site.message).toMatch(/This site/);
    expect(!store.ok && store.message).toMatch(/This store/);
  });

  it("AND THE WORDPRESS RESOLVER ACTUALLY PASSES IT", async () => {
    // Testing matchResource directly proves the parameter works; it
    // does not prove the caller uses it. A mutation hard-coding
    // "store" at the WordPress call site SURVIVED the version above,
    // because `none_exist` is rewritten by the resolver afterwards and
    // hid the difference. The no-match sentence is not rewritten, so
    // it is the one that shows the word.
    const { impl } = sequence(PAGES);
    const r = await resolveWordPressResource(CREDS, "page", "nothing like this at all", impl);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message, "a WordPress site was called a store").toMatch(/this site/i);
    expect(!r.ok && r.message).not.toMatch(/store/i);
  });

  it("A LOOSE MATCH IS STILL OFFERED, NEVER APPLIED", async () => {
    // The rule the whole resolver exists for, asserted on the
    // WordPress path so a future edit there cannot quietly relax it.
    const { impl } = sequence(PAGES);
    const r = await resolveWordPressResource(CREDS, "page", "privacy-pol", impl);
    expect(r.ok, "it picked a page from a partial name").toBe(false);
    expect(!r.ok && r.reason).toBe("needs_confirmation");
    expect(!r.ok && r.candidates.map((c) => c.id)).toEqual(["page:3"]);
  });
});

describe("6. rule 3 — no business, product or trade is named", () => {
  it("the resolver carries no tenant vocabulary", async () => {
    const { code } = await import("./helpers/source");
    expect(code("src/lib/publish/platforms/wordpressResources.ts")).not.toMatch(/candle|qaaf|kurta|salon|bakery/i);
    expect(code("src/lib/publish/resolveResource.ts")).not.toMatch(/candle|qaaf|kurta|salon|bakery/i);
  });
});

// ---------------------------------------------------------------------
// POSTS AND PAGES AS ONE THING — resolveWordPressContent.
// ---------------------------------------------------------------------
// ADDED 23 NOVEMBER 2026, at the owner's decision, after the live site
// settled it: Yoast 28.9 registers _yoast_wpseo_title for `post` and
// NOT for `page` — measured on the item's meta and on the route's
// OPTIONS schema, after the content-type toggles were turned on and
// changed nothing. A pages-only search listing on WordPress was a
// feature that could never work, while the surface most WordPress
// businesses actually rank with was unreachable.
describe("7. ONE QUESTION ABOUT CONTENT, NOT TWO ABOUT TAXONOMY", () => {
  const POSTS = [{ id: 11, slug: "hello-world", status: "publish", title: { raw: "Hello world!" } }];

  /** Pages first, then posts — the order resolveWordPressContent reads them. */
  function twoLists(pages: unknown, posts: unknown) {
    const sent: string[] = [];
    let i = 0;
    const impl = (async (url: any) => {
      sent.push(String(url));
      const body = String(url).includes("/pages") ? pages : posts;
      i += 1;
      if (body === null) return { ok: false, status: 500, text: async () => "{}" };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }) as unknown as typeof fetch;
    return { impl, sent };
  }

  it("THE LOAD-BEARING ONE: a name that is a POST resolves, without anyone naming a type", async () => {
    const { impl } = twoLists(PAGES, POSTS);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "hello-world", impl);
    expect(r.ok, !r.ok ? r.message : "").toBe(true);
    expect(r.ok && r.resource.id).toBe("post:11");
  });

  it("and a name that is a PAGE still resolves from the same call", async () => {
    const { impl } = twoLists(PAGES, POSTS);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "privacy-policy", impl);
    expect(r.ok && r.resource.id).toBe("page:3");
  });

  it("A SHARED SLUG IS A QUESTION, and the candidates carry their kind", async () => {
    // The case a bare handle cannot answer twice: a post and a page
    // called the same thing.
    const clash = [{ id: 4, slug: "about", status: "publish", title: { raw: "About" } }];
    const clashPost = [{ id: 12, slug: "about", status: "publish", title: { raw: "About" } }];
    const { impl } = twoLists(clash, clashPost);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "about", impl);
    expect(r.ok, "it picked one of two things called About").toBe(false);
    expect(!r.ok && r.candidates.map((c) => c.id).sort()).toEqual(["page:4", "post:12"]);
  });

  it("A QUALIFIED REFERENCE IS ALREADY AN ANSWER, not another question", async () => {
    // It is what the clarify card hands back. Fuzzy-matching it would
    // turn a decision the owner already made into another question.
    const clash = [{ id: 4, slug: "about", status: "publish", title: { raw: "About" } }];
    const clashPost = [{ id: 12, slug: "about", status: "publish", title: { raw: "About" } }];
    const { impl } = twoLists(clash, clashPost);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "post:12", impl);
    expect(r.ok && r.resource.id).toBe("post:12");
  });

  it("a reference to something that is gone is NOT treated as a name", async () => {
    const { impl } = twoLists(PAGES, POSTS);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "page:999", impl);
    expect(r.ok).toBe(false);
  });

  it("ONE KIND UNREADABLE IS NOT 'nothing is called that'", async () => {
    // Matching against half the site and reporting it as the whole
    // site is the silent-wrong-answer shape. It says which half.
    const { impl } = twoLists(null, POSTS);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "privacy-policy", impl);
    expect(r.ok).toBe(false);
    // THE PHRASE THAT ONLY THE PARTIAL CASE PRODUCES. `/couldn't read
    // this site's pages/` was too loose: the BOTH-unreadable message
    // says "pages or posts", which contains it, so a mutation turning
    // a partial read into a hard failure SURVIVED.
    expect(!r.ok && r.message).toMatch(/that half wasn't searched/i);
    expect(!r.ok && r.reason, "a partial read is not an unreadable site").not.toBe("unreadable");
  });

  it("BOTH UNREADABLE IS unreadable, not empty", async () => {
    const { impl } = twoLists(null, null);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "about", impl);
    expect(!r.ok && r.reason).toBe("unreadable");
  });

  it("a site with neither says so, naming both", async () => {
    const { impl } = twoLists([], []);
    const { resolveWordPressContent } = await import("@/lib/publish/platforms/wordpressResources");
    const r = await resolveWordPressContent(CREDS, "about", impl);
    expect(!r.ok && r.reason).toBe("none_exist");
    expect(!r.ok && r.message).toMatch(/no pages or posts yet/i);
  });

  it("kindOfRef reads a reference and refuses anything else", async () => {
    const { kindOfRef } = await import("@/lib/publish/platforms/wordpressResources");
    expect(kindOfRef("post:1")).toBe("post");
    expect(kindOfRef("page:22")).toBe("page");
    for (const bad of ["1", "product:1", "page:", "page:x", "", "page:-1", "pages:1"]) {
      expect(kindOfRef(bad), bad).toBeNull();
    }
    // SURROUNDING WHITESPACE IS FORGIVEN, deliberately and in step with
    // the lookup, which trims before comparing. A reference arriving
    // from a model's JSON with a stray space is the same reference,
    // and refusing it would ask the owner the question again for a
    // character nobody typed. My first version of this test asserted
    // the opposite and was simply wrong about the code.
    expect(kindOfRef("page:1 ")).toBe("page");
    expect(kindOfRef(" post:2")).toBe("post");
  });
});
