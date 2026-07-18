"use client";

import { useState, useEffect } from "react";
import { Loader2, Download, FileText, Presentation, Copy, Check, Sparkles, Clock } from "lucide-react";

export default function ReportToolsCard() {
  const [token, setToken] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);

  useEffect(() => {
    fetch("/api/reports/share-token").then((r) => r.json()).then((d) => { setToken(d.token); setSnapshots(d.snapshots ?? []); }).finally(() => setLoading(false));
  }, []);

  async function generateLink() {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/share-token", { method: "POST" });
      const data = await res.json();
      if (data.token) setToken(data.token);
    } finally {
      setGenerating(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(`${window.location.origin}/report/${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function downloadFile(url: string, setLoadingFn: (v: boolean) => void) {
    setLoadingFn(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "report";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    } finally {
      setLoadingFn(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700">Report Tools</p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => downloadFile("/api/reports/pdf", setDownloadingPdf)} disabled={downloadingPdf} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
          {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Download PDF
        </button>
        <button onClick={() => downloadFile("/api/reports/presentation", setDownloadingPptx)} disabled={downloadingPptx} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
          {downloadingPptx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />} Download Presentation
        </button>
      </div>

      <div className="pt-3 border-t border-slate-200 space-y-2">
        <p className="text-xs font-semibold text-slate-400">Client Report Link</p>
        {loading ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
        ) : token ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 text-slate-600 truncate">/report/{token}</code>
            <button onClick={copyUrl} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
            </button>
          </div>
        ) : (
          <button onClick={generateLink} disabled={generating} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate shareable link
          </button>
        )}
        <p className="text-xs text-slate-400">A clean, no-login report page you can send to a client or stakeholder — always shows current numbers.</p>
      </div>

      {snapshots.length > 0 && (
        <div className="pt-3 border-t border-slate-200 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Report History</p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {snapshots.map((s) => (
              <div key={s.id} className="bg-slate-100 rounded-lg p-2.5 flex items-center justify-between">
                <span className="text-xs text-slate-600 capitalize">{s.period_type} — {new Date(s.created_at).toLocaleDateString("en-IN")}</span>
                <span className="text-xs text-slate-400">Health: {s.stats?.healthScore ?? "—"}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
