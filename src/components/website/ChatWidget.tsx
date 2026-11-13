"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { trackEvent, visitPath, getOrCreateVisitorId } from "@/lib/utils";
import AgentAvatar from "@/components/website/AgentAvatar";

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
    // THE CONVERSATION WAS INVISIBLE BEYOND ITS FIRST SECOND — V4c.
    // `chat_open` fired when the widget opened and nothing after it, so
    // one visitor who opened the widget and left looked exactly like
    // one who asked six questions. Counted through the same track
    // route as every other event, so the owner's own messages are
    // excluded and consent decides what is identifiable — and no
    // message text is ever sent.
    trackEvent(slug, "chat_message");
    const newHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // WHERE THE VISITOR IS — V4b. Sanitised by the same
        // visitPath the tracker uses, so no query string or fragment
        // leaves the page; the server re-sanitises and treats it as a
        // claim either way.
        body: JSON.stringify({
          slug,
          message: text,
          history: messages,
          path: typeof window === "undefined" ? null : visitPath(window.location.pathname),
          // V5a — so a lead captured in this conversation can be tied
          // to what this visitor actually looked at.
          //
          // CONSENT-GATED DESPITE THE NAME: getOrCreateVisitorId is a
          // re-export of consent.ts's getVisitorIdIfConsented, which
          // returns null unless consent was granted. It creates an id
          // only for somebody who already said yes. One place decides
          // whether an identifier may exist, and this is not a second.
          visitorId: getOrCreateVisitorId(),
        }),
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
          onClick={() => { setOpen(true); trackEvent(slug, "chat_open"); }}
          className="fixed bottom-20 sm:bottom-5 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          style={{ backgroundColor: accentColor }}
        >
          {/* The robot, not a chat bubble. Drawn ON the accent
              colour, so the shell is white and the face screen takes
              the business's own colour — the same drawing as the
              header badge and the reply avatars, at a different size. */}
          <AgentAvatar color={accentColor} onColor="#FFFFFF" size={30} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 sm:bottom-5 right-5 z-40 w-[92vw] max-w-sm h-[65vh] max-h-[500px] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 text-white shrink-0" style={{ backgroundColor: accentColor }}>
            <div className="flex items-center gap-2 min-w-0">
              <AgentAvatar color={accentColor} onColor="#FFFFFF" size={22} />
              <p className="text-sm font-semibold truncate">Ask {dealershipName}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-neutral-50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6">
                <AgentAvatar color={accentColor} size={44} />
                <p className="text-xs text-neutral-400 text-center">Ask about pricing, availability, offers — anything!</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                {/* WHO IS SPEAKING, on the reply itself. The agent's
                    answers and the visitor's own messages are different
                    shapes and sides already; the face makes the
                    difference survive a screenshot. */}
                {m.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-0.5 pl-0.5">
                    <AgentAvatar color={accentColor} size={16} />
                    <span className="text-[10px] font-medium text-neutral-400">{dealershipName}</span>
                  </div>
                )}
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
                <div className="bg-white border border-neutral-200 rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-2">
                  <AgentAvatar color={accentColor} size={14} />
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
