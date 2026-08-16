"use client";

import { useState, useEffect } from "react";
import { Loader2, MessageSquareWarning, Save } from "lucide-react";
import { Badge, Button, Card, EmptyState, Select, Textarea, type BadgeTone } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved" };
const STATUS_TONES: Record<string, BadgeTone> = { open: "warning", in_progress: "brand", resolved: "positive" };

export default function ComplaintsView() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/complaints").then((r) => r.json()).then((d) => setComplaints(d.complaints ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    setComplaints((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    await fetch("/api/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
  }

  async function saveResolutionNotes(id: string) {
    setSaving(true);
    try {
      await fetch("/api/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, resolutionNotes: resolutionDraft }) });
      setExpandedId(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>;
  }

  if (complaints.length === 0) {
    return (
      <Card padding="none">
        <EmptyState title="No complaints logged" description="Complaints raised on a call show up here, with real specifics captured while the caller was still on the line." />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {complaints.map((c) => (
        <Card key={c.id} className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900">{c.leads?.name ?? "Unknown caller"}</p>
                <Badge tone={STATUS_TONES[c.status] ?? "neutral"}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
              </div>
              {c.leads?.phone && <p className="text-xs text-slate-400">{c.leads.phone}</p>}
              <p className="text-sm text-slate-600 mt-1.5">{c.description}</p>
              <p className="text-[11px] text-slate-400 mt-1">{new Date(c.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
              {c.resolution_notes && (
                <div className="mt-2 bg-slate-200 rounded-lg p-2.5">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Resolution notes</p>
                  <p className="text-xs text-slate-600">{c.resolution_notes}</p>
                </div>
              )}
            </div>
            <Select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)} className="w-auto shrink-0">
              {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>

          {expandedId === c.id ? (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <Textarea value={resolutionDraft} onChange={(e) => setResolutionDraft(e.target.value)} placeholder="What was done to resolve this" rows={2} />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => saveResolutionNotes(c.id)} loading={saving}>{!saving && <Save className="w-3 h-3" />} Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setExpandedId(c.id); setResolutionDraft(c.resolution_notes ?? ""); }}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              <MessageSquareWarning className="w-3 h-3" /> {c.resolution_notes ? "Edit resolution notes" : "Add resolution notes"}
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}
