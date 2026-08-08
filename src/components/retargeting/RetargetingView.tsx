"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Download, ShoppingCart, UserX, RotateCcw, Pencil, Save, X, Copy, Check } from "lucide-react";
import { OutputRenderer, EditableOutput } from "@/components/shared/GeneratedOutputEditor";

const SEGMENTS = [
  { key: "abandoned_cart", label: "Abandoned Cart", icon: ShoppingCart, desc: "Added to cart, didn't check out" },
  { key: "cold_lead", label: "Cold Leads", icon: UserX, desc: "Interested once, went quiet" },
  { key: "lapsed_buyer", label: "Lapsed Buyers", icon: RotateCcw, desc: "Bought once, haven't returned" },
] as const;

export default function RetargetingView() {
  const [segments, setSegments] = useState<any>(null);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [selected, setSelected] = useState<typeof SEGMENTS[number]["key"]>("abandoned_cart");
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/retargeting/segments").then((r) => r.json()).then((d) => setSegments(d.segments)).finally(() => setLoadingSegments(false));
  }, []);

  async function generate() {
    setGenerating(true);
    setOutput(null);
    setEditing(false);
    try {
      const res = await fetch("/api/retargeting/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segmentType: selected }) });
      const data = await res.json();
      setOutput(data.output);
      setOutputId(data.id ?? null);
    } finally {
      setGenerating(false);
    }
  }

  function startEditing() {
    setDraft(JSON.parse(JSON.stringify(output)));
    setEditing(true);
  }

  async function saveEdits() {
    if (!outputId) return;
    setSaving(true);
    try {
      await fetch("/api/retargeting/generate", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: outputId, output: draft }) });
      setOutput(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2).replace(/[{}"[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const currentSegment = segments?.[selected];
  const currentCount = currentSegment?.count ?? 0;

  return (
    <div className="space-y-5">
      {/* Segment picker with real counts */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Real audience segments</p>
        {loadingSegments ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your real numbers...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SEGMENTS.map((s) => {
              const Icon = s.icon;
              const count = segments?.[s.key]?.count ?? 0;
              return (
                <button
                  key={s.key}
                  onClick={() => { setSelected(s.key); setOutput(null); }}
                  className={`text-left p-3 rounded-lg border transition-colors ${selected === s.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-purple-400"}`}
                >
                  <Icon className="w-4 h-4 mb-1.5" />
                  <p className="text-sm font-semibold">{count} people</p>
                  <p className={`text-xs ${selected === s.key ? "text-white/70" : "text-slate-400"}`}>{s.label}</p>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400">{SEGMENTS.find((s) => s.key === selected)?.desc} — real data from your leads, carts, and orders.</p>
      </div>

      {/* Generate */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Ad copy for this segment</p>
          <button
            onClick={() => window.open(`/api/retargeting/export?segment=${selected}`, "_blank")}
            disabled={currentCount === 0}
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Download audience CSV
          </button>
        </div>
        <button
          onClick={generate}
          disabled={generating || currentCount === 0}
          className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate ad copy
        </button>
        {currentCount === 0 && !loadingSegments && <p className="text-xs text-slate-400">No one in this segment yet — nothing to generate copy for.</p>}
      </div>

      {/* Output */}
      {output && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Ad copy</p>
            <div className="flex items-center gap-3">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
                  <button onClick={saveEdits} disabled={saving || !outputId} className="text-xs text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-2.5 py-1 rounded-md flex items-center gap-1">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                </>
              ) : (
                <>
                  {outputId && <button onClick={startEditing} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                  <button onClick={copyOutput} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy</button>
                </>
              )}
            </div>
          </div>
          {editing ? <EditableOutput output={draft} onChange={setDraft} /> : <OutputRenderer output={output} />}
        </div>
      )}

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">How to actually run this</p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal pl-4">
          <li>Download the audience CSV above for this segment.</li>
          <li>In Meta Ads Manager: Audiences → Create Audience → Custom Audience → Customer List → upload the CSV.</li>
          <li>Use the generated ad copy for a new campaign targeted at that Custom Audience.</li>
        </ol>
        <p className="text-xs text-slate-400">Hawlai doesn't auto-launch retargeting ads yet — that needs a live Meta Ads connection, same as other ad campaigns. This gets you a real, ready-to-use audience list and copy in the meantime.</p>
      </div>
    </div>
  );
}
