"use client";

import { useState } from "react";
import { MessageCircle, Mail, Loader2, Copy, Check, X } from "lucide-react";

export default function GenerateMessageButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject?: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate(ch: "whatsapp" | "email") {
    setChannel(ch);
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/leads/${leadId}/generate-message`, {
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

  function handleCopy() {
    if (!result) return;
    const text = channel === "email" ? `Subject: ${result.subject}\n\n${result.message}` : result.message;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => generate("whatsapp")} className="btn-secondary text-sm">
          <MessageCircle className="w-4 h-4" /> WhatsApp Message
        </button>
        <button onClick={() => generate("email")} className="btn-secondary text-sm">
          <Mail className="w-4 h-4" /> Email
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                {channel === "whatsapp" ? <MessageCircle className="w-4 h-4 text-green-600" /> : <Mail className="w-4 h-4 text-blue-600" />}
                {channel === "whatsapp" ? "WhatsApp Message" : "Email Draft"}
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

            {result && !loading && (
              <div className="space-y-3">
                {result.subject && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Subject</p>
                    <p className="text-sm font-medium text-slate-800">{result.subject}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 mb-1">Message</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100">
                    {result.message}
                  </p>
                </div>
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
