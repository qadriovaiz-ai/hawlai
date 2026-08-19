import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";

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
    .select("id, meta_ad_id, dealership_id, daily_budget")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (fetchError || !creative) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!creative.meta_ad_id) return NextResponse.json({ error: "This ad hasn't been launched on Meta yet" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token, owner_id, approval_threshold")
    .eq("id", dealershipId)
    .single();

  // P0 10b — this PATCH is the actual real-money-spend trigger (Meta
  // only starts spending once an ad is ACTIVE; launch itself always
  // creates it PAUSED, see executionPolicy.ts's ad_campaign_launch/
  // ad_campaign_activate split). Turning PAUSED back off never needs
  // gating — same "reversible action needs no check" rule the
  // approvals route (/api/approvals/[id]) already applies to "rejected".
  if (status === "ACTIVE") {
    const isOwner = dealership?.owner_id === user.id;
    let role: ApprovalRole = "owner";
    if (!isOwner) {
      const { data: teamMember } = await supabase.from("team_members").select("role").eq("user_id", user.id).eq("dealership_id", dealershipId).eq("status", "active").maybeSingle();
      role = (teamMember?.role as ApprovalRole) ?? "viewer";
    }
    const authority = checkApprovalAuthority(role, dealership?.approval_threshold ?? 50000, creative.daily_budget ?? null);
    if (!authority.canApprove) {
      return NextResponse.json({ error: authority.reason ?? "You don't have authority to activate ad spend." }, { status: 403 });
    }
  }

  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Facebook Page isn't connected" }, { status: 400 });
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
