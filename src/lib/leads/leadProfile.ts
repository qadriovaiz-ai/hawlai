// What a lead looks like for THIS business: what the "interest" field is
// called, which extra details it asks for, and what each pipeline stage is
// called. One preset per business model (lib/business/businessModel.ts).
//
// WHY (approved 2026-09-17, industry-agnostic overhaul Phase 1): leads were
// built for a car dealership — "Vehicle", "Purchase Year", "Ready to Call",
// "Appointment Set" — on every screen, for every business.
//
// DECISIONS:
//  - Fixed presets per business model, editable later.
//  - Stages are presets MAPPED TO FIXED MEANINGS. The stored stage values
//    don't change (leads.status: new, ready_to_call, called,
//    appointment_set, converted, not_interested), because automations,
//    attribution and at-risk checks rely on what each one means. Only
//    what each is CALLED changes by business.

import { BUSINESS_MODELS as BUSINESS_ORDER, effectiveBusinessModels, type BusinessModel } from "@/lib/business/businessModel";

export const STAGES = ["new", "ready_to_call", "called", "appointment_set", "converted", "not_interested"] as const;
export type Stage = (typeof STAGES)[number];

/** What each stored stage means — the part code relies on. */
export const STAGE_MEANING: Record<Stage, "open" | "queued" | "contacted" | "booked" | "won" | "lost"> = {
  new: "open",
  ready_to_call: "queued",
  called: "contacted",
  appointment_set: "booked",
  converted: "won",
  not_interested: "lost",
};

export type LeadField = {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  /** Stored in its own leads column instead of `details`. */
  column?: "budget";
};

export type LeadProfile = {
  key: "general" | BusinessModel;
  /** The business models this profile was built for (all of them, not just the one whose labels won). */
  models: BusinessModel[];
  interestLabel: string;
  stages: Record<Stage, string>;
  fields: LeadField[];
  /** What a won lead is called: "customer", "client", "subscriber". */
  wonNoun: string;
};

const BUDGET: LeadField = { key: "budget", label: "Budget", type: "number", column: "budget" };

export const LEAD_PROFILES: Record<LeadProfile["key"], LeadProfile> = {
  general: {
    key: "general",
    models: [],
    interestLabel: "Interest",
    stages: { new: "New", ready_to_call: "Queued for a call", called: "Contacted", appointment_set: "Appointment booked", converted: "Converted", not_interested: "Not interested" },
    fields: [BUDGET],
    wonNoun: "customer",
  },
  products: {
    key: "products",
    models: ["products"],
    interestLabel: "Product interest",
    stages: { new: "New", ready_to_call: "Queued for a call", called: "Contacted", appointment_set: "Visit booked", converted: "Purchased", not_interested: "Not interested" },
    fields: [BUDGET],
    wonNoun: "customer",
  },
  services: {
    key: "services",
    models: ["services"],
    interestLabel: "Service interest",
    stages: { new: "New", ready_to_call: "Queued for a call", called: "Contacted", appointment_set: "Appointment booked", converted: "Became a client", not_interested: "Not interested" },
    fields: [{ key: "preferred_date", label: "Preferred date", type: "date" }, BUDGET],
    wonNoun: "client",
  },
  subscription: {
    key: "subscription",
    models: ["subscription"],
    interestLabel: "Plan interest",
    stages: { new: "New", ready_to_call: "Queued for a call", called: "Contacted", appointment_set: "Trial or demo booked", converted: "Subscribed", not_interested: "Not interested" },
    fields: [{ key: "current_solution", label: "Currently using", type: "text" }],
    wonNoun: "subscriber",
  },
  b2b: {
    key: "b2b",
    models: ["b2b"],
    interestLabel: "Requirement",
    stages: { new: "New", ready_to_call: "Queued for a call", called: "Contacted", appointment_set: "Meeting booked", converted: "Deal won", not_interested: "Lost" },
    fields: [
      { key: "company", label: "Company", type: "text" },
      { key: "job_title", label: "Job title", type: "text" },
      { key: "company_size", label: "Company size", type: "text" },
      BUDGET,
    ],
    wonNoun: "client",
  },
};

