"use client";

import { useState, useEffect } from "react";
import { Calendar, Copy, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

// Relocated from the retired crm-marketing hub — this was the one
// genuinely unique piece of that page (a public self-serve booking
// link), everything else there was either a directory of links already
// reachable elsewhere or duplicated the Home page's follow-up-reminder
// signal. Lives here now since "how do I get appointments booked" and
// "here are my appointments" belong on the same tab.
export default function BookingLinkCard() {
  const [slug, setSlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/crm/booking-slug").then((r) => r.json()).then((d) => setSlug(d.slug)).finally(() => setLoadingSlug(false));
  }, []);

  async function handleGenerateLink() {
    setGenerating(true);
    try {
      const res = await fetch("/api/crm/booking-slug", { method: "POST" });
      const data = await res.json();
      if (data.slug) setSlug(data.slug);
    } finally {
      setGenerating(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Calendar className="w-4 h-4" /> Meeting Booking Link
      </p>
      {loadingSlug ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : slug ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-slate-200 rounded-lg px-3 py-2 text-slate-600 truncate">/book/{slug}</code>
          <Button onClick={copyLink} variant="secondary" size="sm" className="px-3 py-2 shrink-0">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy link
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">Share a link where leads can pick a free slot and book a meeting themselves — no login needed for them.</p>
          <Button onClick={handleGenerateLink} loading={generating} variant="primary" size="sm" className="px-3 py-2">
            {!generating && <Sparkles className="w-3.5 h-3.5" />} Create booking link
          </Button>
        </>
      )}
    </div>
  );
}
