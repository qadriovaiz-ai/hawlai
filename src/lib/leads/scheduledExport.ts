// "Send me my leads CSV every week" — without asking each time.
//
// Approved 2026-09-16:
//  - the email carries a sign-in download link, never the file — no phone
//    numbers or emails sit in an inbox where they can be forwarded;
//  - the full list every time, with how many leads are new since the last
//    export;
//  - to the business owner's login email only — whoever turns it on, and
//    however it's asked for, it can't be pointed at another address;
//  - weekly (Mondays) or monthly (the 1st), in the fast daily run at
//    8:30 AM IST.
//
// The link builds the CSV when it's clicked (lib/leads/exportLeads.ts), so
// the file is always current, and still needs the owner or an admin
// signed in.

import { fetchLeadsForExport } from "@/lib/leads/exportLeads";
import { ownerEmail } from "@/lib/email/sendDealerEmail";
import { sendViaResend, senderDisplayName } from "@/lib/email/resendClient";
import { siteUrl } from "@/lib/email/consent";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

export type ExportFrequency = "off" | "weekly" | "monthly";
export const EXPORT_FREQUENCIES: ExportFrequency[] = ["off", "weekly", "monthly"];

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toYmd: string): number {
  const fromYmd = indiaToday(new Date(fromIso));
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);
}

/**
 * Whether today (India) is an export day. Weekly: Mondays; monthly: the
 * 1st. Never twice in a day. A missed day (the run failed or didn't reach
 * this business) is caught up the next run rather than waiting a whole
 * extra week or month.
 */
export function isExportDue(frequency: ExportFrequency, lastSentAt: string | null, today: string): boolean {
  if (frequency === "off") return false;
  if (lastSentAt && daysBetween(lastSentAt, today) === 0) return false;
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (frequency === "weekly") return weekday === 1 || (lastSentAt !== null && daysBetween(lastSentAt, today) >= 8);
  return today.endsWith("-01") || (lastSentAt !== null && daysBetween(lastSentAt, today) >= 32);
}

/** The next export day, for telling the owner when the first one arrives. */
export function nextExportDay(frequency: ExportFrequency, today: string): string | null {
  if (frequency === "off") return null;
  for (let i = 1; i <= 31; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
    if (frequency === "weekly" ? new Date(`${d}T00:00:00Z`).getUTCDay() === 1 : d.endsWith("-01")) return d;
  }
  return null;
}

export function describeSchedule(frequency: ExportFrequency): string {
  return frequency === "weekly" ? "every Monday at 8:30 AM IST" : frequency === "monthly" ? "on the 1st of every month at 8:30 AM IST" : "off";
}

function prettyDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** The daily run's step: send this business's export if today is its day. */
export async function runScheduledLeadExport(service: any, dealershipId: string) {
  const { data: dealership, error } = await service
    .from("dealerships")
    .select("dealership_name, owner_id, lead_export_frequency, lead_export_last_sent_at")
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { error: `couldn't read the export setting: ${error.message}` };
  const frequency = (dealership?.lead_export_frequency ?? "off") as ExportFrequency;
  if (frequency === "off") return { skipped: "export off" };
  const today = indiaToday();
  const lastSentAt = dealership?.lead_export_last_sent_at ?? null;
  if (!isExportDue(frequency, lastSentAt, today)) return { skipped: "not due" };

  const log = async (row: Record<string, unknown>) => {
    const { error: logError } = await service.from("lead_export_log").insert({ dealership_id: dealershipId, frequency, ...row });
    if (logError) console.error("[lead-export] couldn't record the export:", logError.message);
  };

  const to = await ownerEmail(dealership?.owner_id);
  if (!to) {
    await log({ success: false, error: "the owner's email couldn't be read" });
    return { error: "the owner's email couldn't be read" };
  }

  let leads;
  try {
    leads = await fetchLeadsForExport(service, dealershipId, {});
  } catch (err: any) {
    await log({ recipient: to, success: false, error: err.message });
    return { error: err.message };
  }
  const since = lastSentAt ? Date.parse(lastSentAt) : Date.now() - (frequency === "weekly" ? 7 : 30) * DAY_MS;
  const newCount = leads.filter((l) => l.created_at && Date.parse(l.created_at) > since).length;
  const period = lastSentAt ? "since your last export" : frequency === "weekly" ? "this week" : "this month";

  const name = senderDisplayName(dealership?.dealership_name);
  const link = `${siteUrl()}/api/leads/export`;
  const subject = `Your ${frequency} leads export — ${leads.length} lead${leads.length === 1 ? "" : "s"}, ${newCount} new`;
  const body = [
    `Your ${frequency} leads export for ${name} is ready.`,
    `${leads.length} lead${leads.length === 1 ? "" : "s"} in total, ${newCount} new ${period}.`,
    `Download the CSV (sign in to Hawlai as the owner or an admin): ${link}`,
    "The file is built when you open the link, so it's always up to date. For privacy it isn't attached to this email.",
    "To stop these emails, turn off the scheduled export on the Autopilot page or ask Hawlai chat.",
  ].join("\n\n");

  const result = await sendViaResend(to, subject, body, "Hawlai");
  await log({
    recipient: to,
    row_count: leads.length,
    new_count: newCount,
    success: result.success,
    error: result.success ? null : result.error ?? "the email couldn't be sent",
    resend_message_id: result.resendMessageId ?? null,
  });
  if (!result.success) return { error: result.error ?? "the email couldn't be sent" };

  const { error: updateError } = await service.from("dealerships").update({ lead_export_last_sent_at: new Date().toISOString() }).eq("id", dealershipId);
  // Sent but not recorded would send it again tomorrow — say so rather than hide it.
  if (updateError) return { error: `sent, but couldn't record it — tomorrow's run may send it again: ${updateError.message}` };
  return { sent: true, rows: leads.length, newRows: newCount };
}

export type ExportHealth = {
  subsystem: "lead_export";
  kind: "export";
  state: "ok" | "failing" | "off" | "idle";
  note: string;
  lastSuccess: boolean | null;
  lastRunAt: string | null;
};

/** The health card's row: the last export and how it went, or when the first one comes. */
export function buildExportHealth(opts: {
  frequency: ExportFrequency;
  latest: { created_at: string; success: boolean; error: string | null; row_count: number | null; new_count: number | null } | null;
  lastRun: { created_at: string; success: boolean; detail: string | null } | null;
  today?: string;
}): ExportHealth {
  const today = opts.today ?? indiaToday();
  const base = { subsystem: "lead_export" as const, kind: "export" as const, lastRunAt: opts.latest?.created_at ?? opts.lastRun?.created_at ?? null };
  if (opts.frequency === "off") return { ...base, state: "off", note: "Off — no scheduled leads export", lastSuccess: null };
  if (opts.lastRun && !opts.lastRun.success) {
    return { ...base, state: "failing", note: `The last run failed: ${String(opts.lastRun.detail ?? "").slice(0, 160)}`, lastSuccess: false };
  }
  const l = opts.latest;
  if (l && !l.success) return { ...base, state: "failing", note: `The last export failed: ${l.error ?? "unknown error"}`, lastSuccess: false };
  if (l) {
    const day = new Date(Date.parse(l.created_at) + 5.5 * 3600_000).toISOString().slice(0, 10);
    return { ...base, state: "ok", note: `Last sent ${prettyDay(day)} · ${l.row_count ?? 0} leads, ${l.new_count ?? 0} new (${opts.frequency})`, lastSuccess: true };
  }
  const next = nextExportDay(opts.frequency, today);
  const dueToday = isExportDue(opts.frequency, null, today);
  return { ...base, state: "idle", note: `On (${opts.frequency}) — first export ${dueToday ? "today" : next ? prettyDay(next) : "soon"}`, lastSuccess: null };
}
