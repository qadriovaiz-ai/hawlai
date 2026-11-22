// The WordPress adapter — posts, pages, and Yoast's two lines.
//
// EVERY SHAPE HERE WAS PROBED AGAINST A LIVE SITE on 22 November 2026
// BEFORE the adapter was written, and the finished adapter was then run
// against that site: 34 assertions, 0 failures, every edit put back
// through its own undo(). That ordering is the whole lesson of the
// Shopify adapter, which needed four corrections AFTER meeting a real
// store, three of them invisible to a green suite.
//
// WHAT THE LIVE SITE TAUGHT, and what these tests therefore pin:
//
//   1. RENDERED IS NOT RAW, three times over. `title.rendered`,
//      `content.rendered` and `yoast_head_json.title` are all
//      transformed values. Comparing any of them would make the
//      adapter report EVERY change as stale, for ever — and a fake
//      fetch cannot show that, because it returns whatever it is
//      handed. Hence `context=edit` on every read.
//
//   2. POSTS AND PAGES SHARE AN ID SPACE. /wp/v2/posts/5 and
//      /wp/v2/pages/5 can both exist and be different things, so the
//      reference carries the kind and a bare id is refused.
//
//   3. YOAST REGISTERS ITS EDITABLE META PER CONTENT TYPE. On the live
//      site, posts exposed _yoast_wpseo_title and pages did not, while
//      Yoast was active for both. The first dry run caught the adapter
//      telling the owner "Yoast SEO isn't active" about a running
//      plugin.

import { describe, it, expect } from "vitest";
import { createWordPressPlatform } from "@/lib/publish/platforms/wordpress";
import { restRoot } from "@/lib/commerce/wordpressRest";
import type { PublishActionRecord } from "@/lib/publish/types";

const CREDS = { siteUrl: "https://a-test-site.example", username: "admin", appPassword: "abcd EFGH ijkl MNOP qrst UVWX" };

function sequence(bodies: unknown[]) {
  const sent: { url: string; method: string; body: any; headers: Record<string, string> }[] = [];
  let i = 0;
  const impl = (async (url: any, init: any) => {
    sent.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : null,
      headers: init?.headers ?? {},
    });
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { impl, sent };
}

const platform = (impl: typeof fetch) => createWordPressPlatform({ getCredentials: async () => CREDS, fetchImpl: impl });

/** A live-shaped item: raw AND rendered, because the real API returns both. */
const item = (over: Record<string, unknown> = {}) => ({
  id: 7,
  slug: "sample-page",
  status: "publish",
  link: "https://a-test-site.example/sample-page",
  title: { raw: "Sample Page", rendered: "Sample Page" },
  content: {
    raw: "<!-- wp:paragraph -->\n<p>Welcome.</p>\n<!-- /wp:paragraph -->",
    rendered: '\n<p class="wp-block-paragraph">Welcome.</p>\n',
  },
  meta: { _yoast_wpseo_title: "", _yoast_wpseo_metadesc: "", footnotes: "" },
  yoast_head_json: { title: "Sample Page - A Test Site" },
  ...over,
});

const action = (over: Partial<PublishActionRecord> = {}): PublishActionRecord =>
  ({
    id: "act-1",
    dealershipId: "d1",
    platform: "wordpress",
    actionKey: "update_page_text",
    targetRef: "page:7",
    targetLabel: "Sample Page",
    requestedChanges: {},
    preview: null,
    previewedAt: null,
    ...over,
  }) as unknown as PublishActionRecord;

const previewed = (changes: { field: string; before: string | null; after: string }[]) => ({
  summary: "s",
  target: { title: "Sample Page", variantTitle: null, currentPrice: null, imageUrl: null },
  changes,
  warnings: [],
});

