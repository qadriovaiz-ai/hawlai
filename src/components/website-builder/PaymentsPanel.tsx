"use client";

import { useState, useEffect } from "react";
import { Loader2, CreditCard, Check, ExternalLink, AlertCircle } from "lucide-react";

export default function PaymentsPanel() {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/razorpay")
      .then((r) => r.json())
      .then((d) => {
        setKeyId(d.keyId ?? "");
        setHasSecret(Boolean(d.hasSecret));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings/razorpay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId, keySecret: keySecret || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save");
      if (keySecret) setHasSecret(true);
      setKeySecret("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CreditCard className="w-4 h-4 text-slate-400" /> Online Payments (Razorpay)</p>

      <div className="bg-slate-100 rounded-lg p-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Connect your <strong>own</strong> Razorpay account here — this is what lets your customers pay online, with the money going straight to <strong>your</strong> bank account, not anywhere else. If you don't have one yet, sign up free at{" "}
          <a href="https://dashboard.razorpay.com/signup" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline inline-flex items-center gap-0.5">
            dashboard.razorpay.com <ExternalLink className="w-3 h-3" />
          </a>{" "}
          then copy your Key ID and Key Secret from Settings → API Keys there.
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Key ID</p>
          <input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_xxxxxxxxxxxx" className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Key Secret {hasSecret && <span className="text-green-500 font-normal">(already saved — leave blank to keep it)</span>}</p>
          <input
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            placeholder={hasSecret ? "••••••••••••••••" : "Paste your key secret"}
            className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button onClick={handleSave} disabled={saving} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saved ? "Saved" : "Save"}
      </button>

      <p className="text-xs text-slate-400">
        {keyId && hasSecret ? "✅ Connected — \"Pay Online\" will appear at checkout." : "Not connected yet — checkout will only offer Cash on Delivery until both fields are saved."}
      </p>
    </div>
  );
}
