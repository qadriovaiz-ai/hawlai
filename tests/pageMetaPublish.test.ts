// Writing a page's search title and description, and proving it landed.
//
// The rule this whole path exists to enforce: "we wrote the row" is not
// "it is live". After the write, the platform fetches the real page and
// reads the rendered <title> and <meta name="description"> back, and
// only a match is allowed to be called live.

import { describe, it, expect, vi } from "vitest";
import { createHawlaiSitePlatform, TITLE_LIMIT, DESCRIPTION_LIMIT } from "../src/lib/publish/platforms/hawlaiSite";
import { parseTitle, parseDescription, parseImage, decodeEntities, verifyAgainst, storefrontUrl } from "../src/lib/seo/liveMeta";
import type { PublishActionRecord } from "../src/lib/publish/types";

const OWNER_DESCRIPTION =
  "Hand-poured soy candles made by hand in Shahjahanpur, in small batches, with fragrance that lasts the whole evening. Shop now.";

type PageRow = { id: string; website_id: string; slug: string; title: string | null; seo_title: string | null; meta_description: string | null; og_image_url: string | null };

function db(page: PageRow, site: { id: string; slug: string; published: boolean; dealership_id: string }) {
  const writes: Record<string, unknown>[] = [];
  const client = {
    writes,
    from(table: string) {
      const chain: any = {
        _update: null as Record<string, unknown> | null,
        select: () => chain,
        eq: () => chain,
        limit: async () => ({ data: [{ id: site.id }] }),
        update(values: Record<string, unknown>) {
          chain._update = values;
          return chain;
        },
        maybeSingle: async () => {
          if (chain._update) {
            writes.push(chain._update);
            Object.assign(page, {
              seo_title: "seo_title" in chain._update ? chain._update.seo_title : page.seo_title,
              meta_description: "meta_description" in chain._update ? chain._update.meta_description : page.meta_description,
              og_image_url: "og_image_url" in chain._update ? chain._update.og_image_url : page.og_image_url,
            });
            return { data: { id: page.id } };
          }
          return { data: table === "websites" ? site : page };
        },
      };
      return chain;
    },
  };
  return client;
}

function action(changes: Record<string, unknown>, preview?: any): PublishActionRecord {
  return {
    id: "a1",
    dealershipId: "d1",
    platform: "hawlai_site",
    connectionRef: null,
    actionKey: "update_page_meta",
    targetRef: "p1",
    targetLabel: "Home",
    requestedChanges: changes,
    preview: preview ?? null,
    previewedAt: null,
    status: "awaiting_approval",
    idempotencyKey: "k1",
  };
}

const homePage = (): PageRow => ({ id: "p1", website_id: "w1", slug: "home", title: "Home", seo_title: null, meta_description: null, og_image_url: null });
const liveSite = { id: "w1", slug: "qaaf", published: true, dealership_id: "d1" };

