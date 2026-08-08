import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureGate";

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

  const { data } = await supabase.from("influencers").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  const influencers = data ?? [];

  // For every influencer with a linked discount code, pull the real
  // orders that used it and sum them — actual attribution instead of
  // the dealer having to type in a revenue guess. Codes with zero
  // orders yet are still returned (real_orders_count: 0), not omitted.
  const codes = influencers.map((i) => i.discount_code).filter(Boolean);
  let ordersByCode: Record<string, { count: number; revenue: number }> = {};
  if (codes.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("discount_code, total, status")
      .eq("dealership_id", dealershipId)
      .in("discount_code", codes)
      .neq("status", "cancelled");
    for (const o of orders ?? []) {
      const key = o.discount_code as string;
      if (!ordersByCode[key]) ordersByCode[key] = { count: 0, revenue: 0 };
      ordersByCode[key].count += 1;
      ordersByCode[key].revenue += Number(o.total) || 0;
    }
  }

  const enriched = influencers.map((i) => ({
    ...i,
    real_orders_count: i.discount_code ? ordersByCode[i.discount_code]?.count ?? 0 : null,
    real_revenue: i.discount_code ? ordersByCode[i.discount_code]?.revenue ?? 0 : null,
  }));

  return NextResponse.json({ influencers: enriched });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const gate = await requireFeature(supabase, dealershipId, "influencerMarketing");
  if (!gate.allowed) return gate.response;

  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase.from("influencers").insert({
    dealership_id: dealershipId,
    name: body.name,
    handle: body.handle ?? null,
    platform: body.platform ?? "instagram",
    followers_estimate: body.followersEstimate ?? null,
    contact_info: body.contactInfo ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, influencer: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const gate = await requireFeature(supabase, dealershipId, "influencerMarketing");
  if (!gate.allowed) return gate.response;

  const { id, generateCode, ...fields } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // One-click "give this influencer a tracking code" — creates a real
  // discount_codes row (10% off, no expiry, dealer can edit it later
  // from Website Builder > Offers) and links it, instead of making the
  // dealer go set one up manually first.
  if (generateCode) {
    const { data: influencer } = await supabase.from("influencers").select("name").eq("id", id).eq("dealership_id", dealershipId).single();
    if (!influencer) return NextResponse.json({ error: "Influencer not found" }, { status: 404 });

    const base = influencer.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "INFLU";
    let code = `${base}10`;
    let attempt = 0;
    // Handles the rare case where the generated code already exists
    // for this dealership (e.g. two influencers with similar names).
    while (attempt < 5) {
      const { data: existing } = await supabase.from("discount_codes").select("id").eq("dealership_id", dealershipId).eq("code", code).maybeSingle();
      if (!existing) break;
      attempt += 1;
      code = `${base}10${attempt}`;
    }

    const { error: codeError } = await supabase.from("discount_codes").insert({
      dealership_id: dealershipId, code, discount_type: "percentage", value: 10,
    });
    if (codeError) return NextResponse.json({ error: codeError.message }, { status: 500 });

    const { error } = await supabase.from("influencers").update({ discount_code: code }).eq("id", id).eq("dealership_id", dealershipId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, discountCode: code });
  }

  const update: any = {};
  if (fields.status !== undefined) update.status = fields.status;
  if (fields.campaignName !== undefined) update.campaign_name = fields.campaignName;
  if (fields.startDate !== undefined) update.start_date = fields.startDate;
  if (fields.endDate !== undefined) update.end_date = fields.endDate;
  if (fields.agreedAmount !== undefined) update.agreed_amount = fields.agreedAmount;
  if (fields.leadsGenerated !== undefined) update.leads_generated = fields.leadsGenerated;
  if (fields.revenueGenerated !== undefined) update.revenue_generated = fields.revenueGenerated;
  if (fields.notes !== undefined) update.notes = fields.notes;
  if (fields.discountCode !== undefined) update.discount_code = fields.discountCode ? String(fields.discountCode).toUpperCase().trim() : null;

  const { error } = await supabase.from("influencers").update(update).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const gate = await requireFeature(supabase, dealershipId, "influencerMarketing");
  if (!gate.allowed) return gate.response;

  const { id } = await request.json();
  const { error } = await supabase.from("influencers").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
