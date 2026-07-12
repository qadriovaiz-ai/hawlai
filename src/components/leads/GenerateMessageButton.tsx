"use client";

import { useState } from "react";
import { MessageCircle, Mail, Loader2, Copy, Check, X, Send } from "lucide-react";
import { toWhatsAppLink } from "@/lib/utils";

export default function GenerateMessageButton({ leadId, phone, email }: { leadId: string; phone?: string | null; email?: string | null }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject?: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

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

  async function handleSendEmail() {
    if (!result || !email) return;
    setSendingEmail(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject: result.subject ?? "A message from us", body: result.message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send");
      setEmailSent(true);
    } catch (err: any) {
      setEmailError(err.message);
    } finally {
      setSendingEmail(false);
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
          <div className="bg-slate-100 rounded-xl max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
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
                <div className="flex items-center gap-2">
                  <button onClick={handleCopy} className="btn-secondary flex-1 text-sm justify-center">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  {channel === "whatsapp" && phone && (
                    <a
                      href={toWhatsAppLink(phone, result.message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary bg-green-600 hover:bg-green-700 flex-1 text-sm justify-center"
                    >
                      <MessageCircle className="w-4 h-4" /> Send via WhatsApp
                    </a>
                  )}
                  {channel === "email" && email && !emailSent && (
                    <button onClick={handleSendEmail} disabled={sendingEmail} className="btn-primary flex-1 text-sm justify-center">
                      {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {sendingEmail ? "Sending..." : "Send Email"}
                    </button>
                  )}
                  {channel === "email" && emailSent && (
                    <span className="flex-1 text-sm text-green-600 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" /> Sent!</span>
                  )}
                </div>
                {channel === "email" && !email && (
                  <p className="text-xs text-slate-400">No email address on file for this lead — copy the text instead.</p>
                )}
                {emailError && <p className="text-xs text-red-600">{emailError}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
