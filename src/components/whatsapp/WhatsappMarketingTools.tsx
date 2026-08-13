"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check, Clock, MessageCircle, Users, Pencil, Save, X } from "lucide-react";
import { WHATSAPP_TASKS } from "@/lib/agents/whatsappMarketingAgent";
import { toWhatsAppLink } from "@/lib/utils";
import { EditableOutput } from "@/components/shared/GeneratedOutputEditor";
import { Button, Card, Input } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";

// Green throughout this file is WhatsApp's own brand color, not the
// undeclared-purple inconsistency the rollout is retiring elsewhere —
// deliberately left as-is rather than forced to `brand`, since users
// expect WhatsApp-adjacent UI to read as WhatsApp-green.
export default function WhatsappMarketingTools() {
  const [selectedTask, setSelectedTask] = useState(WHATSAPP_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [messageCopied, setMessageCopied] = useState(false);
  const {
    loading, output, outputId, editing, draft, saving, history,
    generate, startEditing, cancelEditing, saveEdits, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/whatsapp/generate" });

  async function handleGenerate() {
    setShowContacts(false);
    await generate({ taskType: selectedTask, topic });
  }

  // Copies one specific message string (e.g. one step of a sequence),
  // not the whole output object the hook's own copyOutput() assumes —
  // kept as separate local state rather than reusing the hook's copied
  // flag, which would otherwise overwrite the clipboard with the full
  // JSON output right after this sets it to just the message text.
  function copyMessage(msg: string) {
    navigator.clipboard.writeText(msg);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 1500);
  }

  function selectHistoryItem(h: any) {
    selectFromHistory(h);
    setSelectedTask(h.task_type);
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
      <Card className="space-y-3">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {WHATSAPP_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); reset(); setShowContacts(false); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-green-600 border-green-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-green-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, offer, or context (optional)"
          className="mt-2"
        />
        <button onClick={handleGenerate} disabled={loading} className="text-sm bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 mt-2 transition-all active:scale-[0.98] disabled:active:scale-100">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate {currentMeta?.label}
        </button>
      </Card>

      {output && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Result</p>
            {editing ? (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
                <button
                  onClick={saveEdits}
                  disabled={saving || !outputId}
                  className="text-xs text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 px-2.5 py-1 rounded-md flex items-center gap-1"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                </button>
              </div>
            ) : (
              outputId && (
                <button onClick={startEditing} className="text-xs text-green-600 hover:text-green-500 flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )
            )}
          </div>

          {editing ? <EditableOutput output={draft} onChange={setDraft} /> : <WhatsappOutputRenderer output={output} onCopy={copyMessage} copied={messageCopied} />}

          {!editing && isBroadcast && output.message && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <button onClick={loadContacts} className="text-xs text-green-600 hover:text-green-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Show my contacts to send this to
              </button>
              {showContacts && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {(["all", "hot", "warm", "cold"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTemperatureFilter(t)}
                        className={`text-xs px-2 py-1 rounded-full border capitalize ${
                          temperatureFilter === t ? "bg-green-600 border-green-600 text-white" : "bg-slate-200 border-slate-300 text-slate-500"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {contacts.length === 0 && <p className="text-xs text-slate-400">Loading contacts...</p>}
                    {contacts
                      .filter((c) => temperatureFilter === "all" || c.lead_temperature === temperatureFilter)
                      .map((c) => (
                        <div key={c.id} className="flex items-center justify-between bg-slate-200 rounded-lg p-2.5">
                          <span className="text-sm text-slate-700">
                            {c.name} <span className="text-xs text-slate-400">— {c.phone}{c.lead_temperature ? ` · ${c.lead_temperature}` : ""}</span>
                          </span>
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
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Recent</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((h: any) => (
              <button
                key={h.id}
                onClick={() => selectHistoryItem(h)}
                className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5"
              >
                <span className="font-medium text-slate-700">{WHATSAPP_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function WhatsappOutputRenderer({ output, onCopy, copied }: { output: any; onCopy: (m: string) => void; copied: boolean }) {
  if (output.flow) {
    return <div className="space-y-2">{output.flow.map((f: any, i: number) => (
      <div key={i} className="bg-slate-200 rounded-lg p-2.5">
        <p className="text-xs font-semibold text-green-600">Trigger: {f.trigger}</p>
        <p className="text-sm text-slate-700 mt-0.5">{f.response}</p>
      </div>
    ))}</div>;
  }
  if (output.messages) {
    return <div className="space-y-2">{output.messages.map((m: any, i: number) => (
      <div key={i} className="bg-slate-200 rounded-lg p-2.5 flex items-start justify-between gap-2">
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
      <div className="bg-slate-200 rounded-lg p-3 flex items-start justify-between gap-2">
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{output.message}</p>
        <button onClick={() => onCopy(output.message)} className="shrink-0 text-slate-400 hover:text-slate-600">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }
  return <p className="text-sm text-slate-700">{JSON.stringify(output)}</p>;
}
