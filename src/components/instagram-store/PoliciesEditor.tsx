"use client";

// Instagram Store → Policies (S4, 28 Nov 2026). Edits the business's
// EXISTING policy rows — the ones the onboarding interview writes and the
// DM reply and the claims guard read — through /api/business-knowledge,
// the same route the Business Knowledge page uses. No new fields.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { STORE_POLICIES, policiesFrom, policySaveRequest, type PolicyRow } from "@/lib/instagramStore/policies";

export default function PoliciesEditor() {
  const [rows, setRows] = useState<Record<string, PolicyRow | null> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string } | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const d = await fetch("/api/business-knowledge").then((r) => r.json()).catch(() => ({ error: "Couldn't load your policies." }));
    if (d?.error) {
      setLoadError(d.error);
      return;
    }
    const found = policiesFrom(d.facts ?? []);
    setRows(found);
    setDrafts(Object.fromEntries(STORE_POLICIES.map((p) => [p.title, found[p.title]?.content ?? ""])));
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(title: string) {
    setNotes((n) => ({ ...n, [title]: null }));
    const req = policySaveRequest(title, drafts[title] ?? "", rows?.[title] ?? null);
    if (!req.ok) {
      setNotes((n) => ({ ...n, [title]: { ok: false, text: req.reason } }));
      return;
    }
    setBusy(title);
    try {
      const res = await fetch("/api/business-knowledge", { method: req.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) }).catch(() => null);
      const d = await res?.json().catch(() => ({}));
      if (!res?.ok) {
        setNotes((n) => ({ ...n, [title]: { ok: false, text: d?.error ?? "That wasn't saved." } }));
        return;
      }
      setNotes((n) => ({ ...n, [title]: { ok: true, text: "Saved. Your DM replies use this from now on." } }));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <div className="card p-5 text-sm text-red-400">{loadError}</div>;
  if (!rows) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="card p-5 space-y-5">
      <p className="text-xs text-slate-400">
        What you write here is what Hawlai tells customers when they ask — in Instagram DMs and everywhere else it answers for you. Write it the way you'd say it.
      </p>
      {STORE_POLICIES.map((p) => (
        <div key={p.title} className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">{p.title}</p>
          <p className="text-[11px] text-slate-400">{p.hint}</p>
          <textarea
            value={drafts[p.title] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [p.title]: e.target.value }))}
            rows={3}
            className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex items-center gap-2">
            <button onClick={() => save(p.title)} disabled={busy !== null} className="text-xs px-3 py-1 rounded-lg bg-purple-600 text-white disabled:opacity-50">
              {busy === p.title ? "Saving…" : "Save"}
            </button>
            {notes[p.title] && <p className={`text-xs ${notes[p.title]!.ok ? "text-green-600" : "text-red-500"}`}>{notes[p.title]!.text}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
