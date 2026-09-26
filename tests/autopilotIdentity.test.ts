// An autopilot post is a published piece like any other.
//
// It used to exist only in content_autopilot_log — a table the owner
// never sees — so a post that went out unreviewed had no row on the
// Content Marketing page and no identity to attribute a visit to. It now
// saves a real content_pieces row (which is what puts it on that page)
// and registers it, so the Facebook caption can carry the mark.
//
// Saved BEFORE posting, because the caption can only carry a mark once
// the piece has an identity. A post that then fails leaves the generated
// caption behind for the owner to reuse; the failure itself shows on the
// Automation Health card exactly as before.

import { describe, it, expect, vi, beforeEach } from "vitest";

const DEALER = "d1";
const SITE = "https://hawlai.online/book/candle-by-qaaf";
const CAPTION = `Khud dhaalo apni pehli candle. Book: ${SITE}`;

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let postedTo: { fb: string | null; ig: string | null };
let failPost: boolean;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let staged: Row | null = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), ...staged };
        (tables[table] ??= []).push(row);
        return row;
      }
      if (mode === "update") {
        const t = rows()[0];
        if (t) Object.assign(t, staged);
        return t ?? null;
      }
      return rows()[0] ?? null;
    };
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      gte: () => api,
      not: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (row: Row) => ((mode = "insert"), (staged = row), api),
      update: (row: Row) => ((mode = "update"), (staged = row), api),
      single: async () => ({ data: run(), error: null }),
      maybeSingle: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: mode === "select" ? rows() : [run()], error: null }).then(res, rej),
    };
    return api;
  };
  return {
    from,
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn/x.png" } }) }) },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/agents/graphicDesignAgent", () => ({ generateGraphic: async () => Buffer.from("png") }));
vi.mock("@/lib/agents/contentMarketingAgent", () => ({
  generateContent: async () => ({ output: { caption: CAPTION }, _fallback: false, claimsRemoved: [] }),
}));
vi.mock("@/lib/content/recentCopy", () => ({ recentCopy: async () => [] }));
vi.mock("@/lib/claims/businessFacts", () => ({
  gatherBusinessFactsSafely: async () => ({ links: { store: SITE, products: [], booking: null }, products: [] }),
}));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "TOKEN", hasMetaPageToken: () => true }));
vi.mock("@/lib/agents/socialMediaAgent", () => ({
  postPhotoToPage: async (_p: string, _t: string, _u: string, caption: string) => {
    postedTo.fb = caption;
    if (failPost) throw new Error("Facebook said no");
    return { id: "fb1" };
  },
  getConnectedInstagramAccountId: async () => "IG1",
  postPhotoToInstagram: async (_i: string, _t: string, _u: string, caption: string) => ((postedTo.ig = caption), { id: "ig1" }),
  readPostMessage: async () => CAPTION,
}));

import { runContentAutopilot } from "@/lib/automation/contentAutopilot";
import { PIECE_PARAM } from "@/lib/attribution/contentLink";

beforeEach(() => {
  postedTo = { fb: null, ig: null };
  failPost = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    dealerships: [{
      id: DEALER, dealership_name: "Candle by Qaaf", business_category: "Home fragrance",
      fb_page_id: "PAGE1", fb_page_access_token: "TOKEN",
      content_autopilot_enabled: true, content_autopilot_frequency_days: 1, content_autopilot_last_posted_at: null,
    }],
    brand_profiles: [{ dealership_id: DEALER, tone_of_voice: "warm", messaging_pillars: ["Workshop"] }],
    content_pieces: [],
    marketing_pieces: [],
    content_autopilot_log: [],
  };
});

describe("an autopilot post gets an identity", () => {
  it("THE GAP CLOSED: it lands in content_pieces, so the owner sees it on the Content Marketing page", async () => {
    await runContentAutopilot(db(), DEALER);

    expect(tables.content_pieces).toHaveLength(1);
    expect(tables.content_pieces[0]).toMatchObject({ dealership_id: DEALER, content_type: "instagram_post" });
    // Registered as 'autopilot', not 'content': posted with nobody
    // reviewing it, and results should keep showing that difference.
    expect(tables.marketing_pieces[0]).toMatchObject({
      kind: "autopilot", source_table: "content_pieces", source_id: tables.content_pieces[0].id,
    });
  });

  it("the Facebook caption carries the mark; Instagram's does not", async () => {
    await runContentAutopilot(db(), DEALER);
    const piece = tables.marketing_pieces[0];
    expect(postedTo.fb).toContain(`${SITE}?${PIECE_PARAM}=${piece.id}`);
    expect(postedTo.ig).toBe(CAPTION);
    expect(postedTo.ig).not.toContain(PIECE_PARAM);
  });

  it("a failed post still records the failure — the identity doesn't hide it", async () => {
    failPost = true;
    await runContentAutopilot(db(), DEALER);
    const log = tables.content_autopilot_log[0];
    expect(log.success).toBe(false);
    expect(log.error).toContain("Facebook said no");
  });
});
