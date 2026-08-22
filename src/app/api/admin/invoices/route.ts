import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { buildInvoiceDraft, nextInvoiceNumber } from "@/lib/billing/generateInvoice";

// Phase 4 / 1a — platform-admin-only invoice record-keeping.
//
// Every write goes through the service-role client: the billing
// tables have SELECT-only RLS policies (migration 147b) and no
// insert/update policy at all, precisely so a business can never
// self-issue or alter its own invoice. Authorization is proven here
// via is_platform_admin BEFORE any service-role call is made.

async function requirePlatformAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return { error: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  return { user };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const auth = await requirePlatformAdmin(supabase);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const dealershipFilter = searchParams.get("dealershipId");

  const service = createServiceClient();
  let query = service
    .from("invoices")
    .select("id, dealership_id, invoice_number, billing_period_start, billing_period_end, plan, subtotal_inr, tax_inr, total_inr, status, issued_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (dealershipFilter) query = query.eq("dealership_id", dealershipFilter);

  const [{ data: invoices }, { data: dealerships }] = await Promise.all([
    query,
    service.from("dealerships").select("id, dealership_name, plan").order("created_at", { ascending: true }),
  ]);

  const nameById = new Map((dealerships ?? []).map((d: any) => [d.id, d.dealership_name]));
  return NextResponse.json({
    invoices: (invoices ?? []).map((i: any) => ({ ...i, dealership_name: nameById.get(i.dealership_id) ?? "Unknown" })),
    dealerships: dealerships ?? [],
  });
}

// Generates a DRAFT invoice for one business's billing month from real
// recorded usage. Draft, not issued — an admin reviews the numbers
// before the document becomes real (PATCH /api/admin/invoices/[id]).
export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requirePlatformAdmin(supabase);
  if (auth.error) return auth.error;

  const { dealershipId, billingMonth } = await request.json();
  if (!dealershipId || !billingMonth) {
    return NextResponse.json({ error: "dealershipId and billingMonth (YYYY-MM-01) are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-01$/.test(billingMonth)) {
    return NextResponse.json({ error: "billingMonth must be the first of a month, as YYYY-MM-01" }, { status: 400 });
  }

  const service = createServiceClient();

  // One invoice per business per billing period — re-generating
  // should surface the existing one, never quietly create a second
  // document for the same month.
  const { data: existing } = await service
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("dealership_id", dealershipId)
    .eq("billing_period_start", billingMonth)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `An invoice already exists for that month (${existing.invoice_number}, ${existing.status}).`, existingId: existing.id },
      { status: 409 }
    );
  }

  const draft = await buildInvoiceDraft(service, dealershipId, billingMonth);
  const invoiceNumber = await nextInvoiceNumber(service, new Date());

  const { data: invoice, error } = await service
    .from("invoices")
    .insert({
      dealership_id: dealershipId,
      invoice_number: invoiceNumber,
      billing_period_start: draft.billingPeriodStart,
      billing_period_end: draft.billingPeriodEnd,
      plan: draft.plan,
      subtotal_inr: draft.subtotalInr,
      tax_inr: draft.taxInr,
      total_inr: draft.totalInr,
      status: "draft",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoice, lines: draft.lines, taxConfigured: draft.taxConfigured });
}
