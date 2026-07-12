"use client";

import { useState } from "react";
import { MessageCircle, Copy, Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { toWhatsAppLink } from "@/lib/utils";

export default function DraftMessagePreview({ message, phone }: { message: string; phone?: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-2 bg-green-500/10 border border-green-700/40 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Sparkles className="w-3.5 h-3.5 text-green-400 shrink-0" />
        <span className="text-xs font-medium text-green-300 flex-1">Follow-up message ready — drafted overnight</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-green-500" /> : <ChevronDown className="w-3.5 h-3.5 text-green-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-slate-700 bg-slate-100 rounded-lg p-2.5 border border-green-700/40 whitespace-pre-wrap">
            {message}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="btn-secondary text-xs flex-1 justify-center">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
            {phone && (
              <a
                href={toWhatsAppLink(phone, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary bg-green-600 hover:bg-green-700 text-xs flex-1 justify-center"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Send via WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
