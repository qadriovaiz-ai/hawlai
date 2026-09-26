// Which piece of content produced what (Hawlai Brain, Phase 0).
//
// The brain's loop is EXECUTION -> ANALYTICS -> LEARN -> REMEMBER, and
// it stopped dead at ANALYTICS: content_pieces.strategy_week said a
// piece was CREATED from a week of the plan, page_events counted visits
// by slug, lead_touchpoints recorded the CHANNEL a lead came through —
// and nothing joined a lead back to the post that brought it.
//
// Two things are pinned here. That the join works end to end, and that
// it refuses to draw conclusions from the volume this business actually
// has: ~28 visits and 5 leads in total. A number counted from two clicks
// is worse than no number, because it will be believed.

import { describe, it, expect } from "vitest";

import { attributionUrl, pieceIdFrom, isPieceId, markTrackedLinks, PIECE_PARAM } from "@/lib/attribution/contentLink";
import { contentResults, MIN_VISITS_TO_RANK } from "@/lib/attribution/contentResults";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const OTHER = "99999999-9999-4999-8999-999999999999";

describe("the mark on a link", () => {
  it("is added without disturbing what's already there", () => {
    expect(attributionUrl("https://hawlai.online/site/candle-by-qaaf", P1)).toBe(`https://hawlai.online/site/candle-by-qaaf?${PIECE_PARAM}=${P1}`);
    // An existing query and a fragment both survive.
    const withUtm = attributionUrl("https://x.in/p?utm_source=instagram&utm_medium=bio#book", P1);
    expect(withUtm).toContain("utm_source=instagram");
    expect(withUtm).toContain(`${PIECE_PARAM}=${P1}`);
    expect(withUtm).toContain("#book");
    // Channel attribution is a different question and is left alone.
    expect(withUtm).toContain("utm_medium=bio");
  });

  it("relative links keep their shape", () => {
    expect(attributionUrl("/book/candle-by-qaaf", P1)).toBe(`/book/candle-by-qaaf?${PIECE_PARAM}=${P1}`);
  });

  it("a link is never mangled for the sake of tracking it", () => {
    // No piece, an unusable url, or an id that isn't one: the link the
    // customer needs comes back exactly as it went in.
    expect(attributionUrl("https://calendly.com/candlebyqaaf/workshop", null)).toBe("https://calendly.com/candlebyqaaf/workshop");
    expect(attributionUrl("https://calendly.com/candlebyqaaf/workshop", "not-an-id")).toBe("https://calendly.com/candlebyqaaf/workshop");
    expect(attributionUrl("", P1)).toBe("");
    // Marked twice is still marked once.
    const once = attributionUrl("https://x.in/p", P1);
    expect(attributionUrl(once, P2)).toBe(once);
  });

  it("only a real id is read back off a url", () => {
    expect(pieceIdFrom(`?${PIECE_PARAM}=${P1}`)).toBe(P1);
    expect(pieceIdFrom(`?utm_source=ig&${PIECE_PARAM}=${P1.toUpperCase()}`)).toBe(P1);
    expect(pieceIdFrom("?hw=../../etc/passwd")).toBeNull();
    expect(pieceIdFrom("?hw=1 OR 1=1")).toBeNull();
    expect(pieceIdFrom("")).toBeNull();
    expect(isPieceId("' or true--")).toBe(false);
  });
});

describe("marking the links in a caption", () => {
  it("only links to pages Hawlai serves are marked — the tracker never runs anywhere else", () => {
    const caption = "Khud dhaalo apni pehli candle. Slots: https://hawlai.online/book/candle-by-qaaf";
    const r = markTrackedLinks(caption, P1);
    expect(r.marked).toBe(1);
    expect(r.text).toContain(`https://hawlai.online/book/candle-by-qaaf?${PIECE_PARAM}=${P1}`);
  });

  it("A THIRD-PARTY BOOKING LINK IS LEFT ALONE — a parameter there reports nothing", () => {
    // Calendly won't tell us anything, so marking it is noise added to a
    // real customer's link for no return.
    const caption = "Book here: https://calendly.com/candlebyqaaf/workshop";
    expect(markTrackedLinks(caption, P1)).toEqual({ text: caption, marked: 0 });
  });

  it("the sentence around the link is untouched, punctuation included", () => {
    const r = markTrackedLinks("Shop: https://hawlai.online/site/candle-by-qaaf. Aaj hi.", P1);
    expect(r.text).toBe(`Shop: https://hawlai.online/site/candle-by-qaaf?${PIECE_PARAM}=${P1}. Aaj hi.`);
    expect(r.text.endsWith(". Aaj hi.")).toBe(true);
  });

  it("no piece, no change — copy is never rewritten for tracking's sake", () => {
    const caption = "Shop: https://hawlai.online/site/candle-by-qaaf";
    expect(markTrackedLinks(caption, null)).toEqual({ text: caption, marked: 0 });
    expect(markTrackedLinks(caption, "nope")).toEqual({ text: caption, marked: 0 });
    // And a caption with no link at all is returned as-is.
    expect(markTrackedLinks("Link in bio.", P1)).toEqual({ text: "Link in bio.", marked: 0 });
  });
});

