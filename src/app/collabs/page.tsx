"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, X, Check, Gift, IndianRupee, Instagram } from "lucide-react";

interface Listing {
  id: string;
  title: string;
  description: string | null;
  compensation_type: "product" | "paid" | "both";
  compensation_details: string | null;
  dealerships: { dealership_name: string; business_category: string | null; city: string | null } | null;
}

export default function CollabsBoardPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingTo, setApplyingTo] = useState<Listing | null>(null);

  useEffect(() => {
    fetch("/api/public/collabs").then((r) => r.json()).then((d) => setListings(d.listings ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">Hawlai</Link>
          <span className="text-xs font-mono uppercase tracking-wide text-ink/40">Open Collabs</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Brands looking for creators like you</h1>
          <p className="text-sm text-ink/60">Real, small Indian businesses posting real collaboration opportunities — no agency, no middleman. Apply directly.</p>
        </div>

        {loading ? (
          <p className="text-sm text-ink/40 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading opportunities...</p>
        ) : listings.length === 0 ? (
          <div className="border border-dashed border-ink/15 rounded-xl p-8 text-center">
            <p className="text-sm text-ink/50">No open opportunities right now — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((l) => (
              <div key={l.id} className="border border-ink/10 rounded-xl p-5 bg-white/40 space-y-3">
                <div>
                  <p className="text-xs text-ink/40 font-mono uppercase tracking-wide">
                    {l.dealerships?.dealership_name ?? "A business"}{l.dealerships?.city ? ` · ${l.dealerships.city}` : ""}
                  </p>
                  <h2 className="font-semibold text-base mt-1">{l.title}</h2>
                  {l.description && <p className="text-sm text-ink/65 mt-1.5">{l.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs bg-ink/5 px-2.5 py-1 rounded-full">
                    {l.compensation_type === "paid" ? <IndianRupee className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
                    {l.compensation_type === "product" ? "Product" : l.compensation_type === "paid" ? "Paid" : "Product + Paid"}
                  </span>
                  {l.compensation_details && <span className="text-xs text-ink/50">{l.compensation_details}</span>}
                </div>
                <button
                  onClick={() => setApplyingTo(l)}
                  className="text-xs font-mono uppercase tracking-wide bg-brand-600 text-white px-4 py-2 rounded-sm hover:bg-brand-700 transition-colors"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-ink/10 pt-6">
          <p className="text-xs text-ink/40">
            Run a business and want to find creators here?{" "}
            <Link href="/auth/signup" className="text-brand-600 underline">Post a collab on Hawlai</Link>
          </p>
        </div>
      </div>

      {applyingTo && <ApplyModal listing={applyingTo} onClose={() => setApplyingTo(null)} />}
    </div>
  );
}

function ApplyModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [followers, setFollowers] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/collabs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id, name, handle, platform,
          followersEstimate: followers ? Number(followers) : null,
          contactInfo: contact, message, honeypot: "",
        }),
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

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-paper w-full sm:max-w-md sm:rounded-xl rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Apply — {listing.title}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-ink/40" /></button>
        </div>

        {submitted ? (
          <div className="text-center py-6 space-y-2">
            <Check className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium">Application sent!</p>
            <p className="text-xs text-ink/50">{listing.dealerships?.dealership_name ?? "The business"} will reach out directly if it's a fit.</p>
          </div>
        ) : (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Instagram className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
                <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" className="w-full text-sm border border-ink/15 rounded-lg pl-8 pr-3 py-2 bg-white" />
              </div>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="text-sm border border-ink/15 rounded-lg px-2 py-2 bg-white">
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
                <option value="facebook">Facebook</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input value={followers} onChange={(e) => setFollowers(e.target.value)} type="number" placeholder="Follower count (approx)" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone, email, or where to DM you" className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Quick note on why you're a fit (optional)" rows={3} className="w-full text-sm border border-ink/15 rounded-lg px-3 py-2 bg-white" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={submit}
              disabled={submitting || !name.trim() || !contact.trim()}
              className="w-full text-sm font-mono uppercase tracking-wide bg-brand-600 text-white py-2.5 rounded-sm hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Send application
            </button>
          </>
        )}
      </div>
    </div>
  );
}