describe("1. EVERY READ USES context=edit, OR THE ADAPTER IS PERMANENTLY STALE", () => {
  it("THE LOAD-BEARING ONE: the request asks for the editable context", async () => {
    const { impl, sent } = sequence([item()]);
    await platform(impl).preview(action({ requestedChanges: { html: "<p>new</p>" } }));
    expect(sent).toHaveLength(1);
    expect(sent[0].url, "without context=edit there is no `raw` to compare against").toMatch(/context=edit/);
    expect(sent[0].method).toBe("GET");
  });

  it("and the before-value is RAW, never the rendered HTML", async () => {
    // The live site returns block markup in `raw` and expanded HTML in
    // `rendered`. Recording `rendered` would compare it against what
    // was written on execute, never match, and report every change as
    // stale — which no fake-fetch test can reveal on its own.
    const { impl } = sequence([item()]);
    const r = await platform(impl).preview(action({ requestedChanges: { html: "<p>new</p>" } }));
    expect(r.ok).toBe(true);
    const change = r.ok && r.preview.changes.find((c) => c.field === "content");
    expect(change && change.before).toBe("<!-- wp:paragraph -->\n<p>Welcome.</p>\n<!-- /wp:paragraph -->");
    expect(change && change.before).not.toMatch(/wp-block-paragraph/);
  });

  it("the credential travels as HTTP Basic, trimmed", async () => {
    const { impl, sent } = sequence([item()]);
    await platform(impl).preview(action({ requestedChanges: { html: "x" } }));
    const auth = String((sent[0].headers as any).Authorization ?? "");
    expect(auth).toMatch(/^Basic /);
    // A pasted application password with a trailing newline fails with
    // a flat 401 that reads as "wrong password".
    expect(Buffer.from(auth.slice(6), "base64").toString()).toBe("admin:abcd EFGH ijkl MNOP qrst UVWX");
  });

  it("restRoot forgives what owners actually paste", () => {
    for (const given of ["a-test-site.example", "https://a-test-site.example/", "https://a-test-site.example/wp-admin", "https://a-test-site.example/wp-json"]) {
      expect(restRoot(given)).toBe("https://a-test-site.example");
    }
  });
});

