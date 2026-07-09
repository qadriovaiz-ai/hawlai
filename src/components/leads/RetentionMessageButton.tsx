"use client";

import { useState } from "react";
import { Heart, Loader2, Copy, Check, X } from "lucide-react";

const ANGLES = [
  { value: "service_reminder", label: "Service Reminder" },
  { value: "referral", label: "Ask for Referral" },
  { value: "upsell", label: "Upgrade / Upsell" },
];

export default function RetentionMessageButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate(angle: string) {
    setOpen(true);
    setLoading(true);
    setError(null);
    setMessage(null);
    setCopied(false);
    try {
      const res = await fetch("/api/retention/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, angle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMessage(data.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!message) return;
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {ANGLES.map((a) => (
          <button key={a.value} onClick={() => generate(a.value)} className="btn-secondary text-xs">
            <Heart className="w-3.5 h-3.5" /> {a.label}
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" /> Retention Message
              </p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Writing...
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}

            {message && !loading && (
              <div className="space-y-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {message}
                </p>
                <button onClick={handleCopy} className="btn-primary w-full text-sm justify-center">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy to clipboard"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
