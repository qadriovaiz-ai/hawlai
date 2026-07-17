"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  bookingLink?: string | null;
}

export default function ChatWidget({ slug, dealershipName, accentColor }: { slug: string; dealershipName: string; accentColor: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const newHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, message: text, history: messages }),
      });
      const data = await res.json();
      if (data.leadCaptured) setLeadCaptured(true);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "Sorry, something went wrong. Please try the contact form below.", bookingLink: data.bookingLink }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try the contact form below." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 sm:bottom-5 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          style={{ backgroundColor: accentColor }}
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 sm:bottom-5 right-5 z-40 w-[92vw] max-w-sm h-[65vh] max-h-[500px] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 text-white shrink-0" style={{ backgroundColor: accentColor }}>
            <p className="text-sm font-semibold">Ask {dealershipName}</p>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-neutral-50">
            {messages.length === 0 && (
              <p className="text-xs text-neutral-400 text-center py-6">Ask about pricing, availability, offers — anything!</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "text-white rounded-tr-sm" : "bg-white border border-neutral-200 text-neutral-700 rounded-tl-sm"
                  }`}
                  style={m.role === "user" ? { backgroundColor: accentColor } : undefined}
                >
                  {m.content}
                </div>
                {m.bookingLink && (
                  <a
                    href={m.bookingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    📅 Book a meeting
                  </a>
                )}
              </div>
            ))}
            {leadCaptured && (
              <p className="text-center text-xs text-green-600 bg-green-50 rounded-lg py-1.5 px-2">✓ Got it — our team will reach out shortly.</p>
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-neutral-200 rounded-xl rounded-tl-sm px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="p-2.5 border-t border-neutral-200 bg-white shrink-0">
            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-lg p-1">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a question..."
                disabled={loading}
                className="flex-1 px-2 py-1.5 text-sm bg-transparent focus:outline-none"
              />
              <button onClick={handleSend} disabled={loading || !input.trim()} className="w-7 h-7 shrink-0 flex items-center justify-center text-white rounded-md disabled:opacity-40" style={{ backgroundColor: accentColor }}>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
