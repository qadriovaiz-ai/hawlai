"use client";

import { useState, useEffect } from "react";
import { Loader2, Users } from "lucide-react";

interface ChannelRow {
  channel: string;
  label: string;
  persona: string;
  isDefault: boolean;
}

interface PersonaOption {
  key: string;
  label: string;
  description: string;
}

// P3 piece 5 — personas already existed implicitly (four separately-
// written prompts that happen to read as sales/support/receptionist);
// this makes the mapping explicit and lets the owner change it.
export default function PersonaSettingsCard() {
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/personas")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setChannels(d.channels ?? []);
          setPersonas(d.personas ?? []);
        }
      })
      .catch(() => {});
  }, []);

  async function assign(channel: string, persona: string) {
    setSaving(channel);
    setError(null);
    const previous = channels;
    setChannels((prev) => prev?.map((c) => (c.channel === channel ? { ...c, persona, isDefault: false } : c)) ?? null);
    try {
      const res = await fetch("/api/personas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, persona }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Couldn't save");
      }
    } catch (err: any) {
      setChannels(previous ?? null); // revert the optimistic update
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  if (channels === null) {
    return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading personas...</div>;
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4 text-brand-400" /> Who handles each channel</p>
        <p className="text-xs text-slate-400 mt-0.5">Each AI worker has its own priorities and, on calls, its own tools. Defaults match how each channel already behaved.</p>
      </div>

      <div className="space-y-2.5">
        {channels.map((c) => (
          <div key={c.channel} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">{c.label}</span>
              {saving === c.channel && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </div>
            <div className="flex gap-1.5">
              {personas.map((p) => (
                <button
                  key={p.key}
                  onClick={() => assign(c.channel, p.key)}
                  disabled={saving !== null}
                  title={p.description}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    c.persona === p.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <p className="text-[10.5px] text-slate-400">
        Inbound calls stay dormant until a dedicated phone number is provisioned — that setting takes effect once it is.
      </p>
    </div>
  );
}
