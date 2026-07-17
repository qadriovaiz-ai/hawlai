"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Clock, FlaskConical, ShoppingCart, Info } from "lucide-react";
import { CRO_TASKS } from "@/lib/agents/croAgentV2";

export default function CroToolkit() {
  const [selectedTask, setSelectedTask] = useState(CRO_TASKS[0].key);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const [abTest, setAbTest] = useState<any>(null);
  const [abResults, setAbResults] = useState<any>(null);
  const [showAbForm, setShowAbForm] = useState(false);
  const [element, setElement] = useState("headline");
  const [variantA, setVariantA] = useState("");
  const [variantB, setVariantB] = useState("");

  function loadAbTest() {
    fetch("/api/cro/ab-test").then((r) => r.json()).then((d) => { setAbTest(d.test); setAbResults(d.results); });
  }
  useEffect(() => {
    fetch("/api/cro/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    loadAbTest();
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/cro/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskType: selectedTask }) });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/cro/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  async function createAbTest() {
    if (!variantA || !variantB) return;
    await fetch("/api/cro/ab-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ element, variantA, variantB }) });
    setShowAbForm(false);
    setVariantA(""); setVariantB("");
    loadAbTest();
  }

  async function toggleAbTest(active: boolean) {
    await fetch("/api/cro/ab-test", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    loadAbTest();
  }

  const currentMeta = CRO_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      {/* A/B Testing — real, on the live landing page */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><FlaskConical className="w-4 h-4" /> A/B Testing</p>
          {abTest && (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Active
              <input type="checkbox" checked={abTest.active} onChange={(e) => toggleAbTest(e.target.checked)} className="w-4 h-4 accent-purple-600" />
            </label>
          )}
        </div>
        <p className="text-xs text-slate-400">Runs directly on your live landing page — visitors are randomly shown Variant A or B, and results are measured from real clicks and leads.</p>

        {abTest ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Testing: <span className="font-semibold text-slate-700 capitalize">{abTest.element}</span></p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-500 mb-1">Variant A</p>
                <p className="text-sm text-slate-700 mb-2">{abTest.variant_a}</p>
                <p className="text-xs text-slate-400">{abResults?.A.views ?? 0} views · {abResults?.A.submits ?? 0} leads · {abResults?.A.conversionRate !== null ? `${abResults?.A.conversionRate.toFixed(1)}%` : "—"}</p>
              </div>
              <div className="bg-slate-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-500 mb-1">Variant B</p>
                <p className="text-sm text-slate-700 mb-2">{abTest.variant_b}</p>
                <p className="text-xs text-slate-400">{abResults?.B.views ?? 0} views · {abResults?.B.submits ?? 0} leads · {abResults?.B.conversionRate !== null ? `${abResults?.B.conversionRate.toFixed(1)}%` : "—"}</p>
              </div>
            </div>
          </div>
        ) : showAbForm ? (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <button onClick={() => setElement("headline")} className={`text-xs px-2.5 py-1.5 rounded-lg border ${element === "headline" ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>Headline</button>
              <button onClick={() => setElement("cta")} className={`text-xs px-2.5 py-1.5 rounded-lg border ${element === "cta" ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>CTA</button>
            </div>
            <input value={variantA} onChange={(e) => setVariantA(e.target.value)} placeholder="Variant A text" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <input value={variantB} onChange={(e) => setVariantB(e.target.value)} placeholder="Variant B text" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <button onClick={createAbTest} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg">Start Test</button>
          </div>
        ) : (
          <button onClick={() => setShowAbForm(true)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg">Create A/B Test</button>
        )}
      </div>

      {/* Checkout Optimization — honest note */}
      <div className="card p-5 space-y-1">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShoppingCart className="w-4 h-4" /> Checkout Optimization</p>
        <p className="text-xs text-slate-400 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Hawlai doesn't run an e-commerce checkout — the lead capture form below is the final conversion action on your page, so it's covered under Form Optimization.</p>
      </div>

      {/* Generator */}
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {CRO_TASKS.map((t) => (
            <button key={t.key} onClick={() => { setSelectedTask(t.key); setOutput(null); }} className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate {currentMeta?.label}
        </button>
      </div>

      {output && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Result</p>
          <OutputRenderer output={output} />
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOutput(h.output)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                {CRO_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  const arrayKey = Object.keys(output).find((k) => Array.isArray(output[k]));
  if (arrayKey) {
    return (
      <div className="space-y-1.5">
        {output[arrayKey].map((item: any, i: number) => (
          <div key={i} className="bg-slate-100 rounded-lg p-2.5 text-sm text-slate-700">
            {typeof item === "string" ? item : (
              <>
                {(item.issue || item.text) && <p className="font-semibold text-slate-800">{item.issue || item.text}</p>}
                <p className="text-xs text-slate-500">{item.fix || item.reasoning || item.angle || JSON.stringify(item)}</p>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-slate-700 whitespace-pre-wrap">{JSON.stringify(output)}</p>;
}
