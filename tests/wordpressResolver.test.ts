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
