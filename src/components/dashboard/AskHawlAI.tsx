"use client";

import { useState } from "react";
import { Sparkles, Loader2, ArrowUp } from "lucide-react";

const PROMPTS = ["Launch a campaign", "Increase my sales", "Create an Instagram post", "Analyze my competitors"];

export default function AskHawlAI() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(text?: string) {
    const q = text ?? message;
    if (q.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setMessage(q);
    try {
      const res = await fetch("/api/master-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResponse(data.reply);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 space-y-3 bg-gradient-to-br from-purple-500/10 to-brand-500/10 border-purple-700/30">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-400" /> Ask Hawl AI
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => handleAsk(p)}
            disabled={loading}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder='e.g. "Launch a Diwali campaign for my store"'
          disabled={loading}
          className="flex-1 bg-slate-100 text-slate-900 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
        />
        <button
          onClick={() => handleAsk()}
          disabled={loading || message.trim().length < 3}
          className="w-10 h-10 shrink-0 flex items-center justify-center bg-gradient-to-b from-brand-600 to-brand-700 text-white rounded-lg disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {response && (
        <div className="bg-slate-100 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap animate-fade-in-up">
          {response}
        </div>
      )}
    </div>
  );
}
