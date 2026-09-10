"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUp, ArrowDown, SlidersHorizontal, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { statusCell, toggleState, type LiveDelivery, type StatusTone } from "@/lib/ads/campaignDeliveryDisplay";
import { DEFAULT_VISIBLE, resolveVisibleColumns, serializeColumns, type ColumnKey } from "@/lib/analytics/campaignColumns";

// Sortable, column-configurable campaign table — Ads Manager style.
//
// No migration: sorting is UI state, and column preferences are a
// per-user DISPLAY setting rather than business data, so they live in
// localStorage. Persisting them server-side would mean a schema
// change and a round-trip for something that only affects how one
// person's screen looks.
//
// STATUS is read live from Meta after the page draws
// (/api/ads/campaign-status), so Analytics never waits on Meta. Until
// it answers, and whenever Meta can't be reached, the cell shows the
// last RECORDED status with its date — never a bare "Active" that Meta
// hasn't just confirmed (campaignDeliveryDisplay.ts).
//
// THE ON/OFF SWITCH goes through the existing dashboard route
// (/api/ads/[id]/status) — the same gating as everywhere: pausing is
// immediate; starting is confirmed here with Meta's budget first, then
// runs directly for an owner or goes to Approvals for anyone without
// authority. It is locked unless Meta has just confirmed the status.

export interface CampaignRow {
  /** ad_creatives id — how the live status is looked up. */
  id?: string;
  headline: string;
  spend: number;
  leads: number;
  revenue: number;
  conversions: number;
  days: number;
  /** Meta's campaign id, to find it in Ads Manager. */
  metaCampaignId?: string | null;
  /** Latest definitive status recorded on a daily snapshot, and its date. */
  recorded?: { state: string; date: string } | null;
  /** Hawlai's own last write (ad_creatives.meta_status) — never shown as confirmed. */
  localStatus?: string | null;
}

/** null while the live check is running. */
type LiveMap = Record<string, LiveDelivery> | null;

type Note = { tone: "info" | "error"; text: string };

type Confirming = { id: string; headline: string; budget: string | null | "loading" };

interface RenderCtx {
  live: LiveMap;
  busy: Record<string, boolean>;
  notes: Record<string, Note>;
  confirming: Confirming | null;
  onToggle: (row: CampaignRow) => void;
  onConfirmStart: () => void;
  onCancelStart: () => void;
}

interface Column {
  key: ColumnKey;
  label: string;
  /** Sort value. Columns without one aren't sortable. */
  value?: (row: CampaignRow) => number | null;
  render: (row: CampaignRow, ctx: RenderCtx) => React.ReactNode;
}

const TONE_CLASS: Record<StatusTone, string> = {
  good: "bg-green-500/10 text-green-500",
  neutral: "bg-slate-100 text-slate-600",
  warn: "bg-amber-500/10 text-amber-500",
  bad: "bg-red-500/10 text-red-400",
  muted: "bg-transparent text-slate-400 px-0",
};

function liveFor(row: CampaignRow, live: LiveMap): LiveDelivery | "loading" | null {
  if (live === null) return "loading";
  return row.id ? (live[row.id] ?? null) : null;
}

