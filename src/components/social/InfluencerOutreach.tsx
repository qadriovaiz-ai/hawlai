"use client";

import { useState } from "react";
import { Users, Loader2, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

export default function InfluencerOutreach() {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ searchTerms: string[]; outreachMessage: string; emailSubject: string; emailBody: string; collabIdeas: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setError(null);
    if (product.trim().length < 2) return setError("Describe what you want promoted");
    setLoading(true);
    try {
      const res = await fetch("/api/influencer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setPlan(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!plan) return;
    navigator.clipboard.writeText(plan.outreachMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card p-5 space-y-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" /> Influencer Outreach
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            No influencer database is connected here — this gives you exact search terms to find local micro-influencers yourself, plus a ready outreach message.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="What do you want promoted?"
              className="flex-1 bg-slate-100 text-slate-900 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={handleGenerate} disabled={loading} className="btn-primary text-sm shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {plan && (
            <div className="space-y-3 pt-1">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Search these on Instagram/YouTube</p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.searchTerms.map((t, i) => (
                    <span key={i} className="text-xs bg-purple-500/10 text-purple-300 px-2 py-1 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">Outreach message</p>
                  <button onClick={handleCopy} className="text-xs text-purple-400 flex items-center gap-1">
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-sm text-slate-700 bg-slate-100 rounded-lg p-3 whitespace-pre-wrap">{plan.outreachMessage}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email</p>
                <div className="bg-slate-100 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-600">Subject: {plan.emailSubject}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{plan.emailBody}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Collaboration ideas</p>
                <ul className="space-y-1">
                  {plan.collabIdeas.map((c, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-start gap-1.5">
                      <span className="text-purple-400 mt-0.5">•</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
