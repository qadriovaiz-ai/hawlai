// A new lead's answers — from a Meta lead form, a website form, a CSV row
// or a call — turned into one shape, and scored the same way everywhere.
//
// WHY (approved 2026-09-17, industry-agnostic overhaul Phase 1):
//  - Meta lead forms were read for vehicle_type / car_model and nothing
//    else, so a clinic's "Which treatment?" or a B2B form's "Company size"
//    answer was dropped.
//  - Every new lead was scored on vehicle age and budget (ai-engine
//    qualifyLead): a lead for anything but a vehicle was scored on its
//    phone number alone.
//
// Scoring (decision: one generic core + one signal specific to the
// business model): how reachable the lead is, whether they said what they
// want, how they came in, whether they gave a budget — plus, for a B2B
// business, a company; for services, a preferred date; for subscriptions,
// what they use today.

import type { BusinessModel } from "@/lib/business/businessModel";

export type LeadAnswers = {
  name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  budget: number | null;
  /** Everything else the lead told us, by key. */
  details: Record<string, string>;
};

const NAME_KEYS = /^(full_?name|name|your_?name)$/;
const FIRST_KEYS = /^first_?name$/;
const LAST_KEYS = /^last_?name$/;
const PHONE_KEYS = /^(phone(_?number)?|mobile(_?number)?|whatsapp(_?number)?|contact_?number)$/;
const EMAIL_KEYS = /^(e_?mail|email_?address)$/;
const BUDGET_KEYS = /budget/;
// What they want, whatever the form called it. Includes the old car-form
// names so existing Meta forms keep working.
// Matched on whole words of the key, so "when_are_you_planning" isn't a plan.
const INTEREST_KEYS = /(^|_)(interest|interested|looking|requirement|requirements|service|services|product|products|treatment|course|plan|package|model|vehicle|enquiry|inquiry)(_|$)/;
const DETAIL_ALIASES: [RegExp, string][] = [
  [/^(company(_?name)?|organi[sz]ation|business_?name|firm)$/, "company"],
  [/^(job_?title|designation|role|position)$/, "job_title"],
  [/^(company_?size|team_?size|employees|number_of_employees|no_of_employees)$/, "company_size"],
  [/^(preferred|appointment|booking)_?(date|time|slot|date_?time)$/, "preferred_date"],
  [/^(current_?(solution|provider|tool|plan)|currently_?using)$/, "current_solution"],
  [/^(purchase_?year)$/, "purchase_year"],
];

export function normaliseKey(key: string): string {
  return String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseBudget(v: string): number | null {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Any set of form answers (key → value) as a lead. Nothing the lead said is dropped. */
export function mapLeadAnswers(raw: Record<string, unknown>): LeadAnswers {
  const out: LeadAnswers = { name: null, phone: null, email: null, interest: null, budget: null, details: {} };
  let first = "";
  let last = "";
  for (const [rawKey, rawValue] of Object.entries(raw ?? {})) {
    const value = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
    if (!value) continue;
    const key = normaliseKey(rawKey);
    if (!key) continue;
    if (NAME_KEYS.test(key)) out.name ??= value;
    else if (FIRST_KEYS.test(key)) first = value;
    else if (LAST_KEYS.test(key)) last = value;
    else if (PHONE_KEYS.test(key)) out.phone ??= value;
    else if (EMAIL_KEYS.test(key)) out.email ??= value;
    else if (BUDGET_KEYS.test(key)) out.budget ??= parseBudget(value);
    else {
      const alias = DETAIL_ALIASES.find(([re]) => re.test(key));
      if (alias) out.details[alias[1]] = value;
      else if (!out.interest && INTEREST_KEYS.test(key)) out.interest = value;
      else out.details[key] = value;
    }
  }
  if (!out.name && (first || last)) out.name = `${first} ${last}`.trim();
  return out;
}

const HIGH_INTENT_SOURCES = new Set(["website", "landing_page", "booking_page", "meta_ads_paid", "whatsapp", "instagram", "inbound_call", "hawlai_shop"]);
const LOW_INTENT_SOURCES = new Set(["csv_upload", "manual", "manual_chat", "legacy_fallback"]);

export type LeadScore = { score: number; temperature: "hot" | "warm" | "cold"; reason: string };

export function scoreNewLead(lead: Pick<LeadAnswers, "phone" | "email" | "interest" | "budget" | "details"> & { source?: string | null }, models: BusinessModel[] | null | undefined): LeadScore {
  let score = 0;
  const reasons: string[] = [];

  const phoneDigits = String(lead.phone ?? "").replace(/\D/g, "");
  const hasPhone = phoneDigits.length >= 10;
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(lead.email ?? ""));
  if (hasPhone) score += 25;
  if (hasEmail) score += 15;
  if (hasPhone && hasEmail) reasons.push("reachable by phone and email");
  else if (hasPhone) reasons.push("reachable by phone");
  else if (hasEmail) reasons.push("reachable by email");
  else reasons.push("no way to reach them yet");

  if (lead.interest && lead.interest.trim()) {
    score += 20;
    reasons.push(`said what they want (${lead.interest.trim().slice(0, 40)})`);
  }

  const source = String(lead.source ?? "");
  if (HIGH_INTENT_SOURCES.has(source)) {
    score += 15;
    reasons.push("reached out themselves");
  } else if (LOW_INTENT_SOURCES.has(source)) {
    score += 5;
  } else {
    score += 10;
  }

  if (lead.budget && lead.budget > 0) {
    score += 10;
    reasons.push("gave a budget");
  }

  // The one signal specific to how this business sells.
  const d = lead.details ?? {};
  const list = models ?? [];
  if (list.includes("b2b") && (d.company || d.company_size)) {
    score += 15;
    reasons.push("named their company");
  } else if (list.includes("services") && d.preferred_date) {
    score += 10;
    reasons.push("gave a preferred date");
  } else if (list.includes("subscription") && d.current_solution) {
    score += 10;
    reasons.push("said what they use today");
  }

  score = Math.min(100, score);
  const temperature = score >= 70 ? "hot" : score >= 45 ? "warm" : "cold";
  return { score, temperature, reason: `${reasons.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()) };
}
