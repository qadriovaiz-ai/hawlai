"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, Check, Search, IndianRupee } from "lucide-react";

function AffiliatesPageInner() {
  const params = useSearchParams();
  const storeSlug = params.get("store") ?? "";
  const [mode, setMode] = useState<"apply" | "track">("apply");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10">
        <div className="max-w-lg mx-auto px-5 py-5 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">Hawlai</Link>
          <span className="text-xs font-mono uppercase tracking-wide text-ink/40">Affiliates</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-10 space-y-6">
        <div className="flex gap-2 border-b border-ink/10 pb-3">
          <button onClick={() => setMode("apply")} className={`text-sm font-medium px-3 py-1.5 rounded-lg ${mode === "apply" ? "bg-brand-600 text-white" : "text-ink/50"}`}>Apply</button>
          <button onClick={() => setMode("track")} className={`text-sm font-medium px-3 py-1.5 rounded-lg ${mode === "track" ? "bg-brand-600 text-white" : "text-ink/50"}`}>Check my earnings</button>
        </div>

        {mode === "apply" ? <ApplyForm storeSlug={storeSlug} /> : <TrackEarnings />}
      </div>
    </div>
  );
}

function ApplyForm({ storeSlug }: { storeSlug: string }) {
  const [slug, setSlug] = useState(storeSlug);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/affiliates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealershipSlug: slug, name, email, phone, notes, honeypot: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-10 space-y-2">
        <Check className="w-8 h-8 text-emerald-500 mx-auto" />
        <p className="text-sm font-medium">Application sent!</p>
        <p className="text-xs text-ink/50">The business will review it and send you a referral code once approved.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight mb-1">Become an affiliate</h1>
        <p className="text-sm text-ink/60">Earn real commission for every sale you bring in.</p>
      </div>
      {!storeSlug && (
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Store link/slug (from the business's website URL)" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
      )}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where will you promote them? (Instagram, blog, WhatsApp groups, etc.)" rows={3} className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting || !name.trim() || !slug.trim()}
        className="w-full text-sm font-mono uppercase tracking-wide bg-brand-600 text-white py-2.5 rounded-sm hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Apply
      </button>
    </div>
  );
}

function TrackEarnings() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/public/affiliates/track?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Code not found");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight mb-1">Check your earnings</h1>
        <p className="text-sm text-ink/60">Enter your referral code to see your real, live numbers.</p>
      </div>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. PRIYA10" className="flex-1 text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white font-mono" />
        <button onClick={lookup} disabled={loading || !code.trim()} className="bg-brand-600 text-white px-4 rounded-sm disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {result && (
        <div className="border border-ink/10 rounded-xl p-5 space-y-3 bg-white/40">
          <p className="text-sm font-semibold">{result.name} · {result.businessName}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-ink/40">Orders driven</p>
              <p className="text-lg font-bold">{result.ordersCount}</p>
            </div>
            <div>
              <p className="text-xs text-ink/40">Revenue driven</p>
              <p className="text-lg font-bold">₹{result.revenue.toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-xs text-ink/40">Commission earned</p>
              <p className="text-lg font-bold text-emerald-600">₹{result.commissionEarned.toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-xs text-ink/40">Already paid</p>
              <p className="text-lg font-bold">₹{result.totalPaid.toLocaleString("en-IN")}</p>
            </div>
          </div>
          <div className="border-t border-ink/10 pt-3 flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-brand-600" />
            <p className="text-sm font-semibold">₹{result.commissionOwed.toLocaleString("en-IN")} owed to you</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AffiliatesPage() {
  return (
    <Suspense fallback={null}>
      <AffiliatesPageInner />
    </Suspense>
  );
}
