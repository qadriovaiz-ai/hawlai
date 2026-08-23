// ------------------------------------------------------------------
// Customer-list audience hashing + suppression.
// ------------------------------------------------------------------
// Meta's Marketing API REQUIRES SHA-256 for customer-list Custom
// Audiences ("You must hash data as SHA256; we don't support other
// hashing mechanisms") — verified against Meta's own docs. Google Ads
// Customer Match has the same requirement. So hashing isn't just a
// privacy improvement here, it's the format the destination actually
// needs; the previous raw-CSV export was both a compliance problem
// AND the wrong shape for its stated purpose.
//
// Normalization must happen BEFORE hashing and must match the
// platform's rules exactly, or the hash won't match the platform's
// own hash of the same person and the audience silently under-matches:
//   email — trim, lowercase
//   phone — digits only, country code included, no leading + or 00
// ------------------------------------------------------------------

import crypto from "crypto";

/** Meta/Google both expect E.164 digits with no punctuation or leading +. */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode = "91"): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // Strip international dialing prefix if present ("0091..." -> "91...").
  if (digits.startsWith("00")) digits = digits.slice(2);

  // A bare 10-digit Indian number needs its country code prepended —
  // without it the hash won't match how the platform stored the same
  // person, and the match rate quietly drops instead of erroring.
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;

  // A leading domestic trunk '0' before the subscriber number
  // (e.g. "0" + 10 digits) is not part of the international format.
  if (digits.length === 11 && digits.startsWith("0")) digits = `${defaultCountryCode}${digits.slice(1)}`;

  return digits.length >= 11 ? digits : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashPhone(raw: string | null | undefined): string | null {
  const normalized = normalizePhone(raw);
  return normalized ? sha256(normalized) : null;
}

export function hashEmail(raw: string | null | undefined): string | null {
  const normalized = normalizeEmail(raw);
  return normalized ? sha256(normalized) : null;
}

// ---- Suppression -------------------------------------------------

export interface SuppressionList {
  phones: Set<string>;
  emails: Set<string>;
}

/**
 * Everyone who must NEVER appear in an exported ad audience.
 *
 * Built from the `leads` table's own opt-out signals (migration 101):
 *   dnd_opt_out = true       — explicitly asked not to be contacted
 *   consent_status = 'withdrawn' — consent actively revoked
 *
 * Matched on NORMALIZED phone/email rather than raw strings, because
 * the same person appears across leads/orders/abandoned_carts with
 * inconsistent formatting ("+91 98765 43210" vs "9876543210"). Raw
 * string comparison would let an opted-out person through simply
 * because their cart record was formatted differently from their
 * lead record — which is exactly the failure this exists to prevent.
 */
export async function buildSuppressionList(supabase: any, dealershipId: string): Promise<SuppressionList> {
  const { data } = await supabase
    .from("leads")
    .select("phone, email, dnd_opt_out, consent_status")
    .eq("dealership_id", dealershipId)
    .or("dnd_opt_out.eq.true,consent_status.eq.withdrawn");

  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const row of data ?? []) {
    const p = normalizePhone(row.phone);
    if (p) phones.add(p);
    const e = normalizeEmail(row.email);
    if (e) emails.add(e);
  }
  return { phones, emails };
}

export function isSuppressed(
  suppression: SuppressionList,
  phone: string | null | undefined,
  email: string | null | undefined
): boolean {
  const p = normalizePhone(phone);
  if (p && suppression.phones.has(p)) return true;
  const e = normalizeEmail(email);
  if (e && suppression.emails.has(e)) return true;
  return false;
}

// ---- CSV ---------------------------------------------------------

export interface AudienceRow {
  phone?: string | null;
  email?: string | null;
}

export interface AudienceCsvResult {
  csv: string;
  included: number;
  suppressed: number;
  skippedNoContact: number;
}

/**
 * Meta's customer-list upload expects hashed columns named `phone` and
 * `email` — the header names are what Ads Manager maps against, so
 * they're deliberately kept as-is rather than renamed to something
 * like `phone_sha256`.
 *
 * Name is DROPPED entirely. The old export included a plaintext name
 * column, which Meta doesn't need for a phone/email match and which
 * made the file a plaintext PII list sitting in someone's Downloads
 * folder. Removing it costs nothing and is strictly safer.
 */
export function buildHashedAudienceCsv(rows: AudienceRow[], suppression: SuppressionList): AudienceCsvResult {
  const header = "phone,email";
  const lines: string[] = [];
  const seen = new Set<string>();
  let suppressed = 0;
  let skippedNoContact = 0;

  for (const row of rows) {
    if (!row.phone && !row.email) {
      skippedNoContact++;
      continue;
    }
    if (isSuppressed(suppression, row.phone, row.email)) {
      suppressed++;
      continue;
    }
    const phoneHash = hashPhone(row.phone) ?? "";
    const emailHash = hashEmail(row.email) ?? "";
    if (!phoneHash && !emailHash) {
      // Had a value but neither normalized into something usable
      // (e.g. a 5-digit phone) — counted as unusable, not silently
      // emitted as an empty row.
      skippedNoContact++;
      continue;
    }
    const key = `${phoneHash}|${emailHash}`;
    if (seen.has(key)) continue; // same person twice across records
    seen.add(key);
    lines.push(`${phoneHash},${emailHash}`);
  }

  return {
    csv: [header, ...lines].join("\n"),
    included: lines.length,
    suppressed,
    skippedNoContact,
  };
}
