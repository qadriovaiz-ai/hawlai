"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Copy, Check, Clock, Pencil, Save, X } from "lucide-react";
import { CONTENT_TYPES } from "@/lib/agents/contentMarketingAgent";

const GROUPS = ["Social Posts", "Long-form", "Email & Sales Copy", "Video", "Quick Wins"] as const;

export default function ContentMarketingView() {
  const [selectedType, setSelectedType] = useState(CONTENT_TYPES[0].key);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/content-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    setOutputId(null);
    setEditing(false);
    try {
      const res = await fetch("/api/content-marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: selectedType, topic }),
      });
      const data = await res.json();
      setOutput(data.output);
      setOutputId(data.id);
      fetch("/api/content-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    setDraft(JSON.parse(JSON.stringify(output))); // deep copy so cancel doesn't mutate the saved version
    setEditing(true);
  }

  async function saveEdits() {
    if (!outputId) return; // nothing to save against (e.g. a fallback that never got a DB row)
    setSaving(true);
    try {
      const res = await fetch("/api/content-marketing/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: outputId, output: draft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setOutput(draft);
      setEditing(false);
      fetch("/api/content-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setSaving(false);
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
                      : "bg-slate-200 border-slate-300 text-slate-600 hover:border-purple-400"
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
            <div className="flex items-center gap-3">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving || !outputId}
                    className="text-xs text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-2.5 py-1 rounded-md flex items-center gap-1"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                </>
              ) : (
                <>
                  {outputId && (
                    <button onClick={startEditing} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button onClick={copyOutput} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
                  </button>
                </>
              )}
            </div>
          </div>
          {editing ? <EditableOutput output={draft} onChange={setDraft} /> : <OutputRenderer output={output} />}
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
                onClick={() => { setOutput(h.output); setOutputId(h.id); setEditing(false); }}
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

function EditableOutput({ output, onChange }: { output: any; onChange: (next: any) => void }) {
  function updateField(path: (string | number)[], value: string) {
    const next = JSON.parse(JSON.stringify(output));
    let target = next;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = value;
    onChange(next);
  }

  if (output.slides) {
    return (
      <div className="space-y-2">
        {output.slides.map((s: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400">{i + 1}.</p>
            <input
              value={s.headline ?? ""}
              onChange={(e) => updateField(["slides", i, "headline"], e.target.value)}
              className="w-full text-sm font-semibold bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-800"
              placeholder="Headline"
            />
            <textarea
              value={s.supporting ?? s.body ?? ""}
              onChange={(e) => updateField(["slides", i, s.supporting !== undefined ? "supporting" : "body"], e.target.value)}
              className="w-full text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-600"
              rows={2}
            />
          </div>
        ))}
      </div>
    );
  }
  if (output.days) {
    return (
      <div className="space-y-2">
        {output.days.map((d: any, i: number) => (
          <div key={i} className="bg-slate-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-purple-500">{d.day} · {d.contentType}</p>
            <input
              value={d.topic ?? ""}
              onChange={(e) => updateField(["days", i, "topic"], e.target.value)}
              className="w-full text-sm bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-800"
              placeholder="Topic"
            />
            <textarea
              value={d.angle ?? ""}
              onChange={(e) => updateField(["days", i, "angle"], e.target.value)}
              className="w-full text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-1.5 text-slate-500"
              rows={2}
              placeholder="Angle"
            />
          </div>
        ))}
      </div>
    );
  }
  if (output.hooks) {
    return (
      <div className="space-y-1.5">
        {output.hooks.map((h: string, i: number) => (
          <textarea
            key={i}
            value={h}
            onChange={(e) => {
              const next = JSON.parse(JSON.stringify(output));
              next.hooks[i] = e.target.value;
              onChange(next);
            }}
            className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
            rows={1}
          />
        ))}
      </div>
    );
  }
  if (output.ctas) {
    return (
      <div className="space-y-1.5">
        {output.ctas.map((c: string, i: number) => (
          <textarea
            key={i}
            value={c}
            onChange={(e) => {
              const next = JSON.parse(JSON.stringify(output));
              next.ctas[i] = e.target.value;
              onChange(next);
            }}
            className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
            rows={1}
          />
        ))}
      </div>
    );
  }
  // Generic key/value text fields — the same fallback shape OutputRenderer uses.
  return (
    <div className="space-y-2.5">
      {Object.entries(output).map(([key, val]: [string, any]) => (
        <div key={key}>
          {key !== "text" && <p className="text-xs font-semibold text-slate-400 capitalize mb-1">{key.replace(/_/g, " ")}</p>}
          <textarea
            value={typeof val === "string" ? val : JSON.stringify(val)}
            onChange={(e) => updateField([key], e.target.value)}
            className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
            rows={typeof val === "string" && val.length > 80 ? 4 : 2}
          />
        </div>
      ))}
    </div>
  );
}

function OutputRenderer({ output }: { output: any }) {
  if (output.slides) {
    return <div className="space-y-2">{output.slides.map((s: any, i: number) => (
      <div key={i} className="bg-slate-200 rounded-lg p-3">
        <p className="text-sm font-semibold text-slate-700">{i + 1}. {s.headline}</p>
        <p className="text-xs text-slate-500">{s.supporting || s.body}</p>
      </div>
    ))}</div>;
  }
  if (output.days) {
    return <div className="space-y-2">{output.days.map((d: any, i: number) => (
      <div key={i} className="bg-slate-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-purple-500">{d.day} · {d.contentType}</p>
        <p className="text-sm text-slate-700">{d.topic}</p>
        <p className="text-xs text-slate-400">{d.angle}</p>
      </div>
    ))}</div>;
  }
  if (output.hooks) return <ul className="space-y-1.5">{output.hooks.map((h: string, i: number) => <li key={i} className="text-sm text-slate-700 bg-slate-200 rounded-lg p-2.5">{h}</li>)}</ul>;
  if (output.ctas) return <ul className="space-y-1.5">{output.ctas.map((c: string, i: number) => <li key={i} className="text-sm text-slate-700 bg-slate-200 rounded-lg p-2.5">{c}</li>)}</ul>;
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
