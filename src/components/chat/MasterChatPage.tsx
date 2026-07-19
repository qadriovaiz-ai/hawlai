"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Send, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Build my brand kit — logo colors, tagline, brand story",
  "Write 3 Instagram posts for a new product launch",
  "Research my competitor [name] and find a content gap",
  "How is this month's performance and what should I do next?",
  "Give me a revenue forecast and budget recommendations",
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

export default function MasterChatPage({
  conversationId: initialConversationId,
  initialMessages = [],
}: {
  conversationId?: string | null;
  initialMessages?: ChatMessage[];
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null | undefined>(initialConversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loading]);

  async function handleSend(text?: string) {
    const toSend = (text ?? message).trim();
    if (toSend.length < 1 || loading) return;

    const newThread = [...thread, { role: "user" as const, content: toSend }];
    setThread(newThread);
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/master-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: toSend,
          history: thread.map((m) => ({ role: m.role, content: m.content })),
          conversationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setThread((prev) => [...prev, { role: "assistant", content: data.reply, toolsUsed: data.toolsUsed }]);

      // First message of a brand-new chat — now that the conversation
      // exists in the DB, update the URL to /chat/[id] so a refresh
      // (or the sidebar list) keeps this thread, without losing what's
      // already on screen.
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
        router.replace(`/chat/${data.conversationId}`, { scroll: false });
      }
    } catch (err: any) {
      setThread((prev) => [...prev, { role: "assistant", content: err.message ?? "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto px-4 sm:px-6">
      <div className="flex items-center gap-2.5 py-4 border-b border-slate-200 shrink-0">
        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shadow-sm shadow-brand-600/30">
          <Brain className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Hawlai — Ask me anything</p>
          <p className="text-xs text-slate-400">I can generate, save, and prep work across every department. Anything that spends money or sends something live still needs your approval.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {thread.length === 0 && (
          <div className="space-y-4 py-8">
            <div className="text-center">
              <Sparkles className="w-6 h-6 text-brand-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Tell me what you need — brand, content, research, strategy, anything.</p>
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(ex)}
                  className="w-full text-left text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 hover:border-brand-300 hover:bg-brand-500/10 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {thread.map((msg, i) => (
          <div key={i} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={cn("max-w-[80%] space-y-1", msg.role === "user" && "flex flex-col items-end")}>
              {msg.role === "assistant" && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-700/30">
                  Used: {msg.toolsUsed.join(", ").replace(/_/g, " ")}
                </span>
              )}
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm"
                    : "bg-slate-50 border border-slate-200 text-slate-700 rounded-tl-sm"
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
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="pt-3 pb-4 border-t border-slate-200 shrink-0">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-400 transition-all">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
            placeholder="Ask me to build, write, research, or plan anything..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm bg-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || message.trim().length < 1}
            className="w-9 h-9 shrink-0 flex items-center justify-center bg-gradient-to-b from-brand-600 to-brand-700 text-white rounded-lg disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
