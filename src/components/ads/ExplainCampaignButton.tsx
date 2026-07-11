"use client";

import { useState } from "react";
import { MessageCircleQuestion, Loader2, X } from "lucide-react";

export default function ExplainCampaignButton({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  async function handleClick() {
    setOpen(true);
    if (explanation) return; // already fetched once — don't refetch every click
    setLoading(true);
    try {
      const res = await fetch(`/api/ads/${campaignId}/explain`, { method: "POST" });
      const data = await res.json();
      setExplanation(data.explanation ?? "Couldn't generate an explanation right now.");
    } catch {
      setExplanation("Couldn't generate an explanation right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pt-2">
      {!open ? (
        <button onClick={handleClick} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1.5 font-medium">
          <MessageCircleQuestion className="w-3.5 h-3.5" /> Explain this campaign
        </button>
      ) : (
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
              <MessageCircleQuestion className="w-3.5 h-3.5" /> In plain language
            </p>
            <button onClick={() => setOpen(false)} className="text-purple-300 hover:text-purple-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-purple-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
            </div>
          ) : (
            <p className="text-sm text-purple-900 leading-relaxed">{explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
