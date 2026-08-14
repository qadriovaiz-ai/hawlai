"use client";

import { useState } from "react";
import { Users, Copy, Check, ChevronDown, ChevronUp, Clock, Pencil, Save, X } from "lucide-react";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";

export default function InfluencerOutreach() {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Copies only plan.outreachMessage, not the whole output — kept as
  // its own flag rather than the hook's copyOutput()/copied (that
  // copies the flattened whole object, wrong field for this button).
  const [messageCopied, setMessageCopied] = useState(false);

  const {
    loading, output: plan, outputId: planId, editing, draft, saving, history,
    generate, startEditing, cancelEditing, saveEdits, selectFromHistory, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/influencer" });

  async function handleGenerate() {
    setError(null);
    if (product.trim().length < 2) return setError("Describe what you want promoted");
    try {
      await generate({ product });
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    }
  }

  function handleCopy() {
    if (!plan) return;
    navigator.clipboard.writeText(plan.outreachMessage);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 2000);
  }

  function handleSelectHistory(h: any) {
    selectFromHistory(h);
    setProduct(h.product ?? "");
  }

  return (
    <Card className="space-y-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" /> Influencer Outreach
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            No influencer database is connected here — this gives you exact search terms to find local micro-influencers yourself, plus a ready outreach message.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="What do you want promoted?"
              className="flex-1"
            />
            <Button onClick={handleGenerate} loading={loading} className="shrink-0">
              Generate
            </Button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {plan && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-end gap-3">
                {editing ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>
                      <X className="w-3.5 h-3.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={saveEdits} loading={saving} disabled={!planId}>
                      {!saving && <Save className="w-3.5 h-3.5" />} Save
                    </Button>
                  </>
                ) : (
                  planId && (
                    <button onClick={startEditing} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )
                )}
              </div>

              {editing && draft ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Search terms (one per line)</p>
                    <Textarea
                      value={draft.searchTerms.join("\n")}
                      onChange={(e) => setDraft({ ...draft, searchTerms: e.target.value.split("\n") })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach message</p>
                    <Textarea
                      value={draft.outreachMessage}
                      onChange={(e) => setDraft({ ...draft, outreachMessage: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email subject</p>
                    <Input
                      value={draft.emailSubject}
                      onChange={(e) => setDraft({ ...draft, emailSubject: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email body</p>
                    <Textarea
                      value={draft.emailBody}
                      onChange={(e) => setDraft({ ...draft, emailBody: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Collaboration ideas (one per line)</p>
                    <Textarea
                      value={draft.collabIdeas.join("\n")}
                      onChange={(e) => setDraft({ ...draft, collabIdeas: e.target.value.split("\n") })}
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Search these on Instagram/YouTube</p>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.searchTerms.map((t: string, i: number) => (
                        <Badge key={i} tone="brand">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-slate-500">Outreach message</p>
                      <button onClick={handleCopy} className="text-xs text-brand-400 flex items-center gap-1">
                        {messageCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {messageCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="text-sm text-slate-700 bg-slate-200 rounded-lg p-3 whitespace-pre-wrap">{plan.outreachMessage}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Outreach email</p>
                    <div className="bg-slate-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-slate-600">Subject: {plan.emailSubject}</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{plan.emailBody}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Collaboration ideas</p>
                    <ul className="space-y-1">
                      {plan.collabIdeas.map((c: string, i: number) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-1.5">
                          <span className="text-brand-400 mt-0.5">•</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Recent</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handleSelectHistory(h)}
                    className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5"
                  >
                    <span className="font-medium text-slate-700">{h.product}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