/** What Next actually serves — entities and all. */
function servedHtml(title: string, description: string | null): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  return `<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}"/>` : ""}</head><body>…</body></html>`;
}

function fetchServing(title: string, description: string | null) {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => servedHtml(title, description) })) as any;
}

describe("previewing a page's search title and description", () => {
  it("shows what is there now and what it would become", async () => {
    const platform = createHawlaiSitePlatform({ supabase: db(homePage(), liveSite), baseUrl: "https://hawlai.test" });
    const result = await platform.preview(action({ seoTitle: "Candles from Shahjahanpur", metaDescription: OWNER_DESCRIPTION }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.changes).toEqual([
      { field: "seoTitle", before: null, after: "Candles from Shahjahanpur" },
      { field: "metaDescription", before: null, after: OWNER_DESCRIPTION },
    ]);
  });

  it("WARNS about length and saves the text whole — never shortens it", async () => {
    const longTitle = "A".repeat(TITLE_LIMIT + 15);
    const longDescription = "B".repeat(DESCRIPTION_LIMIT + 40);
    const platform = createHawlaiSitePlatform({ supabase: db(homePage(), liveSite), baseUrl: "https://hawlai.test" });
    const result = await platform.preview(action({ seoTitle: longTitle, metaDescription: longDescription }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The owner's text, untouched — this is the fix for a model that
    // shortened a 150-character line and blamed a limit.
    expect(result.preview.changes.find((c) => c.field === "seoTitle")!.after).toBe(longTitle);
    expect(result.preview.changes.find((c) => c.field === "metaDescription")!.after).toBe(longDescription);
    expect(result.preview.warnings.join(" ")).toMatch(new RegExp(`${TITLE_LIMIT + 15} characters`));
    expect(result.preview.warnings.join(" ")).toMatch(/Saved exactly as written/);
  });

  it("says so when the site isn't published, because then nothing is public", async () => {
    const platform = createHawlaiSitePlatform({ supabase: db(homePage(), { ...liveSite, published: false }), baseUrl: "https://hawlai.test" });
    const result = await platform.preview(action({ metaDescription: OWNER_DESCRIPTION }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.warnings.join(" ")).toMatch(/isn't published/);
  });

  it("promises the menu link stays as it is", async () => {
    const platform = createHawlaiSitePlatform({ supabase: db(homePage(), liveSite), baseUrl: "https://hawlai.test" });
    const result = await platform.preview(action({ seoTitle: "Candles from Shahjahanpur" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.warnings.join(" ")).toMatch(/menu link stays "Home"/);
  });

  it("refuses an empty request rather than writing nothing and claiming success", async () => {
    const platform = createHawlaiSitePlatform({ supabase: db(homePage(), liveSite) });
    const result = await platform.preview(action({}));
    expect(result.ok).toBe(false);
  });
});

describe("executing it, and reading the live page back", () => {
  const previewOf = (changes: { field: string; before: string | null; after: string }[]) => ({ summary: "", changes, warnings: [] });

  it("writes, then confirms LIVE only after the page serves the same text", async () => {
    const page = homePage();
    const store = db(page, liveSite);
    const fetchImpl = fetchServing("Candles from Shahjahanpur", OWNER_DESCRIPTION);
    const platform = createHawlaiSitePlatform({ supabase: store, fetchImpl, baseUrl: "https://hawlai.test" });

    const result = await platform.execute(
      action(
        { seoTitle: "Candles from Shahjahanpur", metaDescription: OWNER_DESCRIPTION },
        previewOf([
          { field: "seoTitle", before: null, after: "Candles from Shahjahanpur" },
          { field: "metaDescription", before: null, after: OWNER_DESCRIPTION },
        ])
      )
    );

    expect(result.ok).toBe(true);
    expect(store.writes[0]).toMatchObject({ seo_title: "Candles from Shahjahanpur", meta_description: OWNER_DESCRIPTION });
    expect(fetchImpl).toHaveBeenCalledWith("https://hawlai.test/site/qaaf", expect.anything());
    const verification = (result as any).platformResponse.verification;
    expect(verification.verified).toBe(true);
    expect(verification.message).toMatch(/^Live —/);
  });

  it("does NOT say live when the page is still serving the old text", async () => {
    const page = homePage();
    const platform = createHawlaiSitePlatform({
      supabase: db(page, liveSite),
      // The write landed; the page has not caught up (unpublished site,
      // a cache, a different field). This is the exact gap that made the
      // original "Done — that's set" a lie.
      fetchImpl: fetchServing("Candle by Qaaf", null),
      baseUrl: "https://hawlai.test",
    });

    const result = await platform.execute(
      action({ metaDescription: OWNER_DESCRIPTION }, previewOf([{ field: "metaDescription", before: null, after: OWNER_DESCRIPTION }]))
    );

    // The write succeeded — this is not a failed action.
    expect(result.ok).toBe(true);
    const verification = (result as any).platformResponse.verification;
    expect(verification.verified).toBe(false);
    expect(verification.message).toMatch(/not live yet/);
    expect(verification.message).toMatch(/the description still reads \(nothing\)/);
  });

  it("reports a page it couldn't fetch as unconfirmed, not as failed or as live", async () => {
    const platform = createHawlaiSitePlatform({
      supabase: db(homePage(), liveSite),
      fetchImpl: vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })) as any,
      baseUrl: "https://hawlai.test",
    });
    const result = await platform.execute(
      action({ metaDescription: OWNER_DESCRIPTION }, previewOf([{ field: "metaDescription", before: null, after: OWNER_DESCRIPTION }]))
    );
    expect(result.ok).toBe(true);
    const verification = (result as any).platformResponse.verification;
    expect(verification.verified).toBe(false);
    expect(verification.message).toMatch(/isn't published yet/);
  });

  it("refuses to write when the page moved after the owner reviewed it", async () => {
    const page = { ...homePage(), meta_description: "Someone else changed this in the meantime" };
    const store = db(page, liveSite);
    const platform = createHawlaiSitePlatform({ supabase: store, fetchImpl: fetchServing("x", null), baseUrl: "https://hawlai.test" });

    const result = await platform.execute(
      action({ metaDescription: OWNER_DESCRIPTION }, previewOf([{ field: "metaDescription", before: null, after: OWNER_DESCRIPTION }]))
    );
    expect(result).toMatchObject({ ok: false, stale: true });
    expect(store.writes).toHaveLength(0);
  });

  it("treats an already-applied change as done, so a retry doesn't demand re-approval", async () => {
    const page = { ...homePage(), meta_description: OWNER_DESCRIPTION };
    const store = db(page, liveSite);
    const platform = createHawlaiSitePlatform({ supabase: store, fetchImpl: fetchServing("Candle by Qaaf", OWNER_DESCRIPTION), baseUrl: "https://hawlai.test" });

    const result = await platform.execute(
      action({ metaDescription: OWNER_DESCRIPTION }, previewOf([{ field: "metaDescription", before: null, after: OWNER_DESCRIPTION }]))
    );
    expect(result.ok).toBe(true);
    expect(store.writes).toHaveLength(0);
    expect((result as any).platformResponse.verification.verified).toBe(true);
  });
});

describe("reading tags out of a real page", () => {
  it("decodes entities, so text that matches is not reported as a mismatch", () => {
    // An apostrophe and an ampersand are ordinary in a business name,
    // and both leave Next as entities. Comparing the raw markup against
    // what the owner typed would call a correct page wrong.
    const html = servedHtml("Qaaf's candles & oils", 'Poured by hand — "small batches", nothing rushed.');
    expect(html).toContain("&#x27;");
    expect(parseTitle(html)).toBe("Qaaf's candles & oils");
    expect(parseDescription(html)).toBe('Poured by hand — "small batches", nothing rushed.');
  });

  it("finds the description whatever order the attributes are in", () => {
    expect(parseDescription('<meta content="Poured by hand" name="description"/>')).toBe("Poured by hand");
    expect(parseDescription("<meta name='description' content='Poured by hand'>")).toBe("Poured by hand");
    // Not any old meta tag.
    expect(parseDescription('<meta name="og:description" content="Something else"/>')).toBeNull();
  });

  it("decodes exactly once, so text the owner typed as an entity survives", () => {
    // They typed "candles &amp; oils"; Next serves "&amp;amp;"; one
    // decode gives their own string back. A second pass would turn it
    // into "&" and report a mismatch against a correct page.
    expect(decodeEntities("candles &amp;amp; oils")).toBe("candles &amp; oils");
    expect(decodeEntities("candles &amp; oils")).toBe("candles & oils");
    expect(decodeEntities("Qaaf&#39;s")).toBe("Qaaf's");
    expect(decodeEntities("30&#37; off")).toBe("30% off");
  });

  it("builds the right public address for home and inner pages", () => {
    expect(storefrontUrl("qaaf", "home", "https://hawlai.test/")).toBe("https://hawlai.test/site/qaaf");
    expect(storefrontUrl("qaaf", "about", "https://hawlai.test")).toBe("https://hawlai.test/site/qaaf/about");
  });

  it("says it could not check when there is no address to check", () => {
    const verdict = verifyAgainst({ description: OWNER_DESCRIPTION }, { ok: false, url: "/site/qaaf", reason: "No public address." });
    expect(verdict.verified).toBe(false);
    expect(verdict.message).toMatch(/Nothing is confirmed live yet/);
  });
});

describe("the share image — the picture a link preview shows", () => {
  const previewOf = (changes: { field: string; before: string | null; after: string }[]) => ({ summary: "", changes, warnings: [] });
  const PHOTO = "https://cdn.hawlai.test/candle.jpg";

  function servingWithImage(title: string, description: string | null, image: string | null) {
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
    return vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        `<html><head><title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}"/>` : ""}${image ? `<meta property="og:image" content="${esc(image)}"/>` : ""}</head></html>`,
    })) as any;
  }

  it("is read from og:image, which is what WhatsApp actually looks at", () => {
    const html = `<html><head><meta property="og:image" content="${PHOTO}"/><meta name="image" content="https://wrong.test/x.png"/></head></html>`;
    expect(parseImage(html)).toBe(PHOTO);
    // `name="image"` is not Open Graph and no preview reads it.
    expect(parseImage(`<meta name="image" content="${PHOTO}"/>`)).toBeNull();
  });

  it("writes it and confirms the page is SERVING it", async () => {
    const page = { ...homePage(), og_image_url: null };
    const store = db(page, liveSite);
    const platform = createHawlaiSitePlatform({ supabase: store, fetchImpl: servingWithImage("Candle by Qaaf", null, PHOTO), baseUrl: "https://hawlai.test" });

    const result = await platform.execute(
      action({ ogImageUrl: PHOTO }, previewOf([{ field: "ogImageUrl", before: null, after: PHOTO }]))
    );
    expect(result.ok).toBe(true);
    expect(store.writes[0]).toMatchObject({ og_image_url: PHOTO });
    const verification = (result as any).platformResponse.verification;
    expect(verification.verified).toBe(true);
    expect(verification.message).toMatch(/share image/);
  });

  it("does NOT claim a share image that the page is not serving", async () => {
    // Saving the URL to the row proves nothing about a link preview —
    // the same distinction the title and description already make.
    const platform = createHawlaiSitePlatform({
      supabase: db({ ...homePage(), og_image_url: null }, liveSite),
      fetchImpl: servingWithImage("Candle by Qaaf", null, null),
      baseUrl: "https://hawlai.test",
    });
    const result = await platform.execute(
      action({ ogImageUrl: PHOTO }, previewOf([{ field: "ogImageUrl", before: null, after: PHOTO }]))
    );
    expect(result.ok).toBe(true);
    const verification = (result as any).platformResponse.verification;
    expect(verification.verified).toBe(false);
    expect(verification.message).toMatch(/share image is still not set/);
  });

  it("shows it on the card as a change an owner can read", async () => {
    const platform = createHawlaiSitePlatform({ supabase: db({ ...homePage(), og_image_url: null }, liveSite), baseUrl: "https://hawlai.test" });
    const result = await platform.preview(action({ ogImageUrl: PHOTO }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.summary).toContain("Share image");
    expect(result.preview.changes).toEqual([{ field: "ogImageUrl", before: null, after: PHOTO }]);
  });
});
