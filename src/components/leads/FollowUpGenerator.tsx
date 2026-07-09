"use client";

import { useState } from "react";
import { MessageSquare, Mail, Loader2, Copy, Check } from "lucide-react";

export default function FollowUpGenerator({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "email" | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject?: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(ch: "whatsapp" | "email") {
    setChannel(ch);
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!result) return;
    const text = result.subject ? `Subject: ${result.subject}\n\n${result.body}` : result.body;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => generate("whatsapp")} className="btn-secondary">
          <MessageSquare className="w-4 h-4" /> WhatsApp Message
        </button>
        <button onClick={() => generate("email")} className="btn-secondary">
          <Mail className="w-4 h-4" /> Email
        </button>
      </div>

      {open && (
        <div className="card p-4 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Writing {channel} message...
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <>
              {result.subject && <p className="text-sm font-semibold text-slate-800">Subject: {result.subject}</p>}
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{result.body}</p>
              <button onClick={copyToClipboard} className="btn-secondary text-xs mt-2">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
