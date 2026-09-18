// Where this business actually leaks — computed from its own tables,
// never estimated by a model.
//
// WHY (approved 2026-09-18, Advanced Strategy steps 1-2): the strategy
// tools had the catalogue, offers, season and voice, but none of the
// funnel. Channel advice couldn't be tied to where a business really loses
// people, so it read the same for every business in a category.
//
// THE RULE: every number here is counted in code and shown as-is. The AI
// (./channelAdvice.ts) only interprets numbers it is handed, and a check
// afterwards rejects any figure it quotes that isn't one of these. Where
// data is thin, THIS file decides that ("too few to judge") — the model
// doesn't get to.

import { leadProfileFor, loadBusinessModels, type Stage } from "@/lib/leads/leadProfile";
import { fetchAllHistory, rangeTotals, addDays } from "@/lib/analytics/campaignHistory";
import { AT_RISK_DAYS, getCustomerRiskList } from "@/lib/agents/churnAgent";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import { PAID_ORDER_STATUSES } from "@/lib/claims/businessFacts";
import type { BusinessModel } from "@/lib/business/businessModel";

export const WINDOW_DAYS = 90;
/** A step needs this many people entering it before it can be called the weakest. */
export const MIN_STEP_ENTRY = 10;
/** A source needs this many leads before its conversion is ranked. */
export const MIN_SOURCE_LEADS = 5;

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Share of the previous step that reached this one, 0-100; null for the first step or an empty previous step. */
  fromPrevious: number | null;
};

export type Funnel = {
  name: string;
  steps: FunnelStep[];
  /** The step with the lowest pass-through among those with enough people entering it. */
  weakest: { from: string; to: string; rate: number; entered: number } | null;
  /** Said when no step has enough traffic to judge. */
  thin: string | null;
};

export type SourceRow = {
  source: string;
  leads: number;
  won: number;
  /** won ÷ leads, 0-100. Null when too few leads to judge. */
  conversion: number | null;
  ranked: boolean;
};

export type PaidRow = { campaign: string; spend: number; leads: number; costPerLead: number | null };

export type Diagnosis = {
  window: { days: number; from: string; to: string; label: string };
  models: BusinessModel[];
  funnels: Funnel[];
  sources: SourceRow[];
  sourcesThin: string | null;
  atRisk: { count: number; total: number; names: string[] };
  paid: PaidRow[] | null;
  /** Everything the channel advice needs to say it can't judge. */
  gaps: string[];
};