describe("2. POSTS AND PAGES SHARE AN ID SPACE, so the kind is never guessed", () => {
  it("THE LOAD-BEARING ONE: a bare id is refused", async () => {
    const { impl, sent } = sequence([item()]);
    const r = await platform(impl).preview(action({ targetRef: "7", requestedChanges: { html: "x" } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/which post or page/i);
    expect(sent, "it read something before refusing").toHaveLength(0);
  });

  it("the kind chooses the route", async () => {
    for (const [ref, route] of [["post:7", "/wp/v2/posts/7"], ["page:7", "/wp/v2/pages/7"]] as const) {
      const { impl, sent } = sequence([item()]);
      await platform(impl).preview(action({ targetRef: ref, requestedChanges: { html: "x" } }));
      expect(sent[0].url).toContain(route);
    }
  });

  it("nonsense and negative ids are refused too", async () => {
    for (const ref of ["product:7", "page:0", "page:-1", "page:abc", ""]) {
      const { impl } = sequence([item()]);
      const r = await platform(impl).preview(action({ targetRef: ref, requestedChanges: { html: "x" } }));
      expect(r.ok, ref).toBe(false);
    }
  });
});

describe("3. YOAST — active, exposed, or neither, and they are different answers", () => {
  it("THE LOAD-BEARING ONE: a type Yoast does not expose is refused, not written to", async () => {
    // The live finding: posts carried _yoast_wpseo_title, pages did
    // not, and Yoast was active for both. Writing an unregistered meta
    // key is accepted and silently dropped — the silent no-op shape.
    const { impl } = sequence([item({ meta: { footnotes: "" } })]);
    const r = await platform(impl).preview(action({ actionKey: "update_page_meta", requestedChanges: { seoTitle: "A title" } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason, "it blamed a missing plugin for a content-type setting").toMatch(/Content types/i);
    expect(!r.ok && r.reason).not.toMatch(/doesn't have Yoast SEO active/i);
  });

  it("AND A SITE WITHOUT YOAST GETS THE OTHER ANSWER", async () => {
    // Not vacuous: the two causes have different fixes, so collapsing
    // them would send an owner to reinstall a running plugin.
    const { impl } = sequence([item({ meta: { footnotes: "" }, yoast_head_json: undefined })]);
    const r = await platform(impl).preview(action({ actionKey: "update_page_meta", requestedChanges: { seoTitle: "A title" } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/doesn't have Yoast SEO active/i);
  });

  it("ONLY THE FIELD ASKED FOR IS SENT, so the other is not blanked", async () => {
    const withBoth = item({ meta: { _yoast_wpseo_title: "Old title", _yoast_wpseo_metadesc: "Keep me", footnotes: "" } });
    const { impl, sent } = sequence([withBoth, withBoth, { ...withBoth, meta: { ...withBoth.meta, _yoast_wpseo_title: "New" } }]);
    const r = await platform(impl).execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { seoTitle: "New" },
        preview: previewed([{ field: "seoTitle", before: "Old title", after: "New" }]) as any,
        previewedAt: "2026-11-22T00:00:00Z",
      })
    );
    expect(r.ok, !r.ok && !("stale" in r) ? r.reason : "").toBe(true);
    const write = sent.find((s) => s.method === "POST");
    expect(write?.body).toEqual({ meta: { _yoast_wpseo_title: "New" } });
    expect(JSON.stringify(write?.body)).not.toMatch(/metadesc/);
  });

  it("the stored override is the before-value, NOT the computed yoast_head_json title", async () => {
    // A post with no override at all reads back as "Sample Page - A
    // Test Site" in yoast_head_json. Recording that and writing it
    // back would turn a template into a hard-coded string.
    const { impl } = sequence([item()]);
    const r = await platform(impl).preview(action({ actionKey: "update_page_meta", requestedChanges: { seoTitle: "A title" } }));
    const change = r.ok && r.preview.changes.find((c) => c.field === "seoTitle");
    expect(change && change.before).toBe("");
    expect(change && change.before).not.toMatch(/A Test Site/);
  });

  it("a mismatch on EITHER field is stale", async () => {
    // Checking only the field being written would let a description
    // somebody else changed survive a title edit approved against the
    // old pair.
    const moved = item({ meta: { _yoast_wpseo_title: "Old title", _yoast_wpseo_metadesc: "CHANGED", footnotes: "" } });
    const { impl, sent } = sequence([moved]);
    const r = await platform(impl).execute(
      action({
        actionKey: "update_page_meta",
        requestedChanges: { seoTitle: "New", metaDescription: "D" },
        preview: previewed([
          { field: "seoTitle", before: "Old title", after: "New" },
          { field: "seoDescription", before: "Old desc", after: "D" },
        ]) as any,
        previewedAt: "x",
      })
    );
    expect(!r.ok && (r as any).stale).toBe(true);
    expect(sent.filter((s) => s.method === "POST")).toHaveLength(0);
  });
});

describe("4. EXECUTE RE-READS, AND A CREATION IS A DRAFT", () => {
  it("THE LOAD-BEARING ONE: a page whose text moved is stale, not overwritten", async () => {
    const { impl, sent } = sequence([item({ content: { raw: "SOMEBODY ELSE EDITED THIS", rendered: "x" } })]);
    const r = await platform(impl).execute(
      action({
        requestedChanges: { html: "<p>new</p>" },
        preview: previewed([{ field: "content", before: "<!-- wp:paragraph -->\n<p>Welcome.</p>\n<!-- /wp:paragraph -->", after: "<p>new</p>" }]) as any,
        previewedAt: "x",
      })
    );
    expect(!r.ok && (r as any).stale).toBe(true);
    expect(sent.filter((s) => s.method === "POST")).toHaveLength(0);
  });

  it("already at the target is a NO-OP, not a second write", async () => {
    // Confirmed against the live site. The first version of the
    // verification script asserted this should be stale and reported
    // the correct no-op as "it wrote twice".
    const { impl, sent } = sequence([item({ content: { raw: "<p>new</p>", rendered: "x" } })]);
    const r = await platform(impl).execute(
      action({
        requestedChanges: { html: "<p>new</p>" },
        preview: previewed([{ field: "content", before: "old", after: "<p>new</p>" }]) as any,
        previewedAt: "x",
      })
    );
    expect(r.ok && (r.platformResponse as any)?.skipped).toBeTruthy();
    expect(sent.filter((s) => s.method === "POST")).toHaveLength(0);
  });

  it("A NEW POST IS CREATED AS A DRAFT, and the reference comes back ready to use", async () => {
    const { impl, sent } = sequence([{ id: 11, status: "draft", link: "https://a-test-site.example/?p=11", title: {}, content: {} }]);
    const r = await platform(impl).execute(
      action({
        actionKey: "publish_post",
        targetRef: null,
        requestedChanges: { title: "A post", html: "<p>Words.</p>" },
        preview: previewed([{ field: "post", before: null, after: "A post" }]) as any,
        previewedAt: "x",
      })
    );
    expect(r.ok).toBe(true);
    const write = sent.find((s) => s.method === "POST");
    expect(write?.body.status, "a creation must not reach a reader on approval").toBe("draft");
    // THE REFERENCE IS RETURNED IN THE FORM THE GO-LIVE STEP NEEDS, so
    // nothing has to reconstruct "post:11" from an integer.
    expect(r.ok && (r.platformResponse as any)?.post?.targetRef).toBe("post:11");
  });

  it('the publish direction is strictly boolean — the string "false" is not true', async () => {
    // Boolean("false") is true, and a jsonb round trip can hand back
    // that string. The failure direction is a live post nobody approved.
    const { impl, sent } = sequence([item()]);
    const r = await platform(impl).preview(action({ actionKey: "update_post", targetRef: "post:7", requestedChanges: { published: "false" } as any }));
    expect(r.ok).toBe(false);
    expect(sent.filter((s) => s.method === "POST")).toHaveLength(0);
  });

  it("going live maps to status publish, and back to draft", async () => {
    for (const [published, status] of [[true, "publish"], [false, "draft"]] as const) {
      const { impl, sent } = sequence([item({ status: published ? "draft" : "publish" }), { id: 7, status, title: {}, content: {} }]);
      const r = await platform(impl).execute(
        action({
          actionKey: "update_post",
          targetRef: "post:7",
          requestedChanges: { published },
          preview: previewed([{ field: "status", before: published ? "draft" : "publish", after: status }]) as any,
          previewedAt: "x",
        })
      );
      expect(r.ok, String(published)).toBe(true);
      expect(sent.find((s) => s.method === "POST")?.body).toEqual({ status });
    }
  });
});

describe("5. UNDO PUTS BACK, AND NEVER DELETES", () => {
  it("THE LOAD-BEARING ONE: creating a post is not undoable, editing is", () => {
    const p = platform(sequence([item()]).impl);
    // Un-creating a post is a deletion, and a deletion is not the
    // reverse of a creation — the same decision the Shopify adapter
    // records. The post is created as a draft instead.
    expect(p.undoes).not.toContain("publish_post");
    expect(p.undoes).toEqual(["update_post", "update_page_text", "update_page_meta"]);
    for (const key of p.undoes ?? []) expect(p.supports).toContain(key);
  });

  it("a text undo proposes the exact prior body", async () => {
    const { impl } = sequence([item()]);
    const r = await platform(impl).undo!(
      action({ preview: previewed([{ field: "content", before: "THE OLD WORDS", after: "x" }]) as any })
    );
    expect(r.ok, !r.ok ? r.reason : "").toBe(true);
    expect(r.ok && r.requestedChanges).toEqual({ html: "THE OLD WORDS" });
  });

  it("a go-live undo UNPUBLISHES and says nothing is deleted", async () => {
    const { impl, sent } = sequence([item({ status: "publish" })]);
    const r = await platform(impl).undo!(
      action({ actionKey: "update_post", targetRef: "post:7", preview: previewed([{ field: "status", before: "draft", after: "publish" }]) as any })
    );
    expect(r.ok && r.requestedChanges).toEqual({ published: false });
    expect(r.ok && r.warnings.join(" ")).toMatch(/[Nn]othing is deleted/);
    expect(JSON.stringify(sent)).not.toMatch(/DELETE/);
  });

  it("A POST THAT WAS LIVE BEFORE HAWLAI TOUCHED IT GOES BACK TO LIVE", async () => {
    const { impl } = sequence([item({ status: "draft" })]);
    const r = await platform(impl).undo!(
      action({ actionKey: "update_post", targetRef: "post:7", preview: previewed([{ field: "status", before: "publish", after: "draft" }]) as any })
    );
    expect(r.ok && r.requestedChanges).toEqual({ published: true });
  });

  it("NOTHING RECORDED MEANS NOTHING OFFERED", async () => {
    const { impl } = sequence([item()]);
    const r = await platform(impl).undo!(action({ preview: previewed([]) as any }));
    expect(r.ok).toBe(false);
  });

  it("and a key it does not claim to undo is refused by the method too", async () => {
    const { impl } = sequence([item()]);
    const r = await platform(impl).undo!(action({ actionKey: "publish_post", preview: previewed([{ field: "post", before: null, after: "x" }]) as any }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/nothing to put back/i);
  });
});

describe("6. IT CLAIMS ONLY WHAT IT CAN DO", () => {
  it("THE LOAD-BEARING ONE: no WooCommerce key is declared", () => {
    // A declared capability is a promise the tool layer reads. Woo's
    // keys belong to a different namespace, credential and phase.
    const p = platform(sequence([item()]).impl);
    expect(p.supports).toEqual(["publish_post", "update_post", "update_page_text", "update_page_meta"]);
    for (const key of ["update_product_price", "update_product_description", "create_discount_code"] as const) {
      expect(p.supports).not.toContain(key);
    }
  });

  it("and an unsupported action is refused rather than attempted", async () => {
    const { impl, sent } = sequence([item()]);
    const r = await platform(impl).preview(action({ actionKey: "create_discount_code", requestedChanges: {} }));
    expect(r.ok).toBe(false);
    expect(sent.filter((s) => s.method === "POST")).toHaveLength(0);
  });

  it("a 200 that is not WordPress JSON is a failure, not an empty success", async () => {
    // A cache, a maintenance page or a security plugin answering in
    // front of WordPress. Treating it as {} would report a write that
    // nothing performed.
    const impl = (async () => ({ ok: true, status: 200, text: async () => "<html>Under maintenance</html>" })) as unknown as typeof fetch;
    const r = await platform(impl).preview(action({ requestedChanges: { html: "x" } }));
    expect(r.ok).toBe(false);
    // THE REASON, NOT JUST THE REFUSAL. `expect(r.ok).toBe(false)`
    // alone SURVIVED a mutation turning a non-JSON 200 into
    // `{ ok: true, data: {} }` — an empty object then failed the
    // editable-fields guard and the refusal looked identical. Two
    // different faults producing one visible outcome is exactly how a
    // test passes for the wrong reason.
    expect(!r.ok && r.reason, "it refused for the wrong reason").toMatch(/no longer exists|not with WordPress REST data/i);
    expect(!r.ok && r.reason).not.toMatch(/editable fields/i);
  });
});

describe("7. rule 3 — no business, product or trade is named", () => {
  it("the adapter carries no tenant vocabulary", async () => {
    const { code } = await import("./helpers/source");
    expect(code("src/lib/publish/platforms/wordpress.ts")).not.toMatch(/candle|qaaf|kurta|dealership_name|salon|bakery/i);
    expect(code("src/lib/commerce/wordpressRest.ts")).not.toMatch(/candle|qaaf|kurta|salon|bakery/i);
  });
});

// ---------------------------------------------------------------------
// A READ WITHOUT `context=edit` HAS NO RAW — and is refused, not guessed.
// ---------------------------------------------------------------------
describe("8. AN ITEM WITH NO EDITABLE FIELDS IS REFUSED", () => {
  /** Exactly what the live API returns without context=edit. */
  const viewOnly = () => ({
    id: 7,
    slug: "sample-page",
    status: "publish",
    link: "https://a-test-site.example/sample-page",
    title: { rendered: "Sample Page" },
    content: { rendered: '\n<p class="wp-block-paragraph">Welcome.</p>\n', protected: false },
    meta: { _yoast_wpseo_title: "", _yoast_wpseo_metadesc: "", footnotes: "" },
    yoast_head_json: { title: "Sample Page - A Test Site" },
  });

  it("THE LOAD-BEARING ONE: preview refuses rather than recording an empty before-value", async () => {
    // A mutation making raw() fall back to `rendered` SURVIVED the
    // first version of this file, because every fixture had `raw`. The
    // case it breaks is the one where raw is ABSENT: before-values all
    // become "", "" compares equal to "" on execute, the staleness
    // check passes, and the adapter overwrites a page it never saw.
    const { impl } = sequence([viewOnly()]);
    const r = await platform(impl).preview(action({ requestedChanges: { html: "<p>new</p>" } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/editable fields/i);
  });

  it("AND EXECUTE REFUSES TOO, writing nothing", async () => {
    // The dangerous half: preview could have been taken when the read
    // was healthy, and execute is the one that writes.
    const { impl, sent } = sequence([viewOnly()]);
    const r = await platform(impl).execute(
      action({
        requestedChanges: { html: "<p>new</p>" },
        preview: previewed([{ field: "content", before: "", after: "<p>new</p>" }]) as any,
        previewedAt: "x",
      })
    );
    expect(r.ok).toBe(false);
    expect(sent.filter((s) => s.method === "POST"), "it wrote over a page it could not read").toHaveLength(0);
  });

  it("and `rendered` is never substituted for it", async () => {
    // The substitution would be worse than the refusal: a transformed
    // value compared against what was written never matches, so every
    // change would read as stale instead.
    const { impl } = sequence([viewOnly()]);
    const r = await platform(impl).preview(action({ requestedChanges: { html: "x" } }));
    expect(!r.ok && r.reason).not.toMatch(/wp-block-paragraph/);
  });
});
