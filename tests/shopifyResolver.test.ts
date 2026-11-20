// Turning what the owner typed into the right Shopify gid.
//
// THE FAILURE THIS FILE EXISTS TO PREVENT is already on the record, in
// masterBrainV2's Hawlai page resolver: "Asked for a page that isn't
// there: show what is. The predecessor fell through to the hero and
// reported success."
//
// That is worse than it sounds on a merchant's live storefront. The
// owner reads an approval card naming the page they asked for, says
// yes, and the write lands on a different page. The approval was real
// and the target was not. So every assertion here is ultimately about
// one thing: a resolver that is not sure must ASK, never pick.

import { describe, it, expect, vi } from "vitest";
import {
  matchShopifyResource,
  resolveShopifyResource,
  listShopifyResources,
  type ShopifyResource,
} from "@/lib/publish/platforms/shopifyResources";

const PAGES: ShopifyResource[] = [
  { id: "gid://shopify/Page/1", title: "About us", handle: "about-us" },
  { id: "gid://shopify/Page/2", title: "Contact", handle: "contact" },
  { id: "gid://shopify/Page/3", title: "Privacy policy", handle: "privacy-policy" },
  { id: "gid://shopify/Page/4", title: "Refund policy", handle: "refund-policy" },
  // A HANDLE THAT NO LONGER MATCHES ITS TITLE. Shopify keeps the
  // original handle when a page is renamed, so this is the ordinary
  // state of any page an owner has retitled — and without it the title
  // path is never exercised at all, because folding strips the hyphen
  // and every other fixture's title and handle fold to the same string.
  { id: "gid://shopify/Page/5", title: "Our story", handle: "the-brand" },
];

