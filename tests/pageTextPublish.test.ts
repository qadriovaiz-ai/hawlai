// The write, the staleness check and the read-back for page copy.
//
// The approval card is only half the guarantee. The other half is what
// happens when the owner presses Approve some minutes later: the page
// may have moved on, the write may match nothing, and the row being
// written is not what a visitor reads. All three have bitten this
// product before —
//
//   - a tool reported success on an update that matched ZERO rows,
//     because Supabase calls that success with error: null;
//   - a card computed from fixed-since preview code showed one value and
//     wrote another;
//   - chat said "✅ Updated your live homepage" on a 200 from the write.
//
// So: re-read before writing, refuse when the line moved under us, and
// fetch the public page afterwards — with "live" reserved for the case
// where the words are genuinely being served.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";

const BEFORE = "Small-batch soy candles, poured by hand.";
const AFTER = "Hand-poured soy candles, made in Shahjahanpur.";

const tree = (text: string) => [
  {
    id: "s1",
    type: "section",
    props: { background: "dark" },
    children: [{ id: "t1", type: "text", props: { html: text, _source: "generated" }, children: [] }],
  },
];

let page: any;
let site: any;
const writes: any[] = [];

function db(): any {
  return {
    from(table: string) {
      const filters: Record<string, any> = {};
      const chain: any = {
        select: () => chain,
        eq(col: string, value: any) { filters[col] = value; return chain; },
        update(values: any) { writes.push(values); return chain; },
        async maybeSingle() {
          if (table === "website_pages") {
            // The update's .select("id").maybeSingle()
            if (writes.length > 0 && filters.website_id) return { data: { id: page.id }, error: null };
            return { data: { ...page, website_id: site.id }, error: null };
          }
          if (table === "websites") return { data: filters.dealership_id === site.dealership_id ? site : null, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

/** A page as Next really serves it, with the RSC payload in a script. */
function served(text: string): string {
  return `<!DOCTYPE html><html><head><title>Candle by Qaaf</title></head><body>
    <section><p>${text}</p></section>
    <script>self.__next_f.push([1,"{\\"html\\":\\"${AFTER}\\"}"])</script>
  </body></html>`;
}

let serve: () => Promise<any>;
const fetchImpl = (async () => serve()) as unknown as typeof fetch;

function action(overrides: any = {}) {
  return {
    id: "a1",
    dealershipId: "d1",
    platform: "hawlai_site",
    actionKey: "update_page_text",
    targetRef: "p1",
    requestedChanges: { edits: [{ blockId: "t1", prop: "html", blockType: "text", before: BEFORE, after: AFTER, source: "generated" }] },
    preview: { summary: "", changes: [{ field: "t1:html", before: BEFORE, after: AFTER }], warnings: [] },
    ...overrides,
  } as any;
}

async function platform() {
  const { createHawlaiSitePlatform } = await import("@/lib/publish/platforms/hawlaiSite");
  return createHawlaiSitePlatform({ supabase: db(), fetchImpl });
}

beforeEach(() => {
  page = { id: "p1", website_id: "w1", slug: "home", title: "Home", page_type: "home", sections: tree(BEFORE), seo_title: "Candle by Qaaf", meta_description: "Hand-poured.", og_image_url: null, content_source: "generated" };
  site = { id: "w1", slug: "candle-by-qaaf", published: true, dealership_id: "d1" };
  writes.length = 0;
  serve = async () => ({ ok: true, status: 200, text: async () => served(AFTER) });
});
afterEach(() => vi.unstubAllGlobals());

describe("the preview reads the page, not the request", () => {
  it("shows what the line says now, even when the card was built from stale text", async () => {
    // Someone edited the page in Website Builder after chat read it.
    page.sections = tree("Poured in small batches.");
    const result = await (await platform()).preview(action());
    expect(result.ok).toBe(true);
    // The approver sees the page's REAL current wording.
    expect((result as any).preview.changes).toEqual([{ field: "t1:html", before: "Poured in small batches.", after: AFTER }]);
  });

  it("refuses when the line has gone from the page entirely", async () => {
    page.sections = [{ id: "s1", type: "section", props: {}, children: [] }];
    const result = await (await platform()).preview(action());
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/aren't on the page any more/);
  });
});

describe("execute re-verifies before it writes", () => {
  it("writes the sections and reports live once the page serves them", async () => {
    const result: any = await (await platform()).execute(action());
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0].sections)).toContain(AFTER);
    expect(result.platformResponse.verification.verified).toBe(true);
    expect(result.platformResponse.verification.message).toMatch(/^Live — I read/);
  });

  it("does NOT flip content_source for a draft Hawlai wrote", async () => {
    await (await platform()).execute(action());
    expect(writes[0].content_source).toBeUndefined();
  });

  it("flips content_source when the owner dictated the words", async () => {
    await (await platform()).execute(
      action({ requestedChanges: { edits: [{ blockId: "t1", prop: "html", blockType: "text", before: BEFORE, after: AFTER, source: "edited" }] } })
    );
    expect(writes[0].content_source).toBe("edited");
  });

  it("refuses as STALE when the line moved since the preview", async () => {
    page.sections = tree("Someone else changed this in Website Builder.");
    const result: any = await (await platform()).execute(action());
    expect(result.ok).toBe(false);
    expect(result.stale).toBe(true);
    expect(result.changed[0].after).toBe("Someone else changed this in Website Builder.");
    expect(writes).toEqual([]);
  });

  it("reports success, not stale, when the write already landed and the call was retried", async () => {
    // ALREADY-AT-TARGET IS CHECKED BEFORE STALENESS. A write that
    // succeeded and then timed out would otherwise compare the new text
    // against the recorded before and demand re-approval for something
    // that worked.
    page.sections = tree(AFTER);
    const result: any = await (await platform()).execute(action());
    expect(result.ok).toBe(true);
    expect(result.platformResponse.skipped).toMatch(/already at the requested wording/);
    expect(writes).toEqual([]);
  });
});

describe("only a served page counts as live", () => {
  it("says saved-but-not-live when the page is still serving the old words", async () => {
    serve = async () => ({ ok: true, status: 200, text: async () => served(BEFORE) });
    const result: any = await (await platform()).execute(action());
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(result.platformResponse.verification.verified).toBe(false);
    expect(result.platformResponse.verification.message).toMatch(/^Saved, but not live yet/);
  });

  it("is not fooled by the new text sitting in Next's script payload", async () => {
    // served(BEFORE) still carries AFTER inside __next_f — a raw
    // substring search would confirm "live" for the page above.
    serve = async () => ({ ok: true, status: 200, text: async () => served(BEFORE) });
    const result: any = await (await platform()).execute(action());
    expect(result.platformResponse.verification.verified).toBe(false);
  });

  it("reports a page it could not read as unverified, never as a failed write", async () => {
    serve = async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); };
    const result: any = await (await platform()).execute(action());
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(result.platformResponse.verification.verified).toBe(false);
    expect(result.platformResponse.verification.message).toMatch(/didn't answer in time/);
    expect(result.platformResponse.verification.message).not.toMatch(/couldn't save|not saved/i);
  });

  it("does not fetch an unpublished site, and says why", async () => {
    site.published = false;
    let fetched = false;
    serve = async () => { fetched = true; return { ok: true, status: 200, text: async () => served(AFTER) }; };
    const result: any = await (await platform()).execute(action());
    expect(result.ok).toBe(true);
    expect(fetched).toBe(false);
    expect(result.platformResponse.verification.message).toMatch(/isn't published yet/);
  });
});

describe("the platform refuses what isn't its business", () => {
  it("will not act on another dealership's page", async () => {
    const result = await (await platform()).execute(action({ dealershipId: "d2" }));
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/no longer on your website/);
    expect(writes).toEqual([]);
  });

  it("refuses an action that was never previewed", async () => {
    const result = await (await platform()).execute(action({ preview: null }));
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/never previewed/);
  });

  it("still supports the meta action it shares the platform with", async () => {
    const p = await platform();
    expect(p.supports).toContain("update_page_meta");
    expect(p.supports).toContain("update_page_text");
  });
});
