// A business's leads as a CSV — for the owner's own records.
//
// WHY: asked to "export leads as CSV", chat told the owner to use the
// dashboard. There was no leads export anywhere in the dashboard; the only
// CSV in the app is the Retargeting audience file, which is hashed for Meta
// and has no names in it.
//
// One module, used by every way out: the download route (which chat links
// to, and the Leads page button uses) and the scheduled export. Decisions
// approved 2026-09-16:
//  - owner and admins only;
//  - do-not-contact and unsubscribed leads INCLUDED, flagged in their own
//    columns — this is the owner's record, not an outreach list;
//  - delivered as a signed-in download, never a public file.

import { createServiceClient } from "@/lib/supabase/service";

export type LeadExportFilters = {
  status?: string;
  temperature?: "hot" | "warm" | "cold";
  source?: string;
  /** YYYY-MM-DD, inclusive, by created date. */
  from?: string;
  to?: string;
  /** Only leads that have an email address. */
  hasEmail?: boolean;
};

const SLUG = /^[a-z0-9_]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filters from a query string or a chat tool's input — anything malformed is dropped, never passed to a query. */
export function cleanFilters(input: Record<string, unknown> | URLSearchParams): LeadExportFilters {
  const get = (k: string) => (input instanceof URLSearchParams ? input.get(k) : (input as any)?.[k]);
  const f: LeadExportFilters = {};
  const status = String(get("status") ?? "").trim().toLowerCase();
  if (SLUG.test(status) && status !== "all") f.status = status;
  const temperature = String(get("temperature") ?? "").trim().toLowerCase();
  if (temperature === "hot" || temperature === "warm" || temperature === "cold") f.temperature = temperature;
  const source = String(get("source") ?? "").trim().toLowerCase();
  if (SLUG.test(source) && source !== "all") f.source = source;
  const from = String(get("from") ?? "").trim();
  if (DAY.test(from)) f.from = from;
  const to = String(get("to") ?? "").trim();
  if (DAY.test(to)) f.to = to;
  const hasEmail = get("hasEmail");
  if (hasEmail === true || hasEmail === "true" || hasEmail === "1") f.hasEmail = true;
  return f;
}

export function filtersToQuery(f: LeadExportFilters): string {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.temperature) q.set("temperature", f.temperature);
  if (f.source) q.set("source", f.source);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.hasEmail) q.set("hasEmail", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function describeFilters(f: LeadExportFilters): string {
  const parts: string[] = [];
  if (f.temperature) parts.push(`${f.temperature} leads`);
  if (f.status) parts.push(`status "${f.status.replace(/_/g, " ")}"`);
  if (f.source) parts.push(`from ${f.source.replace(/_/g, " ")}`);
  if (f.from && f.to) parts.push(`created ${f.from} to ${f.to}`);
  else if (f.from) parts.push(`created from ${f.from}`);
  else if (f.to) parts.push(`created up to ${f.to}`);
  if (f.hasEmail) parts.push("with an email address");
  return parts.length ? parts.join(", ") : "all leads";
}

export type ExportRole = "owner" | "admin";

/**
 * Whether this signed-in person may export this business's leads: its
 * owner, or an active admin of it. Read with the service client — this is
 * the authorisation decision, so it mustn't depend on what RLS happens to
 * show the person's own session.
 */
export async function exportRole(dealershipId: string, userId: string | null | undefined): Promise<ExportRole | null> {
  if (!userId) return null;
  const service = createServiceClient();
  const { data: dealership, error } = await service.from("dealerships").select("owner_id").eq("id", dealershipId).maybeSingle();
  if (error) throw new Error(`couldn't check who owns this business: ${error.message}`);
  if (dealership?.owner_id === userId) return "owner";
  const { data: member, error: memberError } = await service
    .from("team_members")
    .select("role")
    .eq("dealership_id", dealershipId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) throw new Error(`couldn't check team access: ${memberError.message}`);
  return member?.role === "admin" ? "admin" : null;
}

export const NOT_ALLOWED = "Only the business owner or an admin can export leads.";

export type ExportLead = {
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
  lead_temperature: string | null;
  ai_score: number | null;
  created_at: string | null;
  consent_status: string | null;
  consent_source: string | null;
  dnd_opt_out: boolean | null;
};

const LEAD_COLUMNS = "name, phone, email, source, status, lead_temperature, ai_score, created_at, consent_status, consent_source, dnd_opt_out";
const PAGE = 1000;

/** Every lead matching the filters, oldest first, read a page at a time — Supabase returns at most 1,000 rows per request. */
export async function fetchLeadsForExport(supabase: any, dealershipId: string, f: LeadExportFilters): Promise<ExportLead[]> {
  const all: ExportLead[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from("leads").select(LEAD_COLUMNS).eq("dealership_id", dealershipId);
    if (f.status) q = q.eq("status", f.status);
    if (f.temperature) q = q.eq("lead_temperature", f.temperature);
    if (f.source) q = q.eq("source", f.source);
    if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+05:30`);
    if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999+05:30`);
    if (f.hasEmail) q = q.not("email", "is", null);
    const { data, error } = await q.order("created_at", { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`couldn't read leads: ${error.message}`);
    all.push(...((data ?? []) as ExportLead[]));
    if (!data || data.length < PAGE) return all;
  }
}

/** Addresses this business may not send marketing email to — shown in the export, never used to hide a lead. */
export async function unsubscribedEmails(dealershipId: string): Promise<Set<string>> {
  const service = createServiceClient();
  const out = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await service.from("email_suppressions").select("email").eq("dealership_id", dealershipId).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`couldn't read the unsubscribe list: ${error.message}`);
    for (const r of data ?? []) out.add(String(r.email).toLowerCase());
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * One spreadsheet cell.
 *
 * A cell a spreadsheet would run as a formula (=, +, -, @ at the start —
 * a lead can type anything into a form) is prefixed with ' so it opens as
 * text. A plain phone number like +91 98765 43210 is left alone.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  const looksLikeNumber = /^[+-]?[\d\s().-]+$/.test(s);
  if (/^[=+\-@\t\r]/.test(s) && !looksLikeNumber) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADERS = ["Name", "Phone", "Email", "Source", "Status", "Temperature", "Score", "Created (IST)", "Consent", "Consent source", "Do not contact", "Unsubscribed from email"];

function istDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** The file: a byte-order mark so Excel reads Hindi names correctly, a header row, CRLF line ends. */
export function leadsToCsv(leads: ExportLead[], unsubscribed: Set<string>): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const l of leads) {
    const email = (l.email ?? "").trim();
    lines.push(
      [
        l.name,
        l.phone,
        email,
        l.source,
        l.status,
        l.lead_temperature,
        l.ai_score,
        istDateTime(l.created_at),
        l.consent_status,
        l.consent_source,
        l.dnd_opt_out ? "Yes" : "No",
        email && unsubscribed.has(email.toLowerCase()) ? "Yes" : "No",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function exportFilename(businessName: string | null | undefined, today: string): string {
  const slug = String(businessName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hawlai";
  return `${slug}-leads-${today}.csv`;
}
