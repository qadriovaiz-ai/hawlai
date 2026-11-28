import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { confirmDmPayment } from "@/lib/orders/confirmDmPayment";

const VALID_STATUS = ["new", "confirmed", "shipped", "delivered", "cancelled"];
const VALID_PAYMENT_STATUS = ["pending", "paid", "failed"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const update: Record<string, any> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    update.status = body.status;
  }
  if (body.paymentStatus !== undefined) {
    if (!VALID_PAYMENT_STATUS.includes(body.paymentStatus)) return NextResponse.json({ error: "Invalid payment status" }, { status: 400 });
    update.payment_status = body.paymentStatus;
  }
  if (body.notes !== undefined) update.notes = body.notes;

  // AN INSTAGRAM ORDER IS NEVER JUST FLIPPED TO PAID OR CONFIRMED — Seller
  // Mode O2, 28 November 2026. For those orders, the seller confirming the
  // payment is the moment stock moves (applyOrderSideEffects); a bare
  // status flip would record a paid order whose stock never left the shelf.
  //
  // O3 (same day): "Mark as paid" on one IS the seller confirming the
  // payment, so it runs confirmDmPayment — the same claim, stock and
  // invoice the WhatsApp button and the approval card run, and it closes
  // that card behind it. The owner pressing it on their own dashboard is
  // the decision. "Confirmed" without the payment is still refused.
  // Website orders are untouched.
  if (update.payment_status === "paid" || update.status === "confirmed") {
    const { data: current, error: readError } = await supabase
      .from("orders")
      .select("channel")
      .eq("id", id)
      .eq("dealership_id", dealershipId)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (current && current.channel !== "website") {
      if (update.payment_status === "paid" && Object.keys(update).length === 1) {
        const done = await confirmDmPayment(createServiceClient(), dealershipId, id, { resolveApproval: { userId: user.id } });
        if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
        const { data: order } = await supabase.from("orders").select("*").eq("id", id).eq("dealership_id", dealershipId).maybeSingle();
        return NextResponse.json({ order, note: done.note });
      }
      return NextResponse.json(
        { error: "An Instagram order is confirmed by confirming its payment — use Payment received. That step also updates your stock." },
        { status: 409 }
      );
    }
  }

  const { data: order, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order });
}
