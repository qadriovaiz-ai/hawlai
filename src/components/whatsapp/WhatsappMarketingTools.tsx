"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Copy, Check, Clock, MessageCircle, Users } from "lucide-react";
import { WHATSAPP_TASKS } from "@/lib/agents/whatsappMarketingAgent";
import { toWhatsAppLink } from "@/lib/utils";

export default function WhatsappMarketingTools() {
  const [selectedTask, setSelectedTask] = useState(WHATSAPP_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [showContacts, setShowContacts] = useState(false);

  useEffect(() => {
    fetch("/api/whatsapp/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setOutput(null);
    setShowContacts(false);
    try {
      const res = await fetch("/api/whatsapp/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedTask, topic }),
      });
      const data = await res.json();
      setOutput(data.output);
      fetch("/api/whatsapp/generate").then((r) => r.json()).then((d) => setHistory(d.items ?? []));
    } finally {
      setLoading(false);
    }
  }

  function copyMessage(msg: string) {
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function loadContacts() {
    setShowContacts(true);
    if (contacts.length === 0) {
      const res = await fetch("/api/whatsapp/contacts");
      const data = await res.json();
      setContacts(data.leads ?? []);
    }
  }

  const currentMeta = WHATSAPP_TASKS.find((t) => t.key === selectedTask);
  const isBroadcast = selectedTask === "broadcast";

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {WHATSAPP_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); setOutput(null); setShowContacts(false); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-green-600 border-green-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-green-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, offer, or context (optional)"
          className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400 mt-2"
        />
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 mt-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate {currentMeta?.label}
        </button>
      </div>

      {output && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Result</p>
          <OutputRenderer output={output} onCopy={copyMessage} copied={copied} />

          {isBroadcast && output.message && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <button onClick={loadContacts} className="text-xs text-green-600 hover:text-green-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Show my contacts to send this to
              </button>
              {showContacts && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {contacts.length === 0 && <p className="text-xs text-slate-400">Loading contacts...</p>}
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-slate-100 rounded-lg p-2.5">
                      <span className="text-sm text-slate-700">{c.name} <span className="text-xs text-slate-400">— {c.phone}</span></span>
                      <a
                        href={toWhatsAppLink(c.phone, output.message)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-green-600 hover:bg-green-500 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <MessageCircle className="w-3 h-3" /> Send
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <button key={h.id} onClick={() => { setOutput(h.output); setSelectedTask(h.task_type); }} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
                <span className="font-medium text-slate-700">{WHATSAPP_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputRenderer({ output, onCopy, copied }: { output: any; onCopy: (m: string) => void; copied: boolean }) {
  if (output.flow) {
    return <div className="space-y-2">{output.flow.map((f: any, i: number) => (
      <div key={i} className="bg-slate-100 rounded-lg p-2.5">
        <p className="text-xs font-semibold text-green-600">Trigger: {f.trigger}</p>
        <p className="text-sm text-slate-700 mt-0.5">{f.response}</p>
      </div>
    ))}</div>;
  }
  if (output.messages) {
    return <div className="space-y-2">{output.messages.map((m: any, i: number) => (
      <div key={i} className="bg-slate-100 rounded-lg p-2.5 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-green-600 font-semibold">Step {m.step}</p>
          <p className="text-sm text-slate-700">{m.message}</p>
        </div>
        <button onClick={() => onCopy(m.message)} className="shrink-0 text-slate-400 hover:text-slate-600">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    ))}</div>;
  }
  if (output.message) {
    return (
      <div className="bg-slate-100 rounded-lg p-3 flex items-start justify-between gap-2">
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{output.message}</p>
        <button onClick={() => onCopy(output.message)} className="shrink-0 text-slate-400 hover:text-slate-600">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }
  return <p className="text-sm text-slate-700">{JSON.stringify(output)}</p>;
}
