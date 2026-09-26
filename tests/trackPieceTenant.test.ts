// A content-piece id in a public URL proves nothing (Phase 0).
//
// /api/public/track is unauthenticated by necessity — it is called by a
// visitor's browser on a public storefront — and it runs on the service
// client, which bypasses RLS. So the ?hw= id arriving with an event is
// attacker-controlled input: anyone can put any id in any URL. Kept only
// once it is confirmed to be a piece belonging to the same business as
// the page it fired on, or one business's traffic could be written
// against another business's content.

import { describe, it, expect, vi, beforeEach } from "vitest";

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";

let tables: Record<string, any[]>;
let inserted: any[];

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: any) => {
        inserted.push(row);
        return { data: row, error: null };
      },
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { POST } from "@/app/api/public/track/route";

const call = (body: any) =>
  POST(new Request("https://hawlai.online/api/public/track", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  inserted = [];
  tables = {
    landing_pages: [],
    websites: [{ slug: "candle-by-qaaf", dealership_id: "d1", published: true }],
    // MINE is candle_by_qaaf's registry row. THEIRS belongs to another business.
    marketing_pieces: [
      { id: MINE, dealership_id: "d1" },
      { id: THEIRS, dealership_id: "d2" },
    ],
  };
});

describe("the piece id on a public event", () => {
  it("this business's own piece is recorded", async () => {
    await call({ slug: "candle-by-qaaf", eventType: "view", contentPieceId: MINE });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].marketing_piece_id).toBe(MINE);
    expect(inserted[0].dealership_id).toBe("d1");
  });

  it("ANOTHER BUSINESS'S PIECE IS DROPPED — the visit is still counted, the credit isn't", async () => {
    await call({ slug: "candle-by-qaaf", eventType: "view", contentPieceId: THEIRS });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].marketing_piece_id).toBeNull();
    expect(inserted[0].dealership_id).toBe("d1");
  });

  it("an id that was never a piece, or isn't an id at all, is dropped", async () => {
    for (const bad of ["99999999-9999-4999-8999-999999999999", "' or 1=1 --", "../../admin", "", null, 42, { id: MINE }]) {
      inserted = [];
      await call({ slug: "candle-by-qaaf", eventType: "view", contentPieceId: bad });
      expect(inserted[0].marketing_piece_id, String(bad)).toBeNull();
    }
  });

  it("tracking still never breaks the page", async () => {
    const res = await call({ slug: "candle-by-qaaf", eventType: "view", contentPieceId: THEIRS });
    expect(res.status).toBe(200);
    // And an unknown slug writes nothing at all, as before.
    inserted = [];
    const unknown = await call({ slug: "not-a-site", eventType: "view", contentPieceId: MINE });
    expect(unknown.status).toBe(200);
    expect(inserted).toHaveLength(0);
  });
});
