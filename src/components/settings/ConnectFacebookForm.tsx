"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

export default function ConnectFacebookForm({ pending }: { pending: any }) {
  const router = useRouter();
  const pages = pending.pages ?? [];
  const adAccounts = pending.adAccounts ?? [];

  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [adAccountId, setAdAccountId] = useState(adAccounts[0]?.id ?? "");
  const [leadFormId, setLeadFormId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPage = pages.find((p: any) => p.id === pageId);
  const leadForms = selectedPage?.leadForms ?? [];

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/facebook/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, ad_account_id: adAccountId, lead_form_id: leadFormId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (pages.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">
          No Facebook Page found on this account. Make sure you're logged in with the Facebook account that has Page Admin access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Facebook Page</label>
        <select
          value={pageId}
          onChange={(e) => { setPageId(e.target.value); setLeadFormId(""); }}
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {pages.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Ad Account</label>
        <select
          value={adAccountId}
          onChange={(e) => setAdAccountId(e.target.value)}
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {adAccounts.length === 0 && <option value="">No Ad Account found</option>}
          {adAccounts.map((a: any) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Lead Form (optional)</label>
        <select
          value={leadFormId}
          onChange={(e) => setLeadFormId(e.target.value)}
          className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">None selected</option>
          {leadForms.map((f: any) => (
            <option key={f.id} value={f.id}>{f.name} ({f.status})</option>
          ))}
        </select>
        {leadForms.length === 0 && (
          <p className="text-xs text-slate-400 mt-1">No Lead Form found for this Page</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={loading || !adAccountId}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        Save Connection
      </button>
    </div>
  );
}