export type DiagnosisInput = {
  models: BusinessModel[];
  from: string;
  to: string;
  businessStart: string | null;
  events: { event_type: string }[];
  leads: { id: string; source: string | null; status: string | null }[];
  firstTouch: Record<string, string>;
  orders: { status: string | null }[];
  abandonedCarts: number;
  atRisk: { name: string; daysSince: number }[];
  paid: PaidRow[] | null;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const CONTACTED: Stage[] = ["called", "appointment_set", "converted"];
const BOOKED: Stage[] = ["appointment_set", "converted"];

function funnelOf(name: string, steps: { key: string; label: string; count: number }[]): Funnel {
  const out: FunnelStep[] = steps.map((s, i) => ({
    ...s,
    fromPrevious: i === 0 ? null : pct(s.count, steps[i - 1].count),
  }));
  let weakest: Funnel["weakest"] = null;
  for (let i = 1; i < out.length; i++) {
    const entered = out[i - 1].count;
    const rate = out[i].fromPrevious;
    if (entered < MIN_STEP_ENTRY || rate === null) continue;
    if (!weakest || rate < weakest.rate) weakest = { from: out[i - 1].label, to: out[i].label, rate, entered };
  }
  const thin = weakest ? null : `Not enough traffic yet to name a weakest step — no step has had ${MIN_STEP_ENTRY} or more people reach it in this window.`;
  return { name, steps: out, weakest, thin };
}

/** The label a lead source is shown under. */
export function sourceLabel(source: string | null | undefined): string {
  const s = String(source ?? "").trim();
  if (!s) return "Unknown";
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Pure: the diagnosis from already-counted inputs. Everything testable lives here. */
export function buildDiagnosis(input: DiagnosisInput): Diagnosis {
  const profile = leadProfileFor(input.models);
  const views = input.events.filter((e) => e.event_type === "view").length;
  const leads = input.leads;
  const contacted = leads.filter((l) => CONTACTED.includes(l.status as Stage)).length;
  const booked = leads.filter((l) => BOOKED.includes(l.status as Stage)).length;
  const won = leads.filter((l) => l.status === "converted").length;

  const funnels: Funnel[] = [
    funnelOf("From visit to customer", [
      { key: "views", label: "Site visits", count: views },
      { key: "leads", label: "Leads", count: leads.length },
      { key: "contacted", label: profile.stages.called, count: contacted },
      { key: "booked", label: profile.stages.appointment_set, count: booked },
      { key: "won", label: profile.stages.converted, count: won },
    ]),
  ];
  // A store's own funnel, when it sells physical products online.
  const paidOrders = input.orders.filter((o) => PAID_ORDER_STATUSES.has(String(o.status))).length;
  if (input.models.includes("products") || paidOrders > 0 || input.abandonedCarts > 0) {
    funnels.push(
      funnelOf("Online store", [
        { key: "views", label: "Site visits", count: views },
        { key: "checkouts", label: "Checkouts started", count: paidOrders + input.abandonedCarts },
        { key: "paid", label: "Paid orders", count: paidOrders },
      ])
    );
  }

  // Sources: what the lead says, else where it was first seen.
  const bySource = new Map<string, { leads: number; won: number }>();
  for (const l of leads) {
    const key = sourceLabel(l.source || input.firstTouch[l.id]);
    const row = bySource.get(key) ?? { leads: 0, won: 0 };
    row.leads++;
    if (l.status === "converted") row.won++;
    bySource.set(key, row);
  }
  const sources: SourceRow[] = [...bySource.entries()]
    .map(([source, r]) => {
      const ranked = r.leads >= MIN_SOURCE_LEADS;
      return { source, leads: r.leads, won: r.won, conversion: ranked ? pct(r.won, r.leads) : null, ranked };
    })
    .sort((a, b) => (a.ranked === b.ranked ? (b.conversion ?? -1) - (a.conversion ?? -1) || b.leads - a.leads : a.ranked ? -1 : 1));
  const rankedCount = sources.filter((s) => s.ranked).length;
  const sourcesThin =
    leads.length === 0
      ? "No leads in this window, so there's nothing to rank sources by yet."
      : rankedCount < 2
        ? `Too few leads per source to compare them — a source needs ${MIN_SOURCE_LEADS} or more leads before its conversion means anything.`
        : null;

  const atRiskRows = input.atRisk.filter((c) => c.daysSince >= AT_RISK_DAYS);
  const gaps: string[] = [];
  for (const f of funnels) if (f.thin) gaps.push(`${f.name}: ${f.thin}`);
  if (sourcesThin) gaps.push(`Lead sources: ${sourcesThin}`);
  if (input.paid === null) gaps.push("Paid ads: Hawlai has no ad performance history for this window, so there's no cost per lead to compare.");

  const young = input.businessStart && input.businessStart > input.from;
  return {
    window: {
      days: WINDOW_DAYS,
      from: input.from,
      to: input.to,
      label: young ? `since you joined (${input.businessStart})` : `the last ${WINDOW_DAYS} days`,
    },
    models: input.models,
    funnels,
    sources,
    sourcesThin,
    atRisk: { count: atRiskRows.length, total: input.atRisk.length, names: atRiskRows.slice(0, 5).map((c) => c.name) },
    paid: input.paid,
    gaps,
  };
}

/** Loads the business's own rows for the window and builds the diagnosis. */
export async function loadDiagnosis(supabase: any, dealershipId: string, today = indiaToday()): Promise<Diagnosis> {
  const to = today;
  const from = addDays(today, -WINDOW_DAYS);
  const since = `${from}T00:00:00+05:30`;

  const [models, { data: dealership }, { data: events }, { data: leadRows }, { data: orders }, { data: carts }] = await Promise.all([
    loadBusinessModels(supabase, dealershipId).catch(() => [] as BusinessModel[]),
    supabase.from("dealerships").select("created_at").eq("id", dealershipId).maybeSingle(),
    supabase.from("page_events").select("event_type").eq("dealership_id", dealershipId).gte("created_at", since),
    supabase.from("leads").select("id, source, status").eq("dealership_id", dealershipId).gte("created_at", since),
    supabase.from("orders").select("status").eq("dealership_id", dealershipId).gte("created_at", since),
    supabase.from("abandoned_carts").select("id").eq("dealership_id", dealershipId).gte("created_at", since),
  ]);

  const leads = (leadRows ?? []) as DiagnosisInput["leads"];
  const firstTouch: Record<string, string> = {};
  if (leads.length) {
    const { data: touches } = await supabase
      .from("lead_touchpoints")
      .select("lead_id, channel, occurred_at")
      .eq("dealership_id", dealershipId)
      .in("lead_id", leads.map((l) => l.id))
      .order("occurred_at", { ascending: true });
    for (const t of touches ?? []) if (!firstTouch[t.lead_id]) firstTouch[t.lead_id] = t.channel;
  }

  // Ad spend and leads IN this window: the history holds running totals,
  // and rangeTotals turns them into what happened between two dates.
  let paid: PaidRow[] | null = null;
  const history = await fetchAllHistory(supabase, dealershipId).catch(() => ({ data: null }));
  if (history.data && history.data.length) {
    paid = rangeTotals(history.data, from, to)
      .filter((c) => c.totals.spend > 0 || c.totals.leads > 0)
      .map((c) => ({
        campaign: c.headline,
        spend: Math.round(c.totals.spend),
        leads: c.totals.leads,
        costPerLead: c.totals.leads > 0 ? Math.round(c.totals.spend / c.totals.leads) : null,
      }));
    if (!paid.length) paid = null;
  }

  const atRisk = await getCustomerRiskList(supabase, dealershipId).catch(() => []);
  const created = dealership?.created_at ? String(dealership.created_at).slice(0, 10) : null;

  return buildDiagnosis({
    models,
    from,
    to,
    businessStart: created,
    events: events ?? [],
    leads,
    firstTouch,
    orders: orders ?? [],
    abandonedCarts: (carts ?? []).length,
    atRisk: atRisk.map((c: { name: string; daysSince: number }) => ({ name: c.name, daysSince: c.daysSince })),
    paid,
  });
}

/** The diagnosis as the numbered facts the channel advice is written from. */
export function formatDiagnosisForPrompt(d: Diagnosis): string {
  const lines: string[] = [`MEASURED DIAGNOSIS — ${d.window.label} (${d.window.from} to ${d.window.to}). These are the ONLY numbers you may use.`];
  for (const f of d.funnels) {
    lines.push(`${f.name}: ${f.steps.map((s) => `${s.label} ${s.count}${s.fromPrevious !== null ? ` (${s.fromPrevious}% of previous)` : ""}`).join(" → ")}`);
    lines.push(f.weakest ? `  Weakest step: ${f.weakest.from} → ${f.weakest.to}, ${f.weakest.rate}% of ${f.weakest.entered}.` : `  ${f.thin}`);
  }
  if (d.sources.length) {
    lines.push("Lead sources (ranked by conversion, not volume):");
    for (const s of d.sources) lines.push(`  ${s.source}: ${s.leads} leads, ${s.won} won${s.ranked ? `, ${s.conversion}% conversion` : " — too few to judge"}`);
  }
  if (d.sourcesThin) lines.push(`  ${d.sourcesThin}`);
  lines.push(`At-risk customers (no contact in ${AT_RISK_DAYS}+ days): ${d.atRisk.count} of ${d.atRisk.total} customers.`);
  if (d.paid) {
    lines.push("Paid ads in this window:");
    for (const p of d.paid) lines.push(`  "${p.campaign}": ₹${p.spend} spent, ${p.leads} leads${p.costPerLead !== null ? `, ₹${p.costPerLead} per lead` : ""}`);
  }
  if (d.gaps.length) lines.push(`Not enough data to judge: ${d.gaps.join(" ")}`);
  return lines.join("\n");
}

/** Every figure the diagnosis contains — the only numbers advice may quote. */
export function diagnosisNumbers(d: Diagnosis): Set<string> {
  const out = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return;
    out.add(String(n));
    out.add(String(Math.round(n)));
  };
  add(d.window.days);
  add(AT_RISK_DAYS);
  add(MIN_STEP_ENTRY);
  add(MIN_SOURCE_LEADS);
  for (const f of d.funnels) for (const s of f.steps) { add(s.count); add(s.fromPrevious); }
  for (const f of d.funnels) if (f.weakest) { add(f.weakest.rate); add(f.weakest.entered); }
  for (const s of d.sources) { add(s.leads); add(s.won); add(s.conversion); }
  add(d.atRisk.count);
  add(d.atRisk.total);
  for (const p of d.paid ?? []) { add(p.spend); add(p.leads); add(p.costPerLead); }
  return out;
}
