"use client";

import { useState } from "react";
import { Brain, Loader2, AlertCircle, Send } from "lucide-react";

const EXAMPLES = [
  "Launch a Swift ad in Lucknow, 1000 per day, 5 days",
  "Diwali sale, all over Delhi, 20000 per day, 10 days",
  "How is this month's performance?",
];

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending_approval: { label: "Pending Approval", className: "bg-amber-50 text-amber-700 border-amber-200" },
  auto_approved: { label: "Auto-Approved", className: "bg-green-50 text-green-700 border-green-200" },
  answered: { label: "Answered", className: "bg-blue-50 text-blue-700 border-blue-200" },
  unclear: { label: "Unclear", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export default function MasterBrainPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    setError(null);
    setResult(null);
    if (message.trim().length < 3) return setError("Please type something");

    setLoading(true);
    try {
      const res = await fetch("/api/master-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Brain className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Master Brain</h1>
          <p className="text-sm text-slate-500">Type a message — it'll decide what to do</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`e.g. "Launch a Swift ad in Lucknow, 1000 per day" or "how is this month's performance?"`}
          className="w-full h-24 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setMessage(ex)}
              className="block w-full text-left text-xs text-slate-500 hover:text-purple-600 hover:bg-purple-50 px-2 py-1.5 rounded-md transition-colors"
            >
              "{ex}"
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleAsk}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? "Thinking..." : "Send"}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <span
            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${
              STATUS_STYLES[result.status]?.className ?? STATUS_STYLES.unclear.className
            }`}
          >
            {STATUS_STYLES[result.status]?.label ?? result.status}
          </span>
          <p className="text-sm text-slate-700 leading-relaxed">{result.message}</p>
        </div>
      )}
    </div>
  );
}
