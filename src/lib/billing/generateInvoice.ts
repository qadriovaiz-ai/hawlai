// ------------------------------------------------------------------
// Invoice generation — Usage/Pricing/Cost-Control spec, Phase 4 / 1a.
// ------------------------------------------------------------------
// RECORD-KEEPING for the manual billing that already happens today
// (UpgradeCta.tsx sends an owner to WhatsApp to arrange an upgrade by
// hand). This does NOT collect payment — Hawlai has no merchant
// account of its own wired up; the existing Razorpay integration is
// per-dealership, for THEIR customers' storefront orders.
//
// TAX IS DELIBERATELY NOT COMPUTED HERE. Whether GST applies, at what
// rate, whether it splits CGST+SGST vs IGST by comparing states, and
// the correct SAC code are real tax questions currently with a CA —
// not engineering decisions. Until those answers land, tax_inr is
// written as 0 and every surface says plainly that tax isn't
// configured yet, rather than inventing an 18% line that might be
// wrong on a document with legal weight. buildInvoiceLines() is
// shaped so the tax step slots in without reshaping anything.
// ------------------------------------------------------------------

import { getPlanLimits } from "@/lib/plans";

export interface InvoiceLine {
  label: string;
  amountInr: number;
  detail?: string;
}

export interface InvoiceDraft {
  dealershipId: string;
  plan: string;
  billingPeriodStart: string; // YYYY-MM-DD
  billingPeriodEnd: string;   // YYYY-MM-DD
  lines: InvoiceLine[];
  subtotalInr: number;
  taxInr: number;
  totalInr: number;
  taxConfigured: boolean;
}

/**
 * Indian financial year label for a date — FY runs April 1 to March 31,
 * so a January invoice belongs to the FY that started the previous
 * April. Used in the invoice number.
 */
export function financialYearLabel(d: Date): string {
  const year = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? year : year - 1; // month 3 = April
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}

/**
 * PROVISIONAL numbering scheme — sequential within a financial year,
 * e.g. HAW/2627/0001. Whether a specific format, prefix, or
 * gapless-sequence guarantee is legally mandated is one of the open
 * CA questions; this is a reasonable, conventional default chosen so
 * work isn't blocked, NOT a verified-compliant format.
 *
 * Concurrency: derives the next number from the current max within the
 * FY. Two simultaneous generations could compute the same number — the
 * unique constraint on invoices.invoice_number then rejects the second
 * loudly rather than silently duplicating. Acceptable because invoices
 * are generated manually, one at a time, by a platform admin.
 */
export async function nextInvoiceNumber(service: any, issueDate: Date): Promise<string> {
  const fy = financialYearLabel(issueDate);
  const prefix = `HAW/${fy}/`;

  const { data: latest } = await service
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSeq = latest?.invoice_number ? parseInt(String(latest.invoice_number).split("/").pop() ?? "0", 10) : 0;
  const nextSeq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

/** First and last day of a given month, as YYYY-MM-DD. */
export function monthBounds(year: number, monthIndex0: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Builds the line items for one business's billing month from REAL
 * recorded usage — the plan's own price plus any calling overage
 * actually charged that month (calling_minutes_usage.extra_charge_inr,
 * which was already computed at call time as actual_cost + margin/min,
 * Section 12). Never re-derives or estimates a charge that was
 * already computed from real usage.
 */
export async function buildInvoiceDraft(
  service: any,
  dealershipId: string,
  billingMonth: string // YYYY-MM-01
): Promise<InvoiceDraft> {
  const monthDate = new Date(`${billingMonth}T00:00:00Z`);
  const { start, end } = monthBounds(monthDate.getUTCFullYear(), monthDate.getUTCMonth());

  const [{ data: dealership }, { data: callingRow }] = await Promise.all([
    service.from("dealerships").select("plan").eq("id", dealershipId).single(),
    service
      .from("calling_minutes_usage")
      .select("extra_minutes_charged, extra_charge_inr")
      .eq("dealership_id", dealershipId)
      .eq("billing_month", billingMonth)
      .maybeSingle(),
  ]);

  const plan = dealership?.plan ?? "free";
  const limits = await getPlanLimits(service, plan);

  const lines: InvoiceLine[] = [
    {
      label: `${limits.label} plan — monthly subscription`,
      amountInr: limits.priceInr,
      detail: `${start} to ${end}`,
    },
  ];

  // Overage was already computed and stored at call time; this reads
  // it rather than recalculating, so the invoice can never disagree
  // with what the customer already saw on their usage page.
  const extraCharge = Number(callingRow?.extra_charge_inr ?? 0);
  if (extraCharge > 0) {
    const extraMinutes = Number(callingRow?.extra_minutes_charged ?? 0);
    lines.push({
      label: "AI calling — additional minutes",
      amountInr: Math.round(extraCharge * 100) / 100,
      detail: `${extraMinutes.toFixed(2)} min beyond the ${limits.callingFreeMinutes} included`,
    });
  }

  const subtotalInr = Math.round(lines.reduce((s, l) => s + l.amountInr, 0) * 100) / 100;

  // See the file header — tax stays 0 until the CA answers land.
  const taxInr = 0;
  const taxConfigured = false;

  return {
    dealershipId,
    plan,
    billingPeriodStart: start,
    billingPeriodEnd: end,
    lines,
    subtotalInr,
    taxInr,
    totalInr: Math.round((subtotalInr + taxInr) * 100) / 100,
    taxConfigured,
  };
}
