"use client";

import { useState, useRef, useEffect } from "react";
import { Brain, Loader2, Send, User, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "How is this month's performance?",
  "What should I do about my current campaigns?",
  "Give me SEO keyword ideas for Hyundai Creta",
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_approval: { label: "Pending Approval", className: "bg-amber-500/10 text-amber-300 border-amber-700/50" },
  auto_approved: { label: "Auto-Approved", className: "bg-green-500/10 text-green-300 border-green-700/50" },
  answered: { label: "Answered", className: "bg-blue-500/10 text-blue-300 border-blue-700/50" },
  unclear: { label: "Unclear", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  status?: string;
}

export default function MasterBrainWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loading, open]);

  async function handleSend(text?: string) {
    const toSend = (text ?? message).trim();
    if (toSend.length < 3) return;

    setThread((prev) => [...prev, { role: "user", content: toSend }]);
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/master-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: toSend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setThread((prev) => [...prev, { role: "assistant", content: data.message, status: data.status }]);
    } catch (err: any) {
      setThread((prev) => [...prev, { role: "assistant", content: err.message ?? "Something went wrong", status: "unclear" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          title="Ask Master Brain"
        >
          <Brain className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-slate-100 border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shadow-sm shadow-brand-600/30">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Master Brain</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {thread.length === 0 && (
            <div className="space-y-3">
              <div className="text-center py-6">
                <Sparkles className="w-5 h-5 text-brand-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Ask anything, from any page</p>
              </div>
              <div className="space-y-1.5">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(ex)}
                    className="w-full text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 hover:border-brand-300 hover:bg-brand-500/10 transition-colors"
                  >
                    "{ex}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((msg, i) => (
            <div key={i} className={cn("flex gap-2 animate-fade-in-up", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-3 h-3 text-white" />
                </div>
              )}
              <div className={cn("max-w-[85%] space-y-1", msg.role === "user" && "flex flex-col items-end")}>
                {msg.role === "assistant" && msg.status && (
                  <span className={cn("badge text-[10px]", STATUS_META[msg.status]?.className ?? STATUS_META.unclear.className)}>
                    {STATUS_META[msg.status]?.label ?? msg.status}
                  </span>
                )}
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm"
                      : "bg-slate-50 border border-slate-200 text-slate-700 rounded-tl-sm"
                  )}
                >
                  {msg.content}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3 h-3 text-slate-500" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
                <Brain className="w-3 h-3 text-white" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl rounded-tl-sm px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="p-3 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-400 transition-all">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
              placeholder="Ask anything..."
              disabled={loading}
              className="flex-1 px-2 py-1.5 text-xs bg-transparent focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || message.trim().length < 3}
              className="w-7 h-7 shrink-0 flex items-center justify-center bg-gradient-to-b from-brand-600 to-brand-700 text-white rounded-md disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop on mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/20 z-40 sm:hidden" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
