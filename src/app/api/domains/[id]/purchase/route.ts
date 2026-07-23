import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getActiveRegistrar } from "@/lib/domains";

// Actually spends real money via whichever registrar is connected
// (getActiveRegistrar()) — self-serve, triggered by the dealer from
// DomainPanel. Idempotent by design: an order already in "purchased"
// only retries connectToProject(); purchase() is never called twice
// for the same domain_orders row, so a retry (or a double-click) can't
// buy the same domain again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const registrar = getActiveRegistrar();
  if (!registrar) return NextResponse.json({ error: "No domain registrar is connected right now" }, { status: 400 });

  const { data: order } = await supabase.from("domain_orders").select("*").eq("id", id).eq("dealership_id", dealershipId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Domain request not found" }, { status: 404 });

  if (!["requested", "awaiting_payment", "purchased"].includes(order.status)) {
    return NextResponse.json({ error: "This request has already been finalized" }, { status: 400 });
  }

  if (order.status !== "purchased") {
    const result = await registrar.purchase(order.domain_name);
    if (!result.success) return NextResponse.json({ error: result.error ?? "Purchase failed" }, { status: 502 });
    await supabase.from("domain_orders").update({
      status: "purchased",
      registrar: registrar.name,
      registrar_order_id: result.registrarOrderId ?? null,
      purchased_at: new Date().toISOString(),
    }).eq("id", id);
  }

  const connectResult = await registrar.connectToProject(order.domain_name);
  if (!connectResult.success) {
    return NextResponse.json({
      purchased: true,
      connected: false,
      error: connectResult.error ?? "Domain purchased, but couldn't be connected automatically",
    });
  }

  await supabase.from("domain_orders").update({ status: "connected", connected_at: new Date().toISOString() }).eq("id", id);
  await supabase.from("websites").update({ custom_domain: order.domain_name, custom_domain_status: "connected" }).eq("id", order.website_id);

  return NextResponse.json({ purchased: true, connected: true });
}
