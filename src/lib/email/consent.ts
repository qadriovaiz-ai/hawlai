// Who a business may send marketing email to, and the unsubscribe that
// takes them off that list for good.
//
// Rules approved 2026-09-14: email only people who gave the business
// their email (a lead, a customer who ordered, a team member); never
// anyone on the suppression list; every marketing email carries a
// working unsubscribe. The suppression list and tokens are read and
// written with the service client — a team member using chat must hit
// the same list the owner would, whatever RLS shows their session.

import { randomBytes } from "node:crypto";

export type RecipientKind = "team" | "lead" | "customer";

export function normaliseEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** An exact, case-insensitive match for ilike — % and _ in an address are literal, not wildcards. */
function exactIlike(email: string): string {
  return normaliseEmail(email).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * How this business knows the address: a team member, a lead, or a
 * customer who ordered. Null when it's none of them — then it isn't on
 * record and gets no marketing email.
 */
export async function recipientOnRecord(supabase: any, dealershipId: string, email: string): Promise<RecipientKind | null> {
  const pattern = exactIlike(email);
  if (!pattern.includes("@")) return null;
  const checks: [RecipientKind, any][] = [
    ["team", supabase.from("team_members").select("id").eq("dealership_id", dealershipId).eq("status", "active").ilike("email", pattern).limit(1)],
    ["lead", supabase.from("leads").select("id").eq("dealership_id", dealershipId).ilike("email", pattern).limit(1)],
    ["customer", supabase.from("orders").select("id").eq("dealership_id", dealershipId).ilike("customer_email", pattern).limit(1)],
  ];
  for (const [kind, query] of checks) {
    const { data, error } = await query;
    if (error) throw new Error(`couldn't check ${kind === "team" ? "the team" : `${kind}s`}: ${error.message}`);
    if (data?.length) return kind;
  }
  return null;
}

/** Whether marketing email to this address is blocked. Throws when the list can't be read — never "not suppressed" by default. */
export async function isSuppressed(service: any, dealershipId: string, email: string): Promise<boolean> {
  const { data, error } = await service
    .from("email_suppressions")
    .select("id")
    .eq("dealership_id", dealershipId)
    .eq("email", normaliseEmail(email))
    .maybeSingle();
  if (error) throw new Error(`couldn't read the unsubscribe list: ${error.message}`);
  return Boolean(data);
}

/**
 * Takes an address off this business's marketing list: a suppression
 * row, and every lead with that email marked do-not-contact so calls,
 * automation and chat all respect it too.
 */
export async function suppressEmail(
  service: any,
  dealershipId: string,
  email: string,
  reason: "unsubscribed" | "bounced" | "complained" | "manual",
  source: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = normaliseEmail(email);
  const { error } = await service
    .from("email_suppressions")
    .upsert({ dealership_id: dealershipId, email: address, reason, source }, { onConflict: "dealership_id,email", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  const now = new Date().toISOString();
  const { error: leadError } = await service
    .from("leads")
    .update({ dnd_opt_out: true, dnd_opt_out_at: now, dnd_opt_out_source: `email_${reason}`, consent_status: "withdrawn" })
    .eq("dealership_id", dealershipId)
    .ilike("email", exactIlike(address));
  if (leadError) return { ok: false, error: leadError.message };
  return { ok: true };
}

/** A fresh unsubscribe token for one email to one address. */
export async function createUnsubscribeToken(service: any, dealershipId: string, email: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const { error } = await service.from("email_unsubscribe_tokens").insert({ token, dealership_id: dealershipId, email: normaliseEmail(email) });
  if (error) throw new Error(`couldn't create the unsubscribe link: ${error.message}`);
  return token;
}

export async function readUnsubscribeToken(service: any, token: string): Promise<{ dealershipId: string; email: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token ?? ""))) return null;
  const { data, error } = await service.from("email_unsubscribe_tokens").select("dealership_id, email").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { dealershipId: data.dealership_id, email: data.email } : null;
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.online";
}

export function unsubscribeLinks(token: string): { page: string; oneClick: string } {
  return { page: `${siteUrl()}/unsubscribe/${token}`, oneClick: `${siteUrl()}/api/public/unsubscribe/${token}` };
}

/** Where CSV-uploaded leads' consent came from — the owner picks one before uploading. */
export const CSV_CONSENT_SOURCES: Record<string, string> = {
  signup: "They signed up on my website or store",
  purchase: "They bought from me",
  enquiry: "They enquired — by call, WhatsApp, form or visit",
  event: "They gave me their details at an event or in my shop",
};
