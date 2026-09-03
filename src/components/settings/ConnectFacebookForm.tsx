"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

export default function ConnectFacebookForm({ pending }: { pending: any }) {
  const router = useRouter();
  const pages = pending.pages ?? [];
  const adAccounts = pending.adAccounts ?? [];

  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [adAccountId, setAdAccountId] = useState(adAccounts[0]?.id ?? "");
  const [leadFormId, setLeadFormId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPage = pages.find((p: any) => p.id === pageId);
  const leadForms = selectedPage?.leadForms ?? [];

  // Pixels come from the ad account, not the Page — the callback
  // attached them per account.
  const selectedAccount = adAccounts.find((a: any) => a.id === adAccountId);
  const pixels = selectedAccount?.pixels ?? [];

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/facebook/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          ad_account_id: adAccountId,
          lead_form_id: leadFormId || undefined,
          pixel_id: pixelId || undefined,
        }),
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
      <div className="bg-red-500/10 border border-red-700/50 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-300">
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
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
          onChange={(e) => { setAdAccountId(e.target.value); setPixelId(""); }}
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {adAccounts.length === 0 && <option value="">No Ad Account found</option>}
          {adAccounts.map((a: any) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
      </div>

      {/* Only shown when there is genuinely a choice. One pixel needs
          no question — finalize takes it automatically — and zero
          pixels needs an explanation, not a dropdown. Dealers used to
          have to find this 15-digit number in Events Manager and paste
          it into Settings → Integrations. */}
      {pixels.length > 1 ? (
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">Meta Pixel</label>
          <select
            value={pixelId || pixels[0].id}
            onChange={(e) => setPixelId(e.target.value)}
            className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {pixels.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">This ad account has more than one — pick the one on your website.</p>
        </div>
      ) : pixels.length === 1 ? (
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2.5">
          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-px" />
          <p>Meta Pixel <span className="font-medium text-slate-700">{pixels[0].name}</span> found and will be set up for you.</p>
        </div>
      ) : adAccountId ? (
        <p className="text-xs text-slate-400">
          No Meta Pixel found on this ad account. Conversion tracking stays off until one exists — everything else still works.
        </p>
      ) : null}

      <div>
        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Lead Form (optional)</label>
        <select
          value={leadFormId}
          onChange={(e) => setLeadFormId(e.target.value)}
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
        <div className="bg-red-500/10 border border-red-700/50 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <Button onClick={handleSave} disabled={!adAccountId} loading={loading} className="w-full">
        {!loading && <CheckCircle className="w-4 h-4" />}
        Save Connection
      </Button>
    </div>
  );
}
