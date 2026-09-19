"use client";

// Where this business stands against what competitors say in public
// (lib/strategy/positioning): their own words with links, counted theme by
// theme in code, and the ground the business can own with its own facts.

import { useEffect, useState } from "react";
import { Loader2, Swords, ExternalLink, X, Plus, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

type Row = {
  key: string;
  label: string;
  claimedBy: string[];
  examples: { competitor: string; quote: string; url: string | null }[];
  yourFacts: string[];
  standing: "crowded" | "contested" | "open";
};
type Positioning = { competitorCount: number; rows: Row[]; whiteSpace: string[]; crowdedYouHave: string[]; openUnbacked: string[] };
type Advice = { statement: string | null; angles: { theme: string; title: string; why: string }[]; removed: string[] };
type Competitor = { name: string; source: "watched" | "owner_ad" | "found"; url?: string | null; claimCount: number };
type Run = { id: string; created_at: string; competitors: Competitor[]; analysis: { positioning: Positioning; advice: Advice | null; adviceError: string | null; notes?: { couldntCheck?: string[]; skippedAtCeiling?: string[] }; spentInr?: number } };
/** What pressing the button would cost now, from GET — or why it can't be pressed. */
type Estimate = { estimateInr?: number; needsConfirm?: boolean; blocked?: string | null; searchCalls?: number; paused?: boolean; reusing?: { competitors: number; withQuotes: number } };
/** The run in progress, from GET — what it's doing now, or why it stopped. */
type Current = { id: string; state: "running" | "failed" | "analysed"; label: string | null; error: string | null };

/** How often the page asks how a running comparison is getting on. */
export const POLL_MS = 3000;
type OwnerAd = { id: string; competitor_name: string; ad_text: string };

const SOURCE_LABEL: Record<Competitor["source"], string> = { watched: "you watch", owner_ad: "your pasted ad", found: "found by Hawlai" };
const STANDING: Record<Row["standing"], { label: string; cls: string }> = {
  crowded: { label: "Crowded", cls: "bg-red-500/10 text-red-500" },
  contested: { label: "Contested", cls: "bg-amber-500/10 text-amber-600" },
  open: { label: "Open", cls: "bg-emerald-500/10 text-emerald-600" },
};

export default function PositioningPanel() {
  const [run, setRun] = useState<Run | null>(null);
  const [ownerAds, setOwnerAds] = useState<OwnerAd[]>([]);
  const [loading, setLoading] = useState(true);
  // What the running comparison is doing now; null when nothing is running.
  const [progress, setProgress] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  // Asking the owner's yes before a comparison that costs more than the confirm line.
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [adName, setAdName] = useState("");
  const [adText, setAdText] = useState("");
  const [adError, setAdError] = useState<string | null>(null);
  const [savingAd, setSavingAd] = useState(false);

  async function load() {
    const d = await fetch("/api/strategy/positioning").then((r) => r.json()).catch(() => null);
    if (!d) return;
    if (d.error) setError(d.error);
    setRun(d.run ?? null);
    setOwnerAds(d.ownerAds ?? []);
    setEstimate(d.estimate ?? null);
    const current: Current | null = d.current ?? null;
    if (current?.state === "running") {
      setProgress(current.label ?? "Working...");
    } else {
      setProgress(null);
      if (current?.state === "failed") setError(current.error);
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  // While a comparison runs (in the background, one step at a time), ask
  // how it's getting on. Coming back to the page picks up where it is.
  useEffect(() => {
    if (progress === null) return;
    const t = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(t);
  }, [progress]);

  async function compare(confirm = false) {
    setError(null);
    setDismissed([]);
    // Anything over the confirm line asks first, here — before any request.
    if (!confirm && estimate?.needsConfirm) return setConfirming(true);
    setConfirming(false);
    try {
      const res = await fetch("/api/strategy/positioning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
      const d = await res.json().catch(() => null);
      if (res.status === 409 && d?.needsConfirm) {
        if (d.estimate) setEstimate(d.estimate);
        return setConfirming(true);
      }
      if (!res.ok || !d) return setError(d?.error ?? `Couldn't start the comparison (${res.status}) — try again.`);
      setProgress("Starting...");
    } catch {
      setError("Couldn't reach Hawlai — check your connection and try again.");
    }
  }

  async function dismiss(name: string) {
    const res = await fetch("/api/strategy/positioning/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitorName: name }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d.error ?? "Couldn't remove it — try again.");
    setDismissed((list) => [...list, name]);
  }

  async function addAd() {
    setAdError(null);
    setSavingAd(true);
    try {
      const res = await fetch("/api/strategy/positioning/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitorName: adName, adText }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setAdError(d.error ?? "Couldn't save that ad — try again.");
      setOwnerAds((list) => [d.ad, ...list]);
      setAdName("");
      setAdText("");
    } finally {
      setSavingAd(false);
    }
  }

  async function removeAd(id: string) {
    const res = await fetch(`/api/strategy/positioning/ads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setOwnerAds((list) => list.filter((a) => a.id !== id));
  }

  if (loading) {
    return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading your positioning...</div>;
  }

  const p = run?.analysis?.positioning ?? null;
  const advice = run?.analysis?.advice ?? null;
  const busy = progress !== null;
  // Said about the finished run, from the run itself.
  const couldntCheck = run?.analysis?.notes?.couldntCheck ?? [];
  const skippedAtCeiling = run?.analysis?.notes?.skippedAtCeiling ?? [];
  const spentInr = run?.analysis?.spentInr;
  const cantRun = Boolean(estimate?.blocked);
  const costLabel = estimate && !estimate.blocked && typeof estimate.estimateInr === "number" ? ` · about ₹${estimate.estimateInr}` : "";
  const nothingFound = (run?.competitors ?? []).filter((c) => c.claimCount === 0).map((c) => c.name);
  const labelOf = (key: string) => p?.rows.find((r) => r.key === key)?.label ?? key;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Swords className="w-4 h-4" /> Positioning vs competitors</p>
          <p className="text-xs text-slate-400">
            From competitors' own public pages and ads you've pasted — their words, with links, counted by Hawlai.
            {run ? ` Last run ${new Date(run.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => compare(false)} disabled={busy || cantRun || confirming} loading={busy}>
          {!busy && <Sparkles className="w-3.5 h-3.5" />} {run ? "Run again" : "Compare with competitors"}{costLabel}
        </Button>
      </div>

      {/* Why the button can't be pressed now: paused, or today's run already done. */}
      {!busy && estimate?.blocked && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> {estimate.blocked}</p>}
      {!busy && estimate && !estimate.blocked && (estimate.reusing?.withQuotes ?? 0) > 0 && (
        <p className="text-[11px] text-slate-400">Reuses quotes from the last 14 days for {estimate.reusing!.withQuotes} competitor{estimate.reusing!.withQuotes === 1 ? "" : "s"} — only the rest are searched again.</p>
      )}
      {confirming && (
        <div className="bg-amber-500/10 rounded-lg p-3 space-y-2">
          <p className="text-sm text-slate-700">
            This comparison will cost about <span className="font-semibold">₹{estimate?.estimateInr}</span> of AI credits ({estimate?.searchCalls} web search{estimate?.searchCalls === 1 ? "" : "es"}). It stops searching at ₹40 whatever happens.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => compare(true)}>Start</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {busy && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {progress} <span className="text-slate-400">It runs in the background — you can leave this page and come back.</span>
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      {!busy && nothingFound.length > 0 && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> Nothing quotable found for: {nothingFound.join(", ")}.</p>}
      {!busy && couldntCheck.length > 0 && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> Couldn't check right now: {couldntCheck.join(", ")} — run it again later.</p>}
      {!busy && skippedAtCeiling.length > 0 && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> Stopped searching at the ₹40 limit — not read this time: {skippedAtCeiling.join(", ")}.</p>}
      {!busy && typeof spentInr === "number" && <p className="text-[11px] text-slate-400">This comparison cost ₹{spentInr.toFixed(2)} of AI credits.</p>}

      {!run && !busy && !error && (
        <p className="text-xs text-slate-500">Hawlai reads what up to 5 competitors say about themselves — the ones you watch first — and shows where the ground is crowded, and where you can say something true that they don't.</p>
      )}

      {advice && (advice.statement || advice.angles.length > 0) && (
        <div className="space-y-2">
          {advice.statement && <p className="text-sm font-semibold text-slate-800">{advice.statement}</p>}
          {advice.angles.map((a, i) => (
            <div key={i} className="bg-brand-500/10 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800">{a.title}</p>
              <p className="text-sm text-slate-700">{a.why}</p>
              <p className="text-[11px] text-slate-500 mt-1">Ground: {labelOf(a.theme)}</p>
            </div>
          ))}
          {advice.removed.length > 0 && (
            <p className="text-[11px] text-amber-600">
              Hawlai left out {advice.removed.length === 1 ? "one suggestion" : `${advice.removed.length} suggestions`} that claimed something you haven't said, or quoted a number it didn't count.
            </p>
          )}
        </div>
      )}
      {run?.analysis?.adviceError && <p className="text-xs text-red-500">{run.analysis.adviceError} The comparison below is still accurate.</p>}

      {p && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">What {p.competitorCount} competitor{p.competitorCount === 1 ? "" : "s"} say, theme by theme</p>
          <div className="space-y-1.5">
            {p.rows.map((r) => (
              <div key={r.key} className="bg-slate-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-slate-700">{r.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 tabular-nums">{r.claimedBy.length} of {p.competitorCount}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STANDING[r.standing].cls}`}>{STANDING[r.standing].label}</span>
                  </span>
                </div>
                {r.examples.map((e, i) => (
                  <p key={i} className="text-[11px] text-slate-600">
                    {e.competitor}: “{e.quote}”{" "}
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-0.5">source <ExternalLink className="w-3 h-3" /></a>
                    ) : (
                      <span className="text-slate-400">(ad you saw)</span>
                    )}
                  </p>
                ))}
                <p className="text-[11px] text-slate-500">
                  {r.yourFacts.length ? `You have: ${r.yourFacts.join("; ")}` : r.standing === "open" ? "Open — but you have nothing on record to say here yet." : "You have nothing on record for this."}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {run && run.competitors.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">Compared with</p>
          <div className="flex flex-wrap gap-1.5">
            {run.competitors.map((c) => (
              <span key={c.name} className={`text-xs rounded-lg px-2 py-1 bg-slate-200 text-slate-700 flex items-center gap-1.5 ${dismissed.includes(c.name) ? "line-through opacity-50" : ""}`}>
                {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.name}</a> : c.name}
                <span className="text-[10px] text-slate-400">{SOURCE_LABEL[c.source]} · {c.claimCount} quote{c.claimCount === 1 ? "" : "s"}</span>
                {c.source === "found" && !dismissed.includes(c.name) && (
                  <button onClick={() => dismiss(c.name)} title="Not a competitor — don't use again" aria-label={`Remove ${c.name}`} className="text-slate-400 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {dismissed.length > 0 && <p className="text-[11px] text-slate-500">Removed — it won't be used again. Run it again to replace it.</p>}
        </div>
      )}

      <div className="border-t border-slate-200 pt-3 space-y-2">
        <p className="text-xs font-semibold text-slate-500">Seen a competitor's ad? Paste it here</p>
        <p className="text-[11px] text-slate-400">
          The{" "}
          <a href="https://www.facebook.com/ads/library/?country=IN" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300">Meta Ad Library</a>{" "}
          shows every ad a Page is running. Paste the words of one — it's quoted as you pasted it, marked "ad you saw", and used in every comparison.
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input value={adName} onChange={(e) => setAdName(e.target.value)} placeholder="Competitor's name" className="bg-slate-100 text-slate-900 border border-slate-200 rounded-lg p-2 text-sm" />
          <textarea value={adText} onChange={(e) => setAdText(e.target.value)} placeholder="The ad's words" rows={2} className="sm:col-span-2 bg-slate-100 text-slate-900 border border-slate-200 rounded-lg p-2 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={addAd} loading={savingAd} disabled={savingAd}>
            {!savingAd && <Plus className="w-3.5 h-3.5" />} Add ad
          </Button>
          {adError && <p role="alert" className="text-xs text-red-500">{adError}</p>}
        </div>
        {ownerAds.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 text-[11px] text-slate-600">
            <span><span className="font-semibold">{a.competitor_name}:</span> “{a.ad_text}”</span>
            <button onClick={() => removeAd(a.id)} aria-label="Remove this ad" className="text-slate-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
