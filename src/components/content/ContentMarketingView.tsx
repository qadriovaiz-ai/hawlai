"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Copy, Check, Clock } from "lucide-react";
import { CONTENT_TYPES } from "@/lib/agents/contentMarketingAgent";

const GROUPS = ["Social Posts", "Long-form", "Email & Sales Copy", "Video", "Quick Wins"] as const;

export default function ContentMarketingView() {
  const [selectedType, setSelectedType] = useState(CONTENT_TYPES[0].key);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/content-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/content-marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: selectedType, topic }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/content-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2).replace(/[{}"\[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const currentMeta = CONTENT_TYPES.find((t) => t.key === selectedType);

  return (
    <div className="space-y-5">
      {/* Type picker */}
      <div className="card p-5 space-y-4">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="text-xs font-semibold text-slate-400 mb-1.5">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.filter((t) => t.group === group).map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setSelectedType(t.key); setOutput(null); }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    selectedType === t.key
                      ? "bg-purple-600 border-purple-600 text-white"
                      : "bg-slate-100 border-slate-200 text-slate-600 hover:border-purple-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Generator */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Generate: {currentMeta?.label}</p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, product, or offer (optional — leave blank for a general idea)"
          className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate
        </button>
      </div>

      {/* Output */}
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

      {/* History */}
      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => setOutput(h.output)}
                className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5"
              >
                <span className="font-medium text-slate-700">{CONTENT_TYPES.find((t) => t.key === h.content_type)?.label ?? h.content_type}</span>
                {h.topic && <span className="text-slate-400"> — {h.topic}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  if (output.slides) {
    return <div className="space-y-2">{output.slides.map((s: any, i: number) => (
      <div key={i} className="bg-slate-100 rounded-lg p-3">
        <p className="text-sm font-semibold text-slate-700">{i + 1}. {s.headline}</p>
        <p className="text-xs text-slate-500">{s.supporting || s.body}</p>
      </div>
    ))}</div>;
  }
  if (output.days) {
    return <div className="space-y-2">{output.days.map((d: any, i: number) => (
      <div key={i} className="bg-slate-100 rounded-lg p-3">
        <p className="text-xs font-semibold text-purple-500">{d.day} · {d.contentType}</p>
        <p className="text-sm text-slate-700">{d.topic}</p>
        <p className="text-xs text-slate-400">{d.angle}</p>
      </div>
    ))}</div>;
  }
  if (output.hooks) return <ul className="space-y-1.5">{output.hooks.map((h: string, i: number) => <li key={i} className="text-sm text-slate-700 bg-slate-100 rounded-lg p-2.5">{h}</li>)}</ul>;
  if (output.ctas) return <ul className="space-y-1.5">{output.ctas.map((c: string, i: number) => <li key={i} className="text-sm text-slate-700 bg-slate-100 rounded-lg p-2.5">{c}</li>)}</ul>;
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(output).map(([key, val]: [string, any]) => (
        <div key={key}>
          {key !== "text" && <p className="text-xs font-semibold text-slate-400 capitalize">{key.replace(/_/g, " ")}</p>}
          <p className="whitespace-pre-wrap">{typeof val === "string" ? val : JSON.stringify(val)}</p>
        </div>
      ))}
    </div>
  );
}
