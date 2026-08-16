"use client";

import { useState } from "react";
import { Presentation, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui";

// Real, downloadable, multi-slide .pptx — distinct from the "Pitch
// Deck Cover" design type above, which only ever produces one title-
// slide image. Fixed 5-slide shape (title, mission/about, product
// highlights, why-us, contact/CTA), content drafted from this
// business's own Brand Kit + products via /api/pitch-deck. No config
// needed since the shape is fixed for this phase — one click.
export default function PitchDeckBuilderCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pitch-deck");
      if (!res.ok) throw new Error("Couldn't generate the deck — try again in a moment.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pitch-deck.pptx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
          <Presentation className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Pitch Deck Builder</p>
          <p className="text-xs text-slate-500">A real 5-slide .pptx — title, about, products, why us, contact — from your Brand Kit</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="text-xs bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {loading ? "Building deck..." : "Download deck"}
      </button>
    </Card>
  );
}
