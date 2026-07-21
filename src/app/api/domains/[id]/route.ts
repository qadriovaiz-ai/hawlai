import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Owners can only cancel their own request from here. Moving a request
// to "purchased" or "connected" means real money changed hands and a
// real registrar transaction happened — that's fulfilled by the Hawlai
// team directly (until a registrar + payment flow are both live) so it
// never gets marked done by a client-side toggle.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { status } = await request.json();
  if (status !== "cancelled") return NextResponse.json({ error: "Only cancelling is allowed here" }, { status: 400 });

  const { data: order, error } = await supabase
    .from("domain_orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .in("status", ["requested", "awaiting_payment"])
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Couldn't cancel — it may already be in progress" }, { status: 500 });
  return NextResponse.json({ order });
}
