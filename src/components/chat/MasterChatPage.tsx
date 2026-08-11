"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Send, User, Sparkles, ExternalLink, Globe, Box, PenTool, X, FileText, CheckCircle2, BarChart3, Link2, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const EXAMPLES = [
  "Build my brand kit — logo colors, tagline, brand story",
  "Write 3 Instagram posts for a new product launch",
  "Research my competitor [name] and find a content gap",
  "How is this month's performance and what should I do next?",
  "Give me a revenue forecast and budget recommendations",
];

interface Artifact {
  kind: "visual" | "document" | "record" | "metric" | "link";
  type?: "image" | "website" | "3d_scene" | "canvas_design";
  label: string;
  summary?: string;
  url?: string;
  html?: string;
  fields?: { label: string; value: string }[];
  groups?: { heading: string; items: { label: string; note?: string }[] }[];
  departmentHref?: string;
}

interface ChatMessage {
  id?: string | null;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  artifacts?: Artifact[];
  feedback?: "up" | "down" | null;
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

  async function submitFeedback(index: number, value: "up" | "down") {
    const msg = thread[index];
    if (!msg.id) return;
    // Toggle off if clicking the same value again.
    const next = msg.feedback === value ? null : value;
    setThread((prev) => prev.map((m, i) => (i === index ? { ...m, feedback: next } : m)));
    if (next) {
      await fetch("/api/chat/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msg.id, feedback: next }) });
    }
    // Toggling off isn't persisted as a separate "clear" state server-side
    // (the column just keeps the last value) — acceptable since the
    // main signal captured is "did someone actively react," and a
    // second click is rare enough not to warrant a DELETE endpoint too.
  }
  const [conversationId, setConversationId] = useState<string | null | undefined>(initialConversationId);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [panelClosed, setPanelClosed] = useState(false);
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
      setThread((prev) => [...prev, { id: data.messageId, role: "assistant", content: data.reply, toolsUsed: data.toolsUsed, artifacts: data.artifacts, feedback: null }]);
      const lastVisual = Array.isArray(data.artifacts) ? [...data.artifacts].reverse().find((a: Artifact) => a.kind === "visual") : null;
      if (lastVisual) {
        setActiveArtifact(lastVisual);
        setPanelClosed(false);
      }

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
    <div className="flex h-full">
    <div className="flex flex-col h-full flex-1 max-w-3xl mx-auto px-4 sm:px-6 min-w-0">
      <div className="flex items-center gap-2.5 py-4 pl-12 md:pl-0 border-b border-slate-200 shrink-0">
        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shadow-sm shadow-brand-600/30 shrink-0">
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
              {msg.role === "assistant" && msg.artifacts && msg.artifacts.length > 0 && (
                <div className="w-full space-y-1.5">
                  {msg.artifacts.map((artifact, ai) =>
                    artifact.kind === "visual" ? (
                      <button
                        key={ai}
                        onClick={() => { setActiveArtifact(artifact); setPanelClosed(false); }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 border border-brand-400/30 flex items-center gap-1"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> View {artifact.label}
                      </button>
                    ) : (
                      <ArtifactCard key={ai} artifact={artifact} />
                    )
                  )}
                </div>
              )}
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm whitespace-pre-wrap"
                    : "bg-slate-50 border border-slate-200 text-slate-700 rounded-tl-sm"
                )}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      h1: ({ children }) => <h3 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h3>,
                      h2: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h3>,
                      h3: ({ children }) => <h4 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h4>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 last:mb-0">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 last:mb-0">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">{children}</a>,
                      hr: () => <hr className="my-2.5 border-slate-200" />,
                      code: ({ children }) => <code className="bg-slate-200/70 px-1 py-0.5 rounded text-xs">{children}</code>,
                      img: ({ src, alt }) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src as string} alt={alt ?? ""} className="rounded-lg max-w-full my-2 border border-slate-200" />
                      ),
                      table: ({ children }) => (
                        <div className="my-2.5 overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-xs border-collapse">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                      tbody: ({ children }) => <tbody className="divide-y divide-slate-200">{children}</tbody>,
                      tr: ({ children }) => <tr>{children}</tr>,
                      th: ({ children }) => <th className="text-left font-semibold text-slate-700 px-2.5 py-1.5 whitespace-nowrap">{children}</th>,
                      td: ({ children }) => <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{children}</td>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
              {msg.role === "assistant" && msg.id && (
                <div className="flex items-center gap-1.5 mt-1 pl-1">
                  <button
                    onClick={() => submitFeedback(i, "up")}
                    className={cn("p-1 rounded transition-colors", msg.feedback === "up" ? "text-green-500" : "text-slate-300 hover:text-slate-500")}
                    aria-label="Good response"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => submitFeedback(i, "down")}
                    className={cn("p-1 rounded transition-colors", msg.feedback === "down" ? "text-red-400" : "text-slate-300 hover:text-slate-500")}
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </div>
              )}
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

    {/* Desktop: persistent side panel. Mobile: full-screen overlay, opened via the "View X" chip on a message. */}
    {activeArtifact && !panelClosed && (
      <div className="hidden lg:flex flex-col w-[420px] border-l border-slate-200 shrink-0 bg-white">
        <WorkspacePanel artifact={activeArtifact} onClose={() => setPanelClosed(true)} />
      </div>
    )}
    {activeArtifact && !panelClosed && (
      <div className="lg:hidden fixed inset-0 z-50 bg-white flex flex-col">
        <WorkspacePanel artifact={activeArtifact} onClose={() => setPanelClosed(true)} />
      </div>
    )}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const iconMap = { document: FileText, record: CheckCircle2, metric: BarChart3, link: Link2 } as const;
  const Icon = iconMap[artifact.kind as keyof typeof iconMap] ?? FileText;
  const colorMap = {
    document: "text-blue-500 bg-blue-500/10 border-blue-400/20",
    record: "text-emerald-600 bg-emerald-500/10 border-emerald-400/20",
    metric: "text-amber-600 bg-amber-500/10 border-amber-400/20",
    link: "text-brand-600 bg-brand-500/10 border-brand-400/20",
  } as const;

  return (
    <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 border", colorMap[artifact.kind as keyof typeof colorMap])}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800 capitalize truncate">{artifact.label}</p>
          {artifact.summary && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{artifact.summary}</p>}
          {artifact.fields && artifact.fields.length > 0 && (
            <dl className="mt-1.5 space-y-0.5">
              {artifact.fields.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <dt className="text-slate-400">{f.label}:</dt>
                  <dd className="text-slate-700 font-medium truncate">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {artifact.groups && artifact.groups.length > 0 && (
            <div className="mt-2 space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
              {artifact.groups.map((g, gi) => (
                <div key={gi}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{g.heading}</p>
                  <div className="space-y-1">
                    {g.items.map((item, ii) => (
                      <div key={ii} className="text-[11px] bg-slate-50 rounded-md px-2 py-1.5">
                        <p className="font-medium text-slate-700">{item.label}</p>
                        {item.note && <p className="text-slate-500 mt-0.5">{item.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {(artifact.kind === "link" && artifact.url) || artifact.departmentHref ? (
        <a
          href={artifact.kind === "link" && artifact.url ? artifact.url : artifact.departmentHref}
          target={artifact.kind === "link" ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-brand-600 bg-brand-500/5 border-t border-slate-100 hover:bg-brand-500/10 transition-colors"
        >
          {artifact.kind === "link" ? "Open link" : "Open in department"} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      ) : null}
    </div>
  );
}

function WorkspacePanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [sceneHtml, setSceneHtml] = useState<string | null>(null);
  const [loadingScene, setLoadingScene] = useState(false);

  useEffect(() => {
    if (artifact.type !== "3d_scene") return;
    // The artifact only carries a link to 3D Studio (list of scenes),
    // not the specific scene's HTML — fetch the most recent scene so
    // the panel can show it live rather than just linking out.
    setLoadingScene(true);
    fetch("/api/3d-scenes")
      .then((r) => r.json())
      .then(async (d) => {
        const latest = (d.scenes ?? []).find((s: any) => s.status === "ready");
        if (!latest) return;
        const detail = await fetch(`/api/3d-scenes/${latest.id}`).then((r) => r.json());
        setSceneHtml(detail.scene?.html_code ?? null);
      })
      .finally(() => setLoadingScene(false));
  }, [artifact]);

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {artifact.type === "image" && <Sparkles className="w-4 h-4 text-purple-500" />}
          {artifact.type === "website" && <Globe className="w-4 h-4 text-purple-500" />}
          {artifact.type === "3d_scene" && <Box className="w-4 h-4 text-purple-500" />}
          {artifact.type === "canvas_design" && <PenTool className="w-4 h-4 text-purple-500" />}
          {artifact.label}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {artifact.type === "image" && artifact.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artifact.url} alt={artifact.label} className="w-full rounded-lg border border-slate-200" />
        )}
        {artifact.type === "3d_scene" && (
          loadingScene ? (
            <div className="aspect-video flex items-center justify-center bg-slate-900 rounded-lg"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : sceneHtml ? (
            <iframe srcDoc={sceneHtml} sandbox="allow-scripts" className="w-full aspect-video rounded-lg border-0" title="3D scene" />
          ) : (
            <p className="text-xs text-slate-400">Couldn't load the scene preview.</p>
          )
        )}
        {(artifact.type === "website" || artifact.type === "canvas_design") && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-slate-500">This needs the full editor to view and edit.</p>
            <a href={artifact.url} className="inline-flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg">
              Open {artifact.label} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </>
  );
}
