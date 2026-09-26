"use client";

// Where the business actually leaks — its own last 90 days, counted in code
// (lib/strategy/diagnosis.ts) — and channel advice tied to those numbers.

import { useEffect, useState } from "react";
import { Loader2, Activity, AlertTriangle, Users2, Megaphone, Lightbulb, Info, Compass } from "lucide-react";
import { Button } from "@/components/ui";

type Step = { key: string; label: string; count: number; fromPrevious: number | null };
type Funnel = { name: string; steps: Step[]; weakest: { from: string; to: string; rate: number; entered: number } | null; thin: string | null };
type Diagnosis = {
  window: { label: string };
  funnels: Funnel[];
  sources: { source: string; leads: number; won: number; conversion: number | null; ranked: boolean }[];
  sourcesThin: string | null;
  atRisk: { count: number; total: number; names: string[] };
  paid: { campaign: string; spend: number; leads: number; costPerLead: number | null }[] | null;
  gaps: string[];
};
type Channel = {
  channel: string;
  label: string;
  standing: "proven" | "fits" | "test";
  reasons: string[];
  needs: string[];
  measure: string | null;
};
type Advice = { summary: string; recommendations: { title: string; action: string; evidence: string }[]; dataGaps: string[]; removed: string[] };

export default function DiagnosisPanel() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [advising, setAdvising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategy/diagnosis")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setDiagnosis(d.diagnosis);
        setChannels(d.channels ?? []);
      })
      .catch(() => setError("Couldn't load your numbers right now."))
      .finally(() => setLoading(false));
  }, []);

  async function getAdvice() {
    setAdvising(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/diagnosis?advice=1");
      // A timeout comes back as a page, not JSON — say so rather than fail silently.
      const d = await res.json().catch(() => null);
      if (!d) {
        setError(`The advice took too long (${res.status}) — try again. The numbers above are still accurate.`);
        return;
      }
      if (d.diagnosis) setDiagnosis(d.diagnosis);
      if (d.channels) setChannels(d.channels);
      if (d.advice) setAdvice(d.advice);
      else setError(d.error ?? "Couldn't write the advice right now.");
    } catch {
      setError("Couldn't reach Hawlai — check your connection and try again.");
    } finally {
      setAdvising(false);
    }
  }

  if (loading) {
    return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Reading your last 90 days...</div>;
  }
  if (!diagnosis) return error ? <div className="card p-5 text-sm text-red-500">{error}</div> : null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Activity className="w-4 h-4" /> Diagnosis — where you're losing people</p>
          <p className="text-xs text-slate-400">From your own data, {diagnosis.window.label}. Counted by Hawlai, not estimated.</p>
        </div>
        <Button size="sm" onClick={getAdvice} disabled={advising} loading={advising}>
          {!advising && <Lightbulb className="w-3.5 h-3.5" />} {advice ? "Refresh advice" : "What should I do about it?"}
        </Button>
      </div>

      {diagnosis.funnels.map((f) => (
        <div key={f.name} className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">{f.name}</p>
          <div className="overflow-x-auto">
            <div className="flex items-stretch gap-1.5 min-w-max">
              {f.steps.map((s, i) => {
                const weak = f.weakest && f.weakest.to === s.label && i > 0 && f.steps[i - 1].label === f.weakest.from;
                return (
                  <div key={s.key} className={`rounded-lg px-3 py-2 min-w-[7rem] ${weak ? "bg-red-500/10 ring-1 ring-red-400/50" : "bg-slate-200"}`}>
                    <p className="text-[11px] text-slate-500">{s.label}</p>
                    <p className="text-lg font-semibold text-slate-800 tabular-nums">{s.count}</p>
                    {s.fromPrevious !== null && <p className={`text-[11px] tabular-nums ${weak ? "text-red-500 font-semibold" : "text-slate-400"}`}>{s.fromPrevious}% of previous</p>}
                  </div>
                );
              })}
            </div>
          </div>
          {f.weakest ? (
            <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Weakest step: {f.weakest.from} → {f.weakest.to} — {f.weakest.rate}% of {f.weakest.entered} get through.</p>
          ) : (
            <p className="text-xs text-slate-400 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> {f.thin}</p>
          )}
        </div>
      ))}

      {channels.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" /> Which channels suit you — decided from your own facts, not your category
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {channels.map((c) => (
              <div key={c.channel} className="bg-slate-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">{c.label}</span>
                  {/* Three plainly different things, said as three plainly
                      different words — "recommended" for an untested channel
                      would claim evidence that isn't there. */}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                      c.standing === "proven"
                        ? "bg-green-500/15 text-green-600"
                        : c.standing === "fits"
                        ? "bg-sky-500/15 text-sky-600"
                        : "bg-slate-300 text-slate-500"
                    }`}
                  >
                    {c.standing === "proven" ? "Already works here" : c.standing === "fits" ? "Fits your facts" : "Untested"}
                  </span>
                </div>
                {c.reasons.slice(0, 2).map((r) => (
                  <p key={r} className="text-[11px] text-slate-500">{r}</p>
                ))}
                {c.needs.map((n) => (
                  <p key={n} className="text-[11px] text-amber-600">Needs: {n}</p>
                ))}
                {c.measure && <p className="text-[11px] text-slate-400">To find out: {c.measure}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-slate-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" /> Lead sources — ranked by conversion, not volume</p>
          {diagnosis.sources.length === 0 && <p className="text-xs text-slate-400">No leads in this window.</p>}
          {diagnosis.sources.map((s) => (
            <div key={s.source} className="flex items-center justify-between text-xs">
              <span className="text-slate-700">{s.source}</span>
              <span className="text-slate-500 tabular-nums">
                {s.leads} leads · {s.won} won{s.ranked ? ` · ${s.conversion}%` : " · too few to judge"}
              </span>
            </div>
          ))}
          {diagnosis.sourcesThin && <p className="text-[11px] text-slate-400">{diagnosis.sourcesThin}</p>}
        </div>
        <div className="bg-slate-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Users2 className="w-3.5 h-3.5" /> Customers at risk</p>
          <p className="text-sm text-slate-700 tabular-nums">
            {diagnosis.atRisk.count} of {diagnosis.atRisk.total} customers haven't heard from you in 90+ days
          </p>
          {diagnosis.atRisk.names.length > 0 && <p className="text-[11px] text-slate-500">{diagnosis.atRisk.names.join(", ")}{diagnosis.atRisk.count > diagnosis.atRisk.names.length ? "…" : ""}</p>}
          {diagnosis.paid && (
            <div className="pt-1.5 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Paid ads in this window</p>
              {diagnosis.paid.map((p) => (
                <p key={p.campaign} className="text-[11px] text-slate-600 tabular-nums">
                  {p.campaign}: ₹{p.spend.toLocaleString("en-IN")} · {p.leads} leads{p.costPerLead !== null ? ` · ₹${p.costPerLead.toLocaleString("en-IN")}/lead` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {advice && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          {advice.summary && <p className="text-sm text-slate-700">{advice.summary}</p>}
          {advice.recommendations.map((r, i) => (
            <div key={i} className="bg-brand-500/10 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800">{r.title}</p>
              <p className="text-sm text-slate-700">{r.action}</p>
              <p className="text-[11px] text-slate-500 mt-1">Based on: {r.evidence}</p>
            </div>
          ))}
          {advice.dataGaps.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500">Not enough data to judge yet</p>
              {advice.dataGaps.map((g, i) => <p key={i} className="text-xs text-slate-500">• {g}</p>)}
            </div>
          )}
          {advice.removed.length > 0 && (
            <p className="text-[11px] text-amber-600">
              Hawlai left out {advice.removed.length === 1 ? "one suggestion" : `${advice.removed.length} suggestions`} that quoted a number not in your data.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
