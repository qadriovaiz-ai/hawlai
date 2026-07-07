import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const GRAPH_VERSION = "v23.0";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { status } = body;
  if (!status || !["ACTIVE", "PAUSED"].includes(status)) {
    return NextResponse.json({ error: "status must be 'ACTIVE' or 'PAUSED'" }, { status: 400 });
  }

  // RLS makes sure this creative actually belongs to this dealer's dealership.
  const { data: creative, error: fetchError } = await supabase
    .from("ad_creatives")
    .select("id, meta_ad_id, dealership_id")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (fetchError || !creative) return NextResponse.json({ error: "Campaign nahi mila" }, { status: 404 });
  if (!creative.meta_ad_id) return NextResponse.json({ error: "Yeh ad abhi Meta pe launch nahi hua" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token")
    .eq("id", dealershipId)
    .single();

  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Facebook Page connect nahi hai" }, { status: 400 });
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creative.meta_ad_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    const e = data.error ?? {};
    return NextResponse.json(
      { error: `${e.message ?? "Meta API error"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}` },
      { status: 500 }
    );
  }

  const { data: updated } = await supabase
    .from("ad_creatives")
    .update({ meta_status: status })
    .eq("id", id)
    .select()
    .single();

  return NextResponse.json(updated);
}