function StatusBadge({ row, live }: { row: CampaignRow; live: LiveMap }) {
  const cell = statusCell(liveFor(row, live), row.recorded ?? null, row.localStatus ?? null);
  return (
    <div className="min-w-[8.5rem]">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TONE_CLASS[cell.tone]}`}>{cell.text}</span>
      {cell.sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug max-w-[16rem]">{cell.sub}</p>}
    </div>
  );
}

function ToggleCell({ row, ctx }: { row: CampaignRow; ctx: RenderCtx }) {
  const busy = !!(row.id && ctx.busy[row.id]);
  const current = liveFor(row, ctx.live);
  const t = toggleState(current, busy);
  const note = row.id ? ctx.notes[row.id] : undefined;
  const confirming = ctx.confirming && ctx.confirming.id === row.id ? ctx.confirming : null;

  return (
    <div className="relative min-w-[3rem]">
      <button
        type="button"
        role="switch"
        aria-checked={t.on}
        aria-label={`${t.on ? "Pause" : "Start"} ${row.headline} on Meta`}
        title={t.reason ?? (t.on ? "Pause on Meta" : "Start on Meta")}
        disabled={!t.enabled}
        onClick={() => ctx.onToggle(row)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 ${t.on ? "bg-brand-600" : "bg-slate-400"}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${t.on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>

      {busy && <p className="text-[11px] text-slate-400 mt-1">Working…</p>}
      {/* The lock reason, except while simply checking — that is already the Status column's job. */}
      {!busy && !t.enabled && t.reason && current !== "loading" && (
        <p className="text-[11px] text-slate-400 mt-1 max-w-[11rem] leading-snug">{t.reason}</p>
      )}
      {note && (
        <p className={`text-[11px] mt-1 max-w-[12rem] leading-snug ${note.tone === "error" ? "text-amber-500" : "text-slate-500"}`}>{note.text}</p>
      )}

      {confirming && (
        <>
          <div className="fixed inset-0 z-10" onClick={ctx.onCancelStart} />
          <div className="absolute left-0 top-7 z-20 w-64 card p-3 shadow-lg space-y-2" role="dialog" aria-label={`Start ${row.headline}`}>
            <p className="text-xs font-semibold text-slate-800">Start “{confirming.headline}” on Meta?</p>
            <p className="text-xs text-slate-600">
              Budget:{" "}
              {confirming.budget === "loading" ? (
                <span className="text-slate-400">checking with Meta…</span>
              ) : confirming.budget ? (
                <span className="font-medium">{confirming.budget}</span>
              ) : (
                <span className="text-amber-500">couldn&apos;t be read from Meta</span>
              )}
            </p>
            <p className="text-[11px] text-slate-400">This starts real spend on Meta until you pause it.</p>
            {confirming.budget === null && (
              <p className="text-[11px] text-amber-500">Hawlai won&apos;t start spend without confirming the amount. Try again in a moment.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={ctx.onCancelStart} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={ctx.onConfirmStart}
                disabled={!confirming.budget || confirming.budget === "loading"}
                className="text-xs px-2.5 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const COLUMNS: Column[] = [
  { key: "onOff", label: "On/Off", render: (r, ctx) => <ToggleCell row={r} ctx={ctx} /> },
  { key: "status", label: "Status", render: (r, ctx) => <StatusBadge row={r} live={ctx.live} /> },
  {
    key: "campaignId",
    label: "Campaign ID",
    render: (r) =>
      r.metaCampaignId ? (
        <code className="text-xs text-slate-500 select-all" title="Meta campaign ID — search for it in Ads Manager">
          {r.metaCampaignId}
        </code>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  { key: "days", label: "Days", value: (r) => r.days, render: (r) => <span className="text-slate-500">{r.days}</span> },
  { key: "spend", label: "Spend", value: (r) => r.spend, render: (r) => formatCurrency(r.spend) },
  { key: "leads", label: "Leads", value: (r) => r.leads, render: (r) => r.leads },
  {
    key: "costPerLead",
    label: "Cost/Lead",
    // null, not Infinity or 0 — a campaign with no leads has no
    // cost-per-lead, which is different from a cost of zero.
    value: (r) => (r.leads > 0 ? r.spend / r.leads : null),
    render: (r) => (r.leads > 0 ? formatCurrency(r.spend / r.leads) : "—"),
  },
  { key: "conversions", label: "Sales", value: (r) => r.conversions, render: (r) => r.conversions },
  { key: "revenue", label: "Revenue", value: (r) => r.revenue, render: (r) => (r.revenue > 0 ? formatCurrency(r.revenue) : "—") },
  {
    key: "roas",
    label: "ROAS",
    value: (r) => (r.spend > 0 && r.revenue > 0 ? r.revenue / r.spend : null),
    render: (r) =>
      r.spend > 0 && r.revenue > 0 ? (
        <span className={r.revenue / r.spend >= 1 ? "text-green-500" : "text-amber-500"}>
          {(r.revenue / r.spend).toFixed(1)}x
        </span>
      ) : (
        "—"
      ),
  },
];

const STORAGE_KEY = "hawlai_campaign_columns";

async function fetchStatuses(ids: string[], includeBudget = false): Promise<Record<string, LiveDelivery> | null> {
  try {
    const res = await fetch("/api/ads/campaign-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, includeBudget }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.statuses ?? {};
  } catch {
    return null;
  }
}

export default function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  // Default matches the previous hardcoded sort exactly, so the table
  // looks unchanged until someone actually interacts with it.
  const [sortKey, setSortKey] = useState<ColumnKey>("spend");
  const [descending, setDescending] = useState(true);
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [showPicker, setShowPicker] = useState(false);
  const [live, setLive] = useState<LiveMap>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // resolveVisibleColumns drops stale keys AND shows columns added
      // since the preference was saved — see campaignColumns.ts.
      if (saved) setVisible(resolveVisibleColumns(JSON.parse(saved)));
    } catch {
      // Corrupt or blocked storage — defaults are fine.
    }
  }, []);

  // The switch needs the live status too, so either column asks Meta.
  const needsLive = visible.includes("status") || visible.includes("onOff");
  const idsKey = rows.map((r) => r.id ?? "").join(",");

  useEffect(() => {
    if (!needsLive) return;
    const ids = rows.map((r) => r.id).filter((id): id is string => !!id);
    if (ids.length === 0) {
      setLive({});
      return;
    }
    let cancelled = false;
    setLive(null);
    fetchStatuses(ids).then((statuses) => {
      // A failed request leaves every row on its last recorded status,
      // marked as not confirmed — and every switch locked.
      if (!cancelled) setLive(statuses ?? {});
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, needsLive]);

  function setNote(id: string, note: Note | null) {
    setNotes((n) => {
      const next = { ...n };
      if (note) next[id] = note;
      else delete next[id];
      return next;
    });
  }

  /** Re-read one row from Meta, so the switch shows what actually happened. */
  async function refreshRow(id: string) {
    const statuses = await fetchStatuses([id]);
    setLive((prev) => ({
      ...(prev ?? {}),
      [id]: statuses?.[id] ?? { state: "unknown", label: "Couldn't check", detail: null, checkedAt: null },
    }));
  }

  async function sendStatus(id: string, status: "ACTIVE" | "PAUSED") {
    setBusy((b) => ({ ...b, [id]: true }));
    setNote(id, null);
    try {
      const res = await fetch(`/api/ads/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        setNote(id, { tone: "info", text: data.message ?? "Sent to Approvals for review." });
      } else if (!res.ok) {
        // The route's own words: which level refused, or that Meta
        // accepted but couldn't be read back.
        setNote(id, { tone: "error", text: data.error ?? "Meta didn't accept the change." });
      }
    } catch {
      setNote(id, { tone: "error", text: "Couldn't reach Hawlai. Check the status before trying again." });
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
      await refreshRow(id);
    }
  }

  async function onToggle(row: CampaignRow) {
    if (!row.id) return;
    const t = toggleState(liveFor(row, live), !!busy[row.id]);
    if (!t.enabled) return;

    // Pausing stops spend: immediate, like pause everywhere else.
    if (t.on) {
      await sendStatus(row.id, "PAUSED");
      return;
    }

    // Starting spends money: confirm first, with Meta's own budget.
    const id = row.id;
    setConfirming({ id, headline: row.headline, budget: "loading" });
    const statuses = await fetchStatuses([id], true);
    setConfirming((c) => (c && c.id === id ? { ...c, budget: statuses?.[id]?.budget ?? null } : c));
  }

  async function onConfirmStart() {
    if (!confirming || !confirming.budget || confirming.budget === "loading") return;
    const id = confirming.id;
    setConfirming(null);
    await sendStatus(id, "ACTIVE");
  }

  function toggleColumn(key: ColumnKey) {
    // At least one column must remain, or the table becomes just a list
    // of names with no information in it.
    const next = visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
    if (next.length === 0) return;
    setVisible(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeColumns(next)));
    } catch {
      // Preference just won't persist; the table still works.
    }
  }

  function sortBy(key: ColumnKey) {
    if (key === sortKey) setDescending((d) => !d);
    else {
      setSortKey(key);
      setDescending(true); // a newly picked metric almost always wants highest-first
    }
  }

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey);
    if (!column?.value) return rows;
    const value = column.value;
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Rows with no value sort LAST in both directions. A campaign
      // with no ROAS isn't "worst ROAS" — it has no data, and letting
      // it top an ascending sort would read as the worst performer.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return descending ? bv - av : av - bv;
    });
  }, [rows, sortKey, descending]);

  const shownColumns = COLUMNS.filter((c) => visible.includes(c.key));
  const ctx: RenderCtx = { live, busy, notes, confirming, onToggle, onConfirmStart, onCancelStart: () => setConfirming(null) };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setShowPicker((s) => !s)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 inline-flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3 h-3" /> Columns
          </button>

          {showPicker && (
            <>
              {/* Click-away layer so the menu closes without needing a
                  document listener. */}
              <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
              <div className="absolute right-0 mt-1 z-20 w-52 card p-2 shadow-lg">
                {COLUMNS.map((c) => {
                  const on = visible.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleColumn(c.key)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 text-left"
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-brand-600 border-brand-600" : "border-slate-300"}`}>
                        {on && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <span className="text-xs text-slate-700">{c.label}</span>
                    </button>
                  );
                })}
                <p className="text-[10px] text-slate-400 px-2 pt-1.5">Campaign name always shows.</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2 font-medium">Campaign</th>
              {shownColumns.map((c) => {
                if (!c.value) {
                  return (
                    <th key={c.key} className="pb-2 font-medium">
                      {c.label}
                    </th>
                  );
                }
                const active = sortKey === c.key;
                return (
                  <th key={c.key} className="pb-2 font-medium">
                    <button
                      onClick={() => sortBy(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-slate-600 transition-colors ${active ? "text-slate-700" : ""}`}
                    >
                      {c.label}
                      {active &&
                        (descending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.id ?? `${row.headline}-${i}`} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2 font-medium text-slate-800">{row.headline}</td>
                {shownColumns.map((c) => (
                  <td key={c.key} className="py-2 pr-3 text-slate-700">
                    {c.render(row, ctx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
