"use client";

import { useState, useEffect } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";

type LimitKey =
  | "images_per_month"
  | "videos_per_month"
  | "voiceover_chars_per_month"
  | "research_credits_per_month"
  | "calling_minutes"
  | "messages_per_day";

const LIMIT_LABELS: Record<LimitKey, string> = {
  images_per_month: "Images / month",
  videos_per_month: "Videos / month",
  voiceover_chars_per_month: "Voiceover chars / month",
  research_credits_per_month: "Research credits / month",
  calling_minutes: "Included calling minutes",
  messages_per_day: "AI messages / day",
};

const LIMIT_KEYS = Object.keys(LIMIT_LABELS) as LimitKey[];

interface BusinessRow {
  id: string;
  name: string;
  plan: string;
  planLimits: Record<LimitKey, number | null>;
  override: (Record<LimitKey, number | null> & { dealership_id: string }) | null;
}

export default function ClientLimitsView() {
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<LimitKey, string>>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function load() {
    fetch("/api/agency/client-limits")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setBusinesses(d.businesses ?? []);
      })
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  function draftValue(b: BusinessRow, key: LimitKey): string {
    const draft = drafts[b.id]?.[key];
    if (draft !== undefined) return draft;
    const current = b.override?.[key];
    return current == null ? "" : String(current);
  }

  async function save(b: BusinessRow) {
    setBusy(b.id);
    setError(null);
    setSavedId(null);
    try {
      const payload: Record<string, any> = { dealershipId: b.id };
      for (const key of LIMIT_KEYS) payload[key] = draftValue(b, key);

      const res = await fetch("/api/agency/client-limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      setDrafts((prev) => ({ ...prev, [b.id]: {} }));
      setSavedId(b.id);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (businesses === null && !error) {
    return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  }
  if (error && businesses === null) return <div className="card p-8 text-sm text-red-400">{error}</div>;
  if ((businesses ?? []).length === 0) return <p className="text-sm text-slate-400 text-center py-12">No businesses found.</p>;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs text-slate-500">
          Cap a client below what their plan includes — useful when you resell a tier but want to control what any one client consumes. Leave a field blank to use the plan&apos;s own limit. You can only lower a limit, never raise it above what the plan sells.
        </p>
        <p className="text-[10.5px] text-slate-400 mt-1.5">
          Clients see their real capped limit on their own usage page, not the plan number — showing them a limit they can&apos;t reach would be misleading.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {(businesses ?? []).map((b) => (
        <div key={b.id} className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> {b.name}
              </p>
              <p className="text-xs text-slate-400 capitalize">{b.plan} plan</p>
            </div>
            {savedId === b.id && <span className="text-xs text-green-500">Saved</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {LIMIT_KEYS.map((key) => {
              const planValue = b.planLimits[key];
              return (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">{LIMIT_LABELS[key]}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draftValue(b, key)}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], [key]: e.target.value } }))}
                    placeholder={planValue == null ? "Unlimited" : String(planValue)}
                    className="input text-sm"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Plan includes {planValue == null ? "unlimited" : planValue.toLocaleString("en-IN")}
                  </p>
                </div>
              );
            })}
          </div>

          <Button onClick={() => save(b)} loading={busy === b.id} size="sm">Save caps</Button>
        </div>
      ))}
    </div>
  );
}
