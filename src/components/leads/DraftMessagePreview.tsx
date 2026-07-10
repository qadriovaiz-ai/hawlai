"use client";

import { useState } from "react";
import { MessageCircle, Copy, Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

export default function DraftMessagePreview({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-2 bg-green-50 border border-green-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Sparkles className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <span className="text-xs font-medium text-green-700 flex-1">Follow-up message ready — drafted overnight</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-green-500" /> : <ChevronDown className="w-3.5 h-3.5 text-green-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-slate-700 bg-white rounded-lg p-2.5 border border-green-100 whitespace-pre-wrap">
            {message}
          </p>
          <button onClick={handleCopy} className="btn-secondary text-xs w-full justify-center">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy message"}
          </button>
        </div>
      )}
    </div>
  );
}
