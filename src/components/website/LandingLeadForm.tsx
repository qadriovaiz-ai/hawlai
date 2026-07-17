"use client";

import { useState } from "react";
import { Loader2, CheckCircle, Send } from "lucide-react";
import type { LandingTheme } from "@/lib/landingThemes";
import { trackEvent } from "@/lib/utils";

const DEFAULT_THEME: LandingTheme = { key: "navy_amber", label: "Navy & Amber", bg: "#FAF8F5", dark: "#122744", accent: "#D9A441", accentText: "#122744" };

export default function LandingLeadForm({ slug, theme = DEFAULT_THEME }: { slug: string; theme?: LandingTheme }) {
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
      trackEvent(slug, "form_submit");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center shadow-sm">
        <CheckCircle className="w-9 h-9 mx-auto mb-3" style={{ color: theme.accent }} />
        <p className="font-semibold text-[#122744] text-lg">Thank you!</p>
        <p className="text-sm text-neutral-500 mt-1">We'll reach out to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3.5 shadow-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="w-full p-3 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2"
        style={{ "--tw-ring-color": `${theme.accent}66` } as React.CSSProperties}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
        type="tel"
        className="w-full p-3 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2"
        style={{ "--tw-ring-color": `${theme.accent}66` } as React.CSSProperties}
      />
      <input
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        placeholder="What are you interested in? (optional)"
        className="w-full p-3 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2"
        style={{ "--tw-ring-color": `${theme.accent}66` } as React.CSSProperties}
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
        className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60 uppercase tracking-wide"
        style={{ backgroundColor: theme.dark }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {loading ? "Sending..." : "Get a Call Back"}
      </button>
    </form>
  );
}
