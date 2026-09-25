// What a piece of content actually produced — counted, never estimated.
//
// The same rule diagnosis.ts follows, for the same reason: every number
// here is counted in code from the business's own rows. A model may be
// handed these figures to interpret; it never produces them, and it may
// not quote one that isn't here.
//
// THE HONESTY THAT MATTERS MOST: a piece with four visits and one lead
// has not "converted at 25%". `ranked` says whether a piece has enough
// behind it to be compared with another at all, and `thin` says so in
// words when nothing does. candle_by_qaaf has ~28 visits and 5 leads in
// total, so today the honest answer for almost every piece is "too
// little to tell" — and that is the answer it will give, rather than a
// confident percentage built out of two clicks.

export const WINDOW_DAYS = 90;
/** Visits a piece needs before its lead rate is worth comparing. */
export const MIN_VISITS_TO_RANK = 20;
/** Pieces needed before "this kind of content does better" means anything. */
export const MIN_PIECES_TO_COMPARE = 3;

export type PieceResult = {
  pieceId: string;
  contentType: string | null;
  topic: string | null;
  createdAt: string | null;
  visits: number;
  clicks: number;
  formSubmits: number;
  leads: number;
  /** leads ÷ visits as a percentage, or null when there's too little to judge. */
  leadRate: number | null;
  ranked: boolean;
};

export type ContentResults = {
  window: { days: number; from: string; to: string };
  pieces: PieceResult[];
  totals: { visits: number; leads: number; piecesWithAnyVisit: number };
  /** Said plainly when nothing here can be compared yet. */
  thin: string | null;
};

const EVENT = { view: "view", click: "click", form: "form_submit" } as const;

function windowFrom(days: number, now: Date): { from: string; to: string } {
  const to = now.toISOString();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

/**
 * Every piece that has been seen at all in the window, with what it led
 * to. Reads only this business's rows, and only pieces belonging to it.
 */
export async function contentResults(
  service: any,
  dealershipId: string,
  opts: { days?: number; now?: Date } = {}
): Promise<ContentResults> {
  const days = opts.days ?? WINDOW_DAYS;
  const { from, to } = windowFrom(days, opts.now ?? new Date());

  const [{ data: events }, { data: touchpoints }, { data: pieces }] = await Promise.all([
    service
      .from("page_events")
      .select("event_type, content_piece_id")
      .eq("dealership_id", dealershipId)
      .not("content_piece_id", "is", null)
      .gte("created_at", from),
    service
      .from("lead_touchpoints")
      .select("lead_id, content_piece_id")
      .eq("dealership_id", dealershipId)
      .not("content_piece_id", "is", null)
      .gte("occurred_at", from),
    service
      .from("content_pieces")
      .select("id, content_type, topic, created_at")
      .eq("dealership_id", dealershipId),
  ]);

  const known = new Map<string, { content_type: string | null; topic: string | null; created_at: string | null }>();
  for (const p of pieces ?? []) known.set(p.id, { content_type: p.content_type ?? null, topic: p.topic ?? null, created_at: p.created_at ?? null });

  const rows = new Map<string, PieceResult>();
  const row = (id: string): PieceResult => {
    let r = rows.get(id);
    if (!r) {
      const meta = known.get(id);
      r = {
        pieceId: id,
        contentType: meta?.content_type ?? null,
        topic: meta?.topic ?? null,
        createdAt: meta?.created_at ?? null,
        visits: 0, clicks: 0, formSubmits: 0, leads: 0, leadRate: null, ranked: false,
      };
      rows.set(id, r);
    }
    return r;
  };

  for (const e of events ?? []) {
    // A piece that no longer belongs to this business (or was deleted)
    // is not counted — the id alone is never taken as proof of ownership.
    if (!known.has(e.content_piece_id)) continue;
    const r = row(e.content_piece_id);
    if (e.event_type === EVENT.view) r.visits += 1;
    else if (e.event_type === EVENT.click) r.clicks += 1;
    else if (e.event_type === EVENT.form) r.formSubmits += 1;
  }

  // One lead counts once for a piece however many times it was touched.
  const seen = new Set<string>();
  for (const t of touchpoints ?? []) {
    if (!known.has(t.content_piece_id)) continue;
    const key = `${t.content_piece_id}:${t.lead_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    row(t.content_piece_id).leads += 1;
  }

  for (const r of rows.values()) {
    r.ranked = r.visits >= MIN_VISITS_TO_RANK;
    r.leadRate = r.ranked ? Math.round((r.leads / r.visits) * 1000) / 10 : null;
  }

  const list = Array.from(rows.values()).sort((a, b) => b.leads - a.leads || b.visits - a.visits);
  const totals = {
    visits: list.reduce((n, r) => n + r.visits, 0),
    leads: list.reduce((n, r) => n + r.leads, 0),
    piecesWithAnyVisit: list.filter((r) => r.visits > 0).length,
  };

  const rankedCount = list.filter((r) => r.ranked).length;
  const thin =
    list.length === 0
      ? "No piece of content has been visited through a Hawlai link yet, so there's nothing to compare."
      : rankedCount === 0
      ? `No piece has ${MIN_VISITS_TO_RANK} visits yet, so none of these can be called better or worse than another — the counts below are real, the comparison isn't there yet.`
      : rankedCount < MIN_PIECES_TO_COMPARE
      ? `Only ${rankedCount} piece${rankedCount === 1 ? " has" : "s have"} enough visits to judge — too few to say what kind of content works for this business.`
      : null;

  return { window: { days, from, to }, pieces: list, totals, thin };
}
