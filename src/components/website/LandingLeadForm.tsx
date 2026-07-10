"use client";

import { useState } from "react";
import { Loader2, CheckCircle, Send } from "lucide-react";

export default function LandingLeadForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Please enter your name");
    if (phone.trim().length < 8) return setError("Please enter a valid phone number");

    setLoading(true);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone, vehicle, honeypot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
        <CheckCircle className="w-9 h-9 text-[#D9A441] mx-auto mb-3" />
        <p className="font-semibold text-[#122744] text-lg">Thank you!</p>
        <p className="text-sm text-slate-500 mt-1">We'll reach out to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3.5 shadow-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9A441]/50 focus:border-[#D9A441]"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
        type="tel"
        className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9A441]/50 focus:border-[#D9A441]"
      />
      <input
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        placeholder="Which car are you interested in? (optional)"
        className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9A441]/50 focus:border-[#D9A441]"
      />
      {/* Honeypot field — hidden from real users, bots tend to fill everything */}
      <input
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[#122744] hover:bg-[#0d1d33] text-white text-sm font-semibold py-3 rounded-lg transition-colors disabled:opacity-60 uppercase tracking-wide"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {loading ? "Sending..." : "Get a Call Back"}
      </button>
    </form>
  );
}
