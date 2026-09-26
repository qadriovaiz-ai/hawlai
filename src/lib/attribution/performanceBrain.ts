// What kind of content actually works here (Brain, Phase 5a).
//
// THE CLAIM THIS FILE EXISTS TO NOT MAKE: "case-study posts bring 2.4×
// more qualified leads than reels." That sentence is the emotional centre
// of the whole vision, and on this business's data — 28 visits, 5 leads —
// it would be noise wearing a decimal point. Two leads against one is not
// a ratio; it is two leads against one.
//
// So the machinery is built properly and stays QUIET until the numbers can
// carry a comparison. Floors, not opinions:
//   - a format needs several published pieces before it stands for
//     anything, because one lucky post is not a format;
//   - the business needs a real number of attributed leads in total
//     before any two formats can be ranked against each other;
//   - and the gap between them has to be wide enough that one extra lead
//     wouldn't reverse it.
// Where those aren't met it says what is missing and how far off it is,
// which is genuinely useful — and is the opposite of a black box.
//
// Everything is counted from the attribution built in Phase 0: a piece is
// only credited with a lead the visitor trail actually links to it.

import { recordSignal, fingerprintOf } from "@/lib/signals/signals";

/** Pieces of one format before that format stands for anything. */
export const MIN_PIECES_PER_FORMAT = 3;
/** Attributed leads across everything before formats can be ranked. */
export const MIN_LEADS_TO_COMPARE = 10;
/** A gap this wide can't be reversed by one more lead landing either way. */
export const MIN_GAP_FACTOR = 1.5;
export const WINDOW_DAYS = 90;

export type FormatRow = {
  format: string;
  pieces: number;
  visits: number;
  leads: number;
  /** Leads per published piece — the only rate small numbers can support. */
  leadsPerPiece: number;
  /** Whether this format has enough pieces behind it to stand for anything. */
  standsForSomething: boolean;
};

export type Pattern = { better: string; worse: string; statement: string; evidence: Record<string, unknown> };

export type PerformanceRead = {
  window: { days: number; from: string };
  formats: FormatRow[];
  totals: { pieces: number; visits: number; leads: number };
  patterns: Pattern[];
  /** What is missing before a pattern could be stated, in plain words. */
  thin: string | null;
};

type PieceRow = { id: string; kind: string | null; source_table: string; source_id: string };

/**
 * Performance grouped by the kind of thing it was — an Instagram post, a
 * blog, an email — from the business's own attributed rows.
 */