// ---- the read model ---------------------------------------------------------
function db(tables: Record<string, any[]>) {
  const from = (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      not: (k: string, _op: string, _v: any) => (filters.push((r) => r[k] !== null && r[k] !== undefined), api),
      gte: () => api,
      maybeSingle: async () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
      then: (res: any, rej: any) =>
        Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const piece = (id: string, kind: string) => ({ id, dealership_id: "d1", kind, label: "Workshop", created_at: "2026-09-01T00:00:00Z" });
const view = (id: string | null, n: number) => Array.from({ length: n }, () => ({ dealership_id: "d1", event_type: "view", marketing_piece_id: id }));

describe("what a piece produced", () => {
  it("visits and leads are counted against the piece that carried the link", async () => {
    const r = await contentResults(
      db({
        marketing_pieces: [piece(P1, "content"), piece(P2, "email")],
        page_events: [...view(P1, 25), ...view(P2, 3), { dealership_id: "d1", event_type: "click", marketing_piece_id: P1 }],
        lead_touchpoints: [
          { dealership_id: "d1", lead_id: "l1", marketing_piece_id: P1 },
          { dealership_id: "d1", lead_id: "l2", marketing_piece_id: P1 },
        ],
      }),
      "d1"
    );

    const first = r.pieces.find((p) => p.pieceId === P1)!;
    expect(first).toMatchObject({ visits: 25, clicks: 1, leads: 2, kind: "content" });
    expect(first.ranked).toBe(true);
    expect(first.leadRate).toBe(8); // 2/25
    expect(r.totals).toMatchObject({ visits: 28, leads: 2, piecesWithAnyVisit: 2 });
  });

  it("one lead counts once for a piece, however many times it came back", async () => {
    const r = await contentResults(
      db({
        marketing_pieces: [piece(P1, "content")],
        page_events: view(P1, 30),
        lead_touchpoints: [
          { dealership_id: "d1", lead_id: "l1", marketing_piece_id: P1 },
          { dealership_id: "d1", lead_id: "l1", marketing_piece_id: P1 },
        ],
      }),
      "d1"
    );
    expect(r.pieces[0].leads).toBe(1);
  });

  it("A PIECE THAT ISN'T THIS BUSINESS'S IS NOT COUNTED, whatever the row says", async () => {
    // The id in a URL is public and anyone can type one. Ownership is
    // decided by the catalogue of pieces, never by the event row.
    const r = await contentResults(
      db({
        marketing_pieces: [piece(P1, "content")],
        page_events: [...view(P1, 20), ...view(OTHER, 500)],
        lead_touchpoints: [{ dealership_id: "d1", lead_id: "l1", marketing_piece_id: OTHER }],
      }),
      "d1"
    );
    expect(r.pieces.map((p) => p.pieceId)).toEqual([P1]);
    expect(r.totals.visits).toBe(20);
    expect(r.totals.leads).toBe(0);
  });
});

describe("the lead is credited to the piece that brought them in", () => {
  /** page_events for one visitor, plus whatever the bridge writes. */
  function bridgeDb(events: any[]) {
    const upserted: any[] = [];
    const supabase = {
      from: (table: string) => {
        const api: any = {
          select: () => api,
          eq: () => api,
          gte: () => api,
          order: () => Promise.resolve({ data: events, error: null }),
          upsert: async (rows: any[]) => (upserted.push(...rows), { error: null }),
        };
        return api;
      },
    };
    return { supabase, upserted };
  }

  it("ONLY THE FIRST piece gets the credit — a visitor who read three posts was brought in by one", async () => {
    const { bridgeVisitorTouchpoints } = await import("@/lib/agents/touchpointAgent");
    const { supabase, upserted } = bridgeDb([
      { event_type: "view", created_at: "2026-09-10T10:00:00Z", utm_source: null, utm_medium: null, marketing_piece_id: P1 },
      { event_type: "view", created_at: "2026-09-11T10:00:00Z", utm_source: null, utm_medium: null, marketing_piece_id: P2 },
      { event_type: "view", created_at: "2026-09-12T10:00:00Z", utm_source: null, utm_medium: null, marketing_piece_id: P2 },
    ]);

    await bridgeVisitorTouchpoints(supabase, { leadId: "l1", dealershipId: "d1", visitorId: "v1" });

    const content = upserted.filter((r) => r.marketing_piece_id);
    expect(content).toHaveLength(1);
    // Crediting all three would make every piece look like it produces leads.
    expect(content[0]).toMatchObject({ lead_id: "l1", channel: "content", marketing_piece_id: P1, occurred_at: "2026-09-10T10:00:00Z" });
  });

  it("the channel touchpoints still mean exactly what they meant before", async () => {
    const { bridgeVisitorTouchpoints } = await import("@/lib/agents/touchpointAgent");
    const { supabase, upserted } = bridgeDb([
      { event_type: "chat_open", created_at: "2026-09-10T10:00:00Z", utm_source: "instagram", utm_medium: "bio", marketing_piece_id: P1 },
    ]);

    await bridgeVisitorTouchpoints(supabase, { leadId: "l1", dealershipId: "d1", visitorId: "v1" });

    expect(upserted.map((r) => r.channel).sort()).toEqual(["chat_widget", "content", "instagram/bio"]);
    // The channel rows carry no piece — they answer a different question.
    expect(upserted.find((r) => r.channel === "chat_widget")!.content_piece_id).toBeUndefined();
  });

  it("no visitor id, nothing bridged — consent still gates the person-level link", async () => {
    const { bridgeVisitorTouchpoints } = await import("@/lib/agents/touchpointAgent");
    const { supabase, upserted } = bridgeDb([
      { event_type: "view", created_at: "2026-09-10T10:00:00Z", utm_source: null, utm_medium: null, marketing_piece_id: P1 },
    ]);
    await bridgeVisitorTouchpoints(supabase, { leadId: "l1", dealershipId: "d1", visitorId: null });
    expect(upserted).toHaveLength(0);
  });
});

describe("it refuses to draw a conclusion it can't support", () => {
  it("THE REAL BUSINESS TODAY: a handful of visits gets no rate at all", async () => {
    // candle_by_qaaf's actual scale — ~28 visits, 5 leads, spread thin.
    const r = await contentResults(
      db({
        marketing_pieces: [piece(P1, "content"), piece(P2, "email")],
        page_events: [...view(P1, 4), ...view(P2, 2)],
        lead_touchpoints: [{ dealership_id: "d1", lead_id: "l1", marketing_piece_id: P1 }],
      }),
      "d1"
    );
    const first = r.pieces.find((p) => p.pieceId === P1)!;
    // One lead from four visits is NOT "a 25% conversion rate".
    expect(first.leads).toBe(1);
    expect(first.visits).toBe(4);
    expect(first.leadRate).toBeNull();
    expect(first.ranked).toBe(false);
    expect(r.thin).toContain(`${MIN_VISITS_TO_RANK} visits`);
    expect(r.thin).toContain("the comparison isn't there yet");
  });

  it("nothing tracked yet is said plainly, not shown as zero performance", async () => {
    const r = await contentResults(db({ marketing_pieces: [piece(P1, "content")], page_events: [], lead_touchpoints: [] }), "d1");
    expect(r.pieces).toEqual([]);
    expect(r.thin).toContain("nothing to compare");
  });

  it("one good piece still isn't a pattern", async () => {
    const r = await contentResults(
      db({
        marketing_pieces: [piece(P1, "content"), piece(P2, "email")],
        page_events: [...view(P1, 40), ...view(P2, 5)],
        lead_touchpoints: [{ dealership_id: "d1", lead_id: "l1", marketing_piece_id: P1 }],
      }),
      "d1"
    );
    expect(r.pieces.find((p) => p.pieceId === P1)!.ranked).toBe(true);
    // Ranked, but one ranked piece can't say what kind of content works.
    expect(r.thin).toContain("too few to say what kind of content works");
  });
});
