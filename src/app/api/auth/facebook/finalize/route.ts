import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { page_id, ad_account_id, lead_form_id } = await request.json();
  if (!page_id || !ad_account_id) {
    return NextResponse.json({ error: "page_id and ad_account_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: dealership } = await serviceClient
    .from("dealerships")
    .select("fb_connect_pending")
    .eq("id", dealershipId)
    .single();

  const pending = dealership?.fb_connect_pending;
  if (!pending) return NextResponse.json({ error: "No pending connection found. Please connect again." }, { status: 400 });

  const page = pending.pages?.find((p: any) => p.id === page_id);
  if (!page) return NextResponse.json({ error: "Selected page not found" }, { status: 400 });

  const leadForm = lead_form_id ? page.leadForms?.find((f: any) => f.id === lead_form_id) : null;

  const { error } = await serviceClient
    .from("dealerships")
    .update({
      fb_page_id: page.id,
      fb_page_name: page.name,
      fb_page_access_token: page.access_token,
      fb_ad_account_id: ad_account_id.startsWith("act_") ? ad_account_id : `act_${ad_account_id}`,
      fb_lead_form_id: leadForm?.id ?? null,
      fb_lead_form_name: leadForm?.name ?? null,
      fb_connect_pending: null,
    })
    .eq("id", dealershipId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