export async function performanceByFormat(
  service: any,
  dealershipId: string,
  opts: { days?: number; now?: Date } = {}
): Promise<PerformanceRead> {
  const days = opts.days ?? WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();

  const [{ data: pieces }, { data: events }, { data: touchpoints }] = await Promise.all([
    service.from("marketing_pieces").select("id, kind, source_table, source_id").eq("dealership_id", dealershipId),
    service
      .from("page_events")
      .select("event_type, marketing_piece_id")
      .eq("dealership_id", dealershipId)
      .not("marketing_piece_id", "is", null)
      .gte("created_at", from),
    service
      .from("lead_touchpoints")
      .select("lead_id, marketing_piece_id")
      .eq("dealership_id", dealershipId)
      .not("marketing_piece_id", "is", null)
      .gte("occurred_at", from),
  ]);

  const rows: PieceRow[] = pieces ?? [];
  // An email is an email; a content piece's real format is its own
  // content_type, so those are looked up rather than all lumped together
  // as "content".
  const contentIds = rows.filter((p) => p.source_table === "content_pieces").map((p) => p.source_id);
  const formatOf = new Map<string, string>();
  if (contentIds.length > 0) {
    const { data: contentRows } = await service
      .from("content_pieces")
      .select("id, content_type")
      .eq("dealership_id", dealershipId)
      .in("id", contentIds);
    for (const c of contentRows ?? []) formatOf.set(c.id, String(c.content_type ?? "content"));
  }

  const format = (p: PieceRow): string =>
    p.source_table === "content_pieces" ? formatOf.get(p.source_id) ?? "content" : String(p.kind ?? "other");

  const byId = new Map<string, PieceRow>(rows.map((p) => [p.id, p]));
  const acc = new Map<string, FormatRow>();
  const row = (name: string): FormatRow => {
    let r = acc.get(name);
    if (!r) {
      r = { format: name, pieces: 0, visits: 0, leads: 0, leadsPerPiece: 0, standsForSomething: false };
      acc.set(name, r);
    }
    return r;
  };
  for (const p of rows) row(format(p)).pieces += 1;

  for (const e of events ?? []) {
    const p = byId.get(e.marketing_piece_id);
    if (!p) continue;
    if (e.event_type === "view") row(format(p)).visits += 1;
  }

  // One lead counts once per format, however many of its pieces it touched.
  const seen = new Set<string>();
  for (const t of touchpoints ?? []) {
    const p = byId.get(t.marketing_piece_id);
    if (!p) continue;
    const key = `${format(p)}:${t.lead_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    row(format(p)).leads += 1;
  }

  const formats = Array.from(acc.values());
  for (const f of formats) {
    f.leadsPerPiece = f.pieces > 0 ? Math.round((f.leads / f.pieces) * 100) / 100 : 0;
    f.standsForSomething = f.pieces >= MIN_PIECES_PER_FORMAT;
  }
  formats.sort((a, b) => b.leads - a.leads || b.visits - a.visits);

  const totals = {
    pieces: formats.reduce((n, f) => n + f.pieces, 0),
    visits: formats.reduce((n, f) => n + f.visits, 0),
    leads: formats.reduce((n, f) => n + f.leads, 0),
  };

  return { window: { days, from }, formats, totals, patterns: patternsFrom(formats, totals.leads), thin: thinReason(formats, totals.leads) };
}

/**
 * What can honestly be said about one format against another.
 *
 * Returns nothing at all unless both formats have enough pieces behind
 * them, the business has enough attributed leads overall, and the gap is
 * wide enough that one more lead wouldn't flip it.
 */
export function patternsFrom(formats: FormatRow[], totalLeads: number): Pattern[] {
  if (totalLeads < MIN_LEADS_TO_COMPARE) return [];
  const eligible = formats.filter((f) => f.standsForSomething);
  if (eligible.length < 2) return [];

  const out: Pattern[] = [];
  const ranked = [...eligible].sort((a, b) => b.leadsPerPiece - a.leadsPerPiece);
  const best = ranked[0];
  for (const other of ranked.slice(1)) {
    // A zero-lead format can't be divided into, so the gap is judged on
    // the leads themselves in that case.
    const wideEnough = other.leadsPerPiece === 0 ? best.leads >= MIN_LEADS_TO_COMPARE / 2 : best.leadsPerPiece / other.leadsPerPiece >= MIN_GAP_FACTOR;
    if (!wideEnough) continue;
    out.push({
      better: best.format,
      worse: other.format,
      statement: `${best.format} brought ${best.leads} lead${best.leads === 1 ? "" : "s"} from ${best.pieces} pieces; ${other.format} brought ${other.leads} from ${other.pieces}`,
      evidence: {
        better: best.format, betterLeads: best.leads, betterPieces: best.pieces, betterLeadsPerPiece: best.leadsPerPiece,
        worse: other.format, worseLeads: other.leads, worsePieces: other.pieces, worseLeadsPerPiece: other.leadsPerPiece,
      },
    });
  }
  return out;
}

/** Exactly what is missing before any of this could mean something. */
export function thinReason(formats: FormatRow[], totalLeads: number): string | null {
  if (formats.length === 0) return "Nothing published through Hawlai has been visited yet, so there is nothing to compare.";
  if (totalLeads < MIN_LEADS_TO_COMPARE) {
    const short = MIN_LEADS_TO_COMPARE - totalLeads;
    return `${totalLeads} lead${totalLeads === 1 ? "" : "s"} can be traced to a specific piece so far. Comparing what kind of content works needs about ${MIN_LEADS_TO_COMPARE} — ${short} more — because below that one extra lead changes the answer.`;
  }
  const eligible = formats.filter((f) => f.standsForSomething);
  if (eligible.length < 2) {
    return `Only ${eligible.length} kind of content has ${MIN_PIECES_PER_FORMAT} or more pieces published. Two are needed before one can be called better than the other — one lucky post is not a format.`;
  }
  return null;
}

/**
 * Filed for the other departments (migration 198).
 *
 * A pattern is filed as counted, because it is arithmetic on this
 * business's own rows. When there ISN'T one, the shortfall is filed too —
 * "we can't tell yet, and here's what would change that" is a useful
 * thing for Strategy to know, and stops it inventing an answer.
 */
export async function recordPerformanceSignals(service: any, dealershipId: string, read: PerformanceRead): Promise<void> {
  if (read.totals.pieces === 0) return;

  if (read.patterns.length > 0) {
    const p = read.patterns[0];
    await recordSignal(service, dealershipId, {
      source: "content_results",
      topic: "what kind of content works",
      summary: p.statement,
      evidence: { ...p.evidence, attributedLeads: read.totals.leads },
      confidence: "counted",
      fingerprint: fingerprintOf(["content_results", "what kind of content works"]),
    });
    return;
  }

  await recordSignal(service, dealershipId, {
    source: "content_results",
    topic: "what kind of content works",
    summary: read.thin ?? "There isn't enough traced activity to say which kind of content works yet.",
    evidence: { attributedLeads: read.totals.leads, pieces: read.totals.pieces, visits: read.totals.visits, needsLeads: MIN_LEADS_TO_COMPARE },
    confidence: "counted",
    fingerprint: fingerprintOf(["content_results", "what kind of content works"]),
  });
}
