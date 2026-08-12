"use client";

import { useState, useEffect } from "react";
import { Users, Loader2, Copy, Check, ChevronDown, ChevronUp, Clock, Pencil, Save, X } from "lucide-react";

interface Plan {
  searchTerms: string[];
  outreachMessage: string;
  emailSubject: string;
  emailBody: string;
  collabIdeas: string[];
}

export default function InfluencerOutreach() {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (open) fetch("/api/influencer").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, [open]);

  async function handleGenerate() {
    setError(null);
    if (product.trim().length < 2) return setError("Describe what you want promoted");
    setLoading(true);
    setEditing(false);
    try {
      const res = await fetch("/api/influencer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setPlan(data.output);
      setPlanId(data.id);
      fetch("/api/influencer").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    if (!plan) return;
    setDraft(JSON.parse(JSON.stringify(plan)));
    setEditing(true);
  }

  async function saveEdits() {
    if (!planId || !draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/influencer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: planId, output: draft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setPlan(draft);
      setEditing(false);
      fetch("/api/influencer").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setSaving(false);
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
              <div className="flex items-center justify-end gap-3">
                {editing ? (
                  <>
                    <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button
                      onClick={saveEdits}
                      disabled={saving || !planId}
                      className="text-xs text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-2.5 py-1 rounded-md flex items-center gap-1"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                    </button>
                  </>
                ) : (
                  planId && (
                    <button onClick={startEditing} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )
                )}
              </div>

              {editing && draft ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Search terms (one per line)</p>
                    <textarea
                      value={draft.searchTerms.join("\n")}
                      onChange={(e) => setDraft({ ...draft, searchTerms: e.target.value.split("\n") })}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
                      rows={2}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach message</p>
                    <textarea
                      value={draft.outreachMessage}
                      onChange={(e) => setDraft({ ...draft, outreachMessage: e.target.value })}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
                      rows={4}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email subject</p>
                    <input
                      value={draft.emailSubject}
                      onChange={(e) => setDraft({ ...draft, emailSubject: e.target.value })}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email body</p>
                    <textarea
                      value={draft.emailBody}
                      onChange={(e) => setDraft({ ...draft, emailBody: e.target.value })}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
                      rows={4}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Collaboration ideas (one per line)</p>
                    <textarea
                      value={draft.collabIdeas.join("\n")}
                      onChange={(e) => setDraft({ ...draft, collabIdeas: e.target.value.split("\n") })}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <>
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
                    <p className="text-sm text-slate-700 bg-slate-200 rounded-lg p-3 whitespace-pre-wrap">{plan.outreachMessage}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email</p>
                    <div className="bg-slate-200 rounded-lg p-3 space-y-1">
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
                </>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Recent</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => { setPlan(h.output); setPlanId(h.id); setEditing(false); setProduct(h.product ?? ""); }}
                    className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5"
                  >
                    <span className="font-medium text-slate-700">{h.product}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
