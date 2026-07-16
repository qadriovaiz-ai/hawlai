"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Copy, Check, Clock, Video, Mic2, ArrowRight } from "lucide-react";
import { VIDEO_TASKS } from "@/lib/agents/videoMarketingAgent";

export default function VideoMarketingView() {
  const [selectedTask, setSelectedTask] = useState(VIDEO_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/video-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch("/api/video-marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask, topic }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/video-marketing/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2).replace(/[{}"\[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const currentMeta = VIDEO_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      {/* Link to existing AI video generation + voiceover in Creative Studio */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/dashboard/creative-studio" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Video className="w-4 h-4 text-purple-400" /> AI Video Generation</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
        <Link href="/dashboard/creative-studio" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Mic2 className="w-4 h-4 text-purple-400" /> Voiceover</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
      </div>

      {/* Task picker */}
      <div className="card p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); setOutput(null); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-purple-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generator */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Generate: {currentMeta?.label}</p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic or video subject (optional)"
          className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400"
        />
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate
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
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOutput(h.output)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                <span className="font-medium text-slate-700">{VIDEO_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}</span>
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
  const arrayKey = Object.keys(output).find((k) => Array.isArray(output[k]));
  if (arrayKey) {
    return (
      <div className="space-y-1.5">
        {output[arrayKey].map((item: any, i: number) => (
          <div key={i} className="bg-slate-100 rounded-lg p-2.5 text-sm text-slate-700">
            {typeof item === "string" ? item : (
              <>
                {item.time && <span className="text-xs text-purple-500 font-mono mr-2">{item.time}</span>}
                {item.shot && <span className="font-semibold mr-1">{item.shot}:</span>}
                {item.text || item.description || item.concept || JSON.stringify(item)}
                {item.duration && <span className="text-xs text-slate-400 ml-2">({item.duration})</span>}
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
          {key !== "text" && <p className="text-xs font-semibold text-slate-400 capitalize">{key.replace(/_/g, " ")}</p>}
          <p className="whitespace-pre-wrap">{typeof val === "string" ? val : JSON.stringify(val)}</p>
        </div>
      ))}
    </div>
  );
}