/** Which model's labels win when a business has several: the one whose sales process is most specific. */
const PRECEDENCE: BusinessModel[] = ["b2b", "subscription", "services", "products"];

/** The profile for a business: the most specific model's labels, and the extra details of every model it has. */
export function leadProfileFor(models: BusinessModel[] | null | undefined): LeadProfile {
  const list = models ?? [];
  const primary = PRECEDENCE.find((m) => list.includes(m));
  const base = LEAD_PROFILES[primary ?? "general"];
  const fields: LeadField[] = [];
  for (const m of [primary, ...PRECEDENCE.filter((x) => x !== primary && list.includes(x))]) {
    for (const f of LEAD_PROFILES[m ?? "general"].fields) if (!fields.some((x) => x.key === f.key)) fields.push(f);
  }
  return { ...base, models: BUSINESS_ORDER.filter((m) => list.includes(m)), fields };
}

/** A business's models: what it declared, else a guess from its catalogue. */
export async function loadBusinessModels(supabase: any, dealershipId: string): Promise<BusinessModel[]> {
  const [{ data: dealership }, { data: items }] = await Promise.all([
    supabase.from("dealerships").select("business_models").eq("id", dealershipId).maybeSingle(),
    supabase.from("products").select("kind").eq("dealership_id", dealershipId).eq("is_active", true).limit(500),
  ]);
  const list: { kind?: string | null }[] = items ?? [];
  return effectiveBusinessModels(dealership?.business_models, {
    productCount: list.filter((i) => i.kind !== "service").length,
    serviceCount: list.filter((i) => i.kind === "service").length,
  }).models;
}

/** The lead profile for a business. Falls back to the general profile if the lookup fails. */
export async function loadLeadProfile(supabase: any, dealershipId: string): Promise<LeadProfile> {
  try {
    return leadProfileFor(await loadBusinessModels(supabase, dealershipId));
  } catch {
    return LEAD_PROFILES.general;
  }
}

/** A stage's name for this business; unknown values are shown readably rather than hidden. */
export function stageLabel(profile: Pick<LeadProfile, "stages">, status: string): string {
  return (profile.stages as Record<string, string>)[status] ?? status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** What the lead wants. Records from before migration 187 have it in `vehicle`. */
export function leadInterest(lead: { interest?: string | null; vehicle?: string | null }): string | null {
  const v = (lead.interest ?? lead.vehicle ?? "").trim();
  return v || null;
}

/** A lead's details as one line for an AI prompt: "Company: Acme; Preferred date: 2 Oct". */
export function detailsForPrompt(details: Record<string, unknown> | null | undefined): string {
  return Object.entries(details ?? {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .slice(0, 8)
    .map(([k, v]) => `${humanise(k)}: ${String(v).slice(0, 80)}`)
    .join("; ");
}

function humanise(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : key;
}

/**
 * A lead's details to show: the profile's fields first (in order), then
 * anything else the lead came in with — a Meta form's own questions, or an
 * older record's purchase year — under a readable label.
 */
export function describeLeadDetails(lead: { budget?: number | null; details?: Record<string, unknown> | null }, profile: LeadProfile): { label: string; value: string }[] {
  const details = (lead.details ?? {}) as Record<string, unknown>;
  const out: { label: string; value: string }[] = [];
  const shown = new Set<string>();
  for (const f of profile.fields) {
    const raw = f.column === "budget" ? lead.budget : details[f.key];
    shown.add(f.key);
    if (raw === null || raw === undefined || raw === "") continue;
    out.push({ label: f.label, value: f.type === "number" && typeof raw === "number" ? `₹${raw.toLocaleString("en-IN")}` : String(raw) });
  }
  for (const [k, v] of Object.entries(details)) {
    if (shown.has(k) || v === null || v === undefined || v === "") continue;
    out.push({ label: humanise(k), value: String(v) });
  }
  return out;
}
