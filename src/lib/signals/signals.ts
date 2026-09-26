// Reading and writing what the departments have noticed
// (migration 198).
//
// A signal is a dated observation with its evidence attached, written by
// whichever engine saw it and readable by all the others. It is not a
// memory (business_memory), not a todo (opportunities) and not a news
// feed (*_alerts) — see the migration for why those three already exist
// and why this is none of them.
//
// The rule that makes it safe to consume: `confidence` travels with
// every signal, and nothing may present an inferred signal as a counted
// one. A reader that wants to state a number takes it from `evidence`,
// never from the sentence.

export type SignalSource =
  | "competitor_monitor"
  | "topic_monitor"
  | "positioning"
  | "seo"
  | "aeo"
  | "content_results"
  | "diagnosis"
  | "season";

/** counted = our own rows. observed = someone else's public claim, quoted. inferred = a model's reading. */
export type Confidence = "counted" | "observed" | "inferred";

export type Signal = {
  id?: string;
  source: SignalSource;
  topic: string;
  summary: string;
  evidence: Record<string, unknown>;
  confidence: Confidence;
  sourceUrl?: string | null;
  observedAt?: string;
  expiresAt?: string | null;
};

/** How long a signal stays current, by where it came from. */
export const FRESH_DAYS: Record<SignalSource, number> = {
  // News moves; a launch from six weeks ago is history, not a signal.
  competitor_monitor: 30,
  topic_monitor: 30,
  // A competitor's public positioning changes slowly.
  positioning: 60,
  seo: 60,
  aeo: 60,
  // Our own numbers are recomputed whenever they're asked for.
  content_results: 14,
  diagnosis: 14,
  season: 21,
};

const MAX_SUMMARY = 300;

/** The same observation seen twice is one signal, not two. */
export function fingerprintOf(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => String(p ?? "").toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("|")
    .slice(0, 500);
}

function expiryFor(source: SignalSource, observedAt: Date): string {
  return new Date(observedAt.getTime() + FRESH_DAYS[source] * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Writes a signal, or touches the one already there.
 *
 * Returns false rather than throwing: an engine's real work — posting,
 * sending, answering — must never fail because a note about it couldn't
 * be filed.
 */
export async function recordSignal(
  service: any,
  dealershipId: string,
  signal: Signal & { fingerprint?: string },
  now: Date = new Date()
): Promise<boolean> {
  if (!dealershipId || !signal?.summary?.trim()) return false;
  const fingerprint = signal.fingerprint ?? fingerprintOf([signal.source, signal.topic, signal.summary]);
  const observedAt = signal.observedAt ?? now.toISOString();

  try {
    const { data: existing } = await service
      .from("business_signals")
      .select("id")
      .eq("dealership_id", dealershipId)
      .eq("source", signal.source)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existing?.id) {
      // Still true today: the row is touched and its clock restarts, so a
      // standing fact doesn't quietly expire while it's still the case.
      await service
        .from("business_signals")
        .update({ last_seen_at: now.toISOString(), expires_at: signal.expiresAt ?? expiryFor(signal.source, now) })
        .eq("id", existing.id)
        .eq("dealership_id", dealershipId);
      return true;
    }

    const { error } = await service.from("business_signals").insert({
      dealership_id: dealershipId,
      source: signal.source,
      topic: String(signal.topic ?? "").slice(0, 120) || "general",
      summary: signal.summary.trim().slice(0, MAX_SUMMARY),
      evidence: signal.evidence ?? {},
      confidence: signal.confidence,
      source_url: signal.sourceUrl ?? null,
      observed_at: observedAt,
      last_seen_at: now.toISOString(),
      expires_at: signal.expiresAt ?? expiryFor(signal.source, new Date(observedAt)),
      fingerprint,
    });
    return !error;
  } catch (err: any) {
    console.error("[signals] recordSignal failed:", err?.message);
    return false;
  }
}

export type StoredSignal = Signal & { id: string; lastSeenAt: string; observedAt: string };

/**
 * The signals still current for this business, newest first.
 *
 * Expired ones are left out rather than presented as today's news — the
 * whole point of the expiry column.
 */
export async function readSignals(
  service: any,
  dealershipId: string,
  opts: { sources?: SignalSource[]; minConfidence?: Confidence; limit?: number; now?: Date } = {}
): Promise<StoredSignal[]> {
  if (!dealershipId) return [];
  const now = opts.now ?? new Date();
  try {
    let q = service
      .from("business_signals")
      .select("id, source, topic, summary, evidence, confidence, source_url, observed_at, last_seen_at, expires_at")
      .eq("dealership_id", dealershipId)
      .order("observed_at", { ascending: false })
      .limit(opts.limit ?? 40);
    if (opts.sources?.length) q = q.in("source", opts.sources);

    const { data } = await q;
    const rank: Record<Confidence, number> = { inferred: 0, observed: 1, counted: 2 };
    const floor = opts.minConfidence ? rank[opts.minConfidence] : -1;

    return (data ?? [])
      .filter((r: any) => !r.expires_at || new Date(r.expires_at).getTime() > now.getTime())
      .filter((r: any) => rank[r.confidence as Confidence] >= floor)
      .map((r: any) => ({
        id: r.id,
        source: r.source,
        topic: r.topic,
        summary: r.summary,
        evidence: r.evidence ?? {},
        confidence: r.confidence,
        sourceUrl: r.source_url ?? null,
        observedAt: r.observed_at,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at ?? null,
      }));
  } catch (err: any) {
    console.error("[signals] readSignals failed:", err?.message);
    return [];
  }
}

const CONFIDENCE_WORDS: Record<Confidence, string> = {
  counted: "counted from this business's own records",
  observed: "quoted from a public page or search result",
  inferred: "a reading of the above, not a measured fact",
};

/**
 * Signals as prompt text, with each one's standing stated.
 *
 * Handed to a model the same way the diagnosis is: it may interpret
 * these, and it may not upgrade one. An inferred signal stays inferred
 * however useful it would be if it were counted.
 */
export function formatSignalsForPrompt(signals: StoredSignal[]): string {
  if (signals.length === 0) return "";
  const lines = signals.map((s) => {
    const evidence = Object.entries(s.evidence ?? {})
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(", ");
    return `- [${s.source}, ${CONFIDENCE_WORDS[s.confidence]}] ${s.summary}${evidence ? ` (${evidence})` : ""}${s.sourceUrl ? ` — ${s.sourceUrl}` : ""}`;
  });
  return [
    "## What the other departments have noticed",
    "Each line says where it came from and how solid it is. You may reason from these and say what they suggest — you may NOT restate an inferred line as a measured fact, and any number you quote must be one printed here.",
    ...lines,
  ].join("\n");
}
