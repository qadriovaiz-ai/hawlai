import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Status transitions for one invoice, plus the billing_events trail.
// Platform-admin only, same reasoning as the collection route.

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["issued", "void"],
  issued: ["paid", "void"],
  paid: [],   // terminal — correcting a paid invoice needs a credit note, not an edit
  void: [],   // terminal
};

const EVENT_FOR_STATUS: Record<string, string> = {
  issued: "invoice_issued",
  paid: "payment_recorded",
  void: "invoice_voided",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { status } = await request.json();
  if (!status) return NextResponse.json({ error: "status is required" }, { status: 400 });

  const service = createServiceClient();
  const { data: invoice } = await service
    .from("invoices")
    .select("id, dealership_id, status, total_inr, invoice_number")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Explicit state machine rather than a free-form status write —
  // a paid or voided invoice is a financial record, not an editable
  // row. Correcting one is a credit note, which is itself an open CA
  // question and deliberately not built yet.
  const allowed = ALLOWED_TRANSITIONS[invoice.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Can't move an invoice from ${invoice.status} to ${status}.${allowed.length === 0 ? " That status is final." : ` Allowed: ${allowed.join(", ")}.`}` },
      { status: 400 }
    );
  }

  const update: Record<string, any> = { status };
  if (status === "issued") update.issued_at = new Date().toISOString();

  const { data: updated, error } = await service.from("invoices").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Append-only trail — every state change on a financial document is
  // recorded, so "when was this issued/paid" is answerable later.
  await service.from("billing_events").insert({
    dealership_id: invoice.dealership_id,
    invoice_id: invoice.id,
    event_type: EVENT_FOR_STATUS[status] ?? "invoice_updated",
    amount_inr: invoice.total_inr,
    metadata: { invoice_number: invoice.invoice_number, from: invoice.status, to: status, by_user: user.id },
  });

  return NextResponse.json({ invoice: updated });
}
