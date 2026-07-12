"use client";

import { useState, useRef, useEffect } from "react";
import { Brain, Loader2, Send, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Launch a Swift ad in Lucknow, 1000 per day, 5 days",
  "How is this month's performance?",
  "Give me SEO keyword ideas for Hyundai Creta",
  "What are competitors advertising in Lucknow?",
  "What should I do about my current campaigns?",
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

export default function MasterBrainPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loading]);

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
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-sm shadow-brand-600/30">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Master Brain</h1>
          <p className="text-sm text-slate-500">Ask for anything — it figures out which agent handles it</p>
        </div>
      </div>

      <div className="space-y-4 pb-24">
        {thread.length === 0 && (
          <div className="animate-fade-in-up space-y-3">
            <div className="card p-5 text-center py-8">
              <Sparkles className="w-6 h-6 text-brand-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Try one of these, or type your own:</p>
            </div>
            <div className="grid gap-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(ex)}
                  className="text-left text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 hover:border-brand-300 hover:bg-brand-500/10/50 transition-colors"
                >
                  "{ex}"
                </button>
              ))}
            </div>
          </div>
        )}

        {thread.map((msg, i) => (
          <div key={i} className={cn("flex gap-3 animate-fade-in-up", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={cn("max-w-[80%] space-y-1", msg.role === "user" && "flex flex-col items-end")}>
              {msg.role === "assistant" && msg.status && (
                <span className={cn("badge", STATUS_META[msg.status]?.className ?? STATUS_META.unclear.className)}>
                  {STATUS_META[msg.status]?.label ?? msg.status}
                </span>
              )}
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm"
                    : "bg-slate-100 border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"
                )}
              >
                {msg.content}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-500" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 animate-fade-in-up">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-slate-100 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="pt-2 pb-4 sticky bottom-0 bg-slate-50">
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-400 transition-all">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
            placeholder="Ask Master Brain anything..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm bg-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || message.trim().length < 3}
            className="w-9 h-9 shrink-0 flex items-center justify-center bg-gradient-to-b from-brand-600 to-brand-700 text-white rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
