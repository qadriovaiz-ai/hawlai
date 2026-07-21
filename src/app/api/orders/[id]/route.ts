import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
