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
type Run = { id: string; created_at: string; competitors: Competitor[]; analysis: { positioning: Positioning; advice: Advice | null; adviceError: string | null } };
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
  const [phase, setPhase] = useState<null | "collect" | "analyse">(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [adName, setAdName] = useState("");
  const [adText, setAdText] = useState("");
  const [adError, setAdError] = useState<string | null>(null);
  const [savingAd, setSavingAd] = useState(false);

  async function load() {
    const d = await fetch("/api/strategy/positioning").then((r) => r.json()).catch(() => null);
    if (d?.error) setError(d.error);
    setRun(d?.run ?? null);
    setOwnerAds(d?.ownerAds ?? []);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  /** A step's JSON, or its reason — a timeout comes back as a page, not JSON. */
  async function step(body: any): Promise<any | null> {
    const res = await fetch("/api/strategy/positioning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    if (!d) {
      setError(`That took too long (${res.status}) — try again.`);
      return null;
    }
    if (!res.ok) {
      setError(d.error ?? "Something went wrong writing this — try again. If it keeps happening, let us know.");
      return null;
    }
    return d;
  }

  async function compare() {
    setError(null);
    setNotes([]);
    setDismissed([]);
    try {
      setPhase("collect");
      const collected = await step({ step: "collect" });
      if (!collected) return;
      const found: string[] = [];
      if (collected.nothingFound?.length) found.push(`Nothing quotable found for: ${collected.nothingFound.join(", ")}.`);
      if (collected.couldntCheck?.length) found.push(`Couldn't check right now: ${collected.couldntCheck.join(", ")} — run it again later.`);
      setNotes(found);
      setPhase("analyse");
      const analysed = await step({ step: "analyse", id: collected.id });
      if (!analysed) return;
      await load();
    } catch {
      setError("Couldn't reach Hawlai — check your connection and try again.");
    } finally {
      setPhase(null);
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
  const busy = phase !== null;
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
        <Button size="sm" onClick={compare} disabled={busy} loading={busy}>
          {!busy && <Sparkles className="w-3.5 h-3.5" />} {run ? "Run again" : "Compare with competitors"}
        </Button>
      </div>

      {busy && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {phase === "collect" ? "Reading competitors' pages — this takes up to a minute..." : "Comparing what they say with what you can say..."}
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      {notes.map((n, i) => <p key={i} className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> {n}</p>)}

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
