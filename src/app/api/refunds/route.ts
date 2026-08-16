import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createRazorpayRefund } from "@/lib/payments/razorpay";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("refund_requests")
    .select("*, orders(customer_name, customer_phone, total, razorpay_payment_id), leads(name, phone)")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ refundRequests: data ?? [] });
}

// The only server-side path that ever calls Razorpay's real refund
// API — approve, and only approve. Reject just closes the request out
// with no money movement. A request already handled (not "requested"
// anymore) can't be re-approved/re-rejected, so a double-click or a
// stale tab can't trigger a second refund.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, action } = await request.json();
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "id and a valid action (approve/reject) are required" }, { status: 400 });
  }

  const { data: refundRequest } = await supabase
    .from("refund_requests")
    .select("id, status, requested_amount, orders(razorpay_payment_id)")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (!refundRequest) return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
  if (refundRequest.status !== "requested") return NextResponse.json({ error: "This request has already been handled" }, { status: 400 });

  if (action === "reject") {
    const { error } = await supabase
      .from("refund_requests")
      .update({ status: "rejected", processed_by: user.id, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // action === "approve" — real money moves from here on.
  const order = refundRequest.orders as any;
  const paymentId = order?.razorpay_payment_id;
  if (!paymentId) {
    return NextResponse.json({ error: "This order has no Razorpay payment on record — refund it manually with your payment provider instead." }, { status: 400 });
  }

  const { data: dealership } = await supabase.from("dealerships").select("razorpay_key_id, razorpay_key_secret").eq("id", dealershipId).single();
  if (!dealership?.razorpay_key_id || !dealership?.razorpay_key_secret) {
    return NextResponse.json({ error: "Razorpay isn't connected for this business — connect it in Settings before approving refunds." }, { status: 400 });
  }

  try {
    const amountInPaise = Math.round(Number(refundRequest.requested_amount) * 100);
    const refund = await createRazorpayRefund(paymentId, amountInPaise, dealership.razorpay_key_id, dealership.razorpay_key_secret);
    const { error } = await supabase
      .from("refund_requests")
      .update({ status: "processed", razorpay_refund_id: refund.id, processed_by: user.id, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    // Request stays "requested" so it can be retried — nothing here
    // marks it processed unless Razorpay actually confirmed it.
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
