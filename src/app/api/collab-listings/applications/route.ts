import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    .from("collab_applications")
    .select("*, collab_listings(title)")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ applications: data ?? [] });
}

// Converts an application into a real row in the existing `influencers`
// CRM table (status: identified) and marks the application as
// converted — one action instead of manually retyping their details.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, action } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (action === "convert") {
    const { data: application } = await supabase.from("collab_applications").select("*").eq("id", id).eq("dealership_id", dealershipId).single();
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const { data: influencer, error: insertError } = await supabase.from("influencers").insert({
      dealership_id: dealershipId,
      name: application.influencer_name,
      handle: application.handle,
      platform: application.platform,
      followers_estimate: application.followers_estimate,
      contact_info: application.contact_info,
      status: "identified",
      notes: application.message ? `From Open Collabs application: ${application.message}` : "Applied via Open Collabs board",
    }).select().single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    await supabase.from("collab_applications").update({ status: "converted" }).eq("id", id).eq("dealership_id", dealershipId);
    return NextResponse.json({ success: true, influencer });
  }

  // Plain status update (reviewed / declined) without converting.
  const status = ["new", "reviewed", "converted", "declined"].includes(action) ? action : null;
  if (!status) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const { error } = await supabase.from("collab_applications").update({ status }).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
