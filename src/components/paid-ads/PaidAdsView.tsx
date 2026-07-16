"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Copy, Check, Clock, ArrowRight, Megaphone } from "lucide-react";
import { AD_PLATFORMS, AD_TASKS } from "@/lib/agents/paidAdsAgent";

export default function PaidAdsView() {
  const [platform, setPlatform] = useState(AD_PLATFORMS[0].key);
  const [taskType, setTaskType] = useState(AD_TASKS[0].key);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    setOutput(null);
    fetch(`/api/paid-ads/generate?platform=${platform}`).then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, [platform]);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/paid-ads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, taskType }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch(`/api/paid-ads/generate?platform=${platform}`).then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2).replace(/[{}"\[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const currentTaskMeta = AD_TASKS.find((t) => t.key === taskType);
  const currentPlatformMeta = AD_PLATFORMS.find((p) => p.key === platform);

  return (
    <div className="space-y-5">
      {/* Meta Ads — real, connected */}
      <Link href="/dashboard/ads/campaigns" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Megaphone className="w-4 h-4 text-purple-400" /> Meta Ads — connected, launch real campaigns in Ads Manager
        </span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      <div className="card p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Platform (planning — not yet connected)</p>
        <div className="flex flex-wrap gap-1.5">
          {AD_PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlatform(p.key)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                platform === p.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-purple-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{currentPlatformMeta?.label} isn't connected to a real ad account yet — this generates planning content for {currentPlatformMeta?.label} campaigns until it is.</p>
      </div>

      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {AD_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTaskType(t.key); setOutput(null); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                taskType === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-purple-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">Need creative images/banners? Use <Link href="/dashboard/graphic-design" className="text-purple-400 hover:underline">Graphic Design</Link> — Ad Creative type.</p>
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate {currentTaskMeta?.label} for {currentPlatformMeta?.label}
        </button>
      </div>

      {output && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Result</p>
            <button onClick={copyOutput} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
            </button>
          </div>
          <OutputRenderer output={output} />
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent for {currentPlatformMeta?.label}</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOutput(h.output)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                <span className="font-medium text-slate-700">{AD_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}</span>
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
                {(item.name || item.step || item.variable || item.item || item.campaignType) && (
                  <p className="font-semibold text-slate-800">{item.name || item.step || item.variable || item.item || item.campaignType}</p>
                )}
                <p className="text-xs text-slate-500">{item.description || item.detail || item.why || item.targetingNotes || item.whatToMeasure || JSON.stringify(item)}</p>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(output).map(([key, val]: [string, any]) => (
        <div key={key}>
          <p className="text-xs font-semibold text-slate-400 capitalize">{key.replace(/_/g, " ")}</p>
          {Array.isArray(val) ? (
            <ul className="space-y-1">{val.map((v: any, i: number) => <li key={i} className="text-sm">• {typeof v === "string" ? v : JSON.stringify(v)}</li>)}</ul>
          ) : (
            <p className="whitespace-pre-wrap">{typeof val === "string" ? val : JSON.stringify(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