function replies(bodies: unknown[]) {
  let i = 0;
  const impl = vi.fn().mockImplementation(async () => {
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return impl;
}

describe("1. the strongest evidence wins, in a fixed order", () => {
  it("the handle, exactly — what they typed IS the slug", () => {
    const r = matchShopifyResource("about-us", PAGES);
    expect(r.ok).toBe(true);
    expect(r.ok && r.resource.id).toBe("gid://shopify/Page/1");
    expect(r.ok && r.matchType).toBe("handle");
  });

  it("the title, exactly, when the handle has drifted from it", () => {
    // "Our story" lives at /pages/the-brand because it was renamed.
    // Typing the title must find it, and this is the only fixture that
    // can prove the title path runs: for every other page the title
    // and the handle fold to the same string, so a handle match would
    // mask it. The first version of this test used "Contact" and
    // asserted matchType "title" — it resolved correctly, by handle.
    const r = matchShopifyResource("Our story", PAGES);
    expect(r.ok && r.resource.id).toBe("gid://shopify/Page/5");
    expect(r.ok && r.matchType).toBe("title");
  });

  it("and the drifted handle still works too", () => {
    const r = matchShopifyResource("the-brand", PAGES);
    expect(r.ok && r.resource.id).toBe("gid://shopify/Page/5");
    expect(r.ok && r.matchType).toBe("handle");
  });

  it("case and punctuation are folded, so a person can type like a person", () => {
    // "About Us", "about us", "ABOUT-US" are one request.
    for (const typed of ["About Us", "about us", "ABOUT-US", "aboutus", "About us!"]) {
      const r = matchShopifyResource(typed, PAGES);
      expect(r.ok, `"${typed}" should resolve`).toBe(true);
      expect(r.ok && r.resource.id, typed).toBe("gid://shopify/Page/1");
    }
  });

  it("a unique substring, either way round", () => {
    // "about" finds "About us"; "about us page" also finds it.
    expect(matchShopifyResource("about", PAGES).ok).toBe(true);
    const phrase = matchShopifyResource("about us page", PAGES);
    expect(phrase.ok && phrase.resource.id).toBe("gid://shopify/Page/1");
    expect(phrase.ok && phrase.matchType).toBe("contains");
  });

  it("nothing named, and only one thing it could be", () => {
    const one = [PAGES[0]];
    const r = matchShopifyResource("", one);
    expect(r.ok && r.matchType).toBe("only_one");
  });
});

describe("2. NOT SURE MEANS ASK — the load-bearing half", () => {
  it("THE LOAD-BEARING ONE: a tie is a question, never a pick", () => {
    // Two pages contain "policy". Choosing either would put a write on
    // a page the owner did not name, behind an approval card that said
    // the right thing.
    const r = matchShopifyResource("policy", PAGES);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("ambiguous");
    // And it narrows to the plausible ones rather than dumping the
    // store: "which of these two policies" is answerable.
    expect(!r.ok && r.candidates.map((c) => c.handle).sort()).toEqual(["privacy-policy", "refund-policy"]);
  });

  it("a name that matches nothing returns WHAT EXISTS", () => {
    // The only useful reply to "which page?" is the list.
    const r = matchShopifyResource("shipping", PAGES);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("shipping");
    expect(!r.ok && r.candidates).toHaveLength(5);
  });

  it("nothing named and several to choose from is a question", () => {
    const r = matchShopifyResource("", PAGES);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.candidates).toHaveLength(5);
  });

  it("an empty store says so, and offers nothing", () => {
    const r = matchShopifyResource("about", []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("none_exist");
    expect(!r.ok && r.candidates).toHaveLength(0);
  });

  it("DUPLICATE HANDLES DO NOT RESOLVE, even on an exact match", () => {
    // Shopify handles are unique in practice, but the matcher must not
    // depend on that: two exact matches is still a tie, and "the first
    // exact one" is the fall-through this file exists about.
    const twins: ShopifyResource[] = [
      { id: "gid://shopify/Page/9", title: "Sale", handle: "sale" },
      { id: "gid://shopify/Page/10", title: "Sale", handle: "sale" },
    ];
    const r = matchShopifyResource("sale", twins);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.candidates).toHaveLength(2);
  });

  it("NEVER falls back to the first item", () => {
    // Stated as its own assertion because it is the whole point, and
    // because the predecessor on the Hawlai side did exactly this.
    for (const asked of ["shipping", "policy", "", "zzz"]) {
      const r = matchShopifyResource(asked, PAGES);
      if (!r.ok) continue;
      expect(r.resource.id, `"${asked}" resolved to the first page by accident`).not.toBe(PAGES[0].id);
    }
    // And the two that genuinely cannot resolve did not.
    expect(matchShopifyResource("shipping", PAGES).ok).toBe(false);
    expect(matchShopifyResource("policy", PAGES).ok).toBe(false);
  });
});

describe("3. reading the store", () => {
  const pagesBody = { data: { pages: { nodes: PAGES } } };

  it("lists what is there, and issues no mutation", async () => {
    const impl = replies([pagesBody]);
    const all = await listShopifyResources("s.myshopify.com", "tok", "page", impl);
    expect(all).toHaveLength(5);
    const body = JSON.parse((impl as any).mock.calls[0][1].body);
    expect(String(body.query)).not.toContain("mutation");
  });

  it("NULL IS NOT AN EMPTY LIST when the read fails", async () => {
    // "Couldn't reach Shopify" and "this store has no collections"
    // lead to different sentences and only one of them is the
    // merchant's to fix. The adapter's readBlogs makes the same
    // distinction for the same reason.
    const impl = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => "upstream exploded",
    })) as unknown as typeof fetch;
    expect(await listShopifyResources("s.myshopify.com", "tok", "page", impl)).toBeNull();
  });

  it("an unreadable store is reported as unreadable, not as empty", async () => {
    const impl = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => "nope",
    })) as unknown as typeof fetch;
    const r = await resolveShopifyResource("s.myshopify.com", "tok", "page", "about", impl);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("unreadable");
    // Crucially NOT "this store has no pages yet", which would send the
    // owner to Shopify to create a page they already have.
    expect(!r.ok && r.message).toMatch(/couldn't read/i);
  });

  it("names the right noun per kind", async () => {
    for (const [kind, noun] of [["page", "page"], ["collection", "collection"], ["blog", "blog"]] as const) {
      const impl = replies([{ data: { [kind === "blog" ? "blogs" : `${kind}s`]: { nodes: [] } } }]);
      const r = await resolveShopifyResource("s.myshopify.com", "tok", kind, "x", impl);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message, kind).toContain(noun);
    }
  });

  it("asks the right root field for each kind", async () => {
    for (const [kind, root] of [["page", "pages"], ["collection", "collections"], ["blog", "blogs"]] as const) {
      const impl = replies([{ data: { [root]: { nodes: [] } } }]);
      await listShopifyResources("s.myshopify.com", "tok", kind, impl);
      expect(String(JSON.parse((impl as any).mock.calls[0][1].body).query)).toContain(root);
    }
  });
});
