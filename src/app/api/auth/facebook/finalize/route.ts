import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePixel } from "@/lib/meta/resolvePixel";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { page_id, ad_account_id, lead_form_id, pixel_id } = await request.json();
  if (!page_id || !ad_account_id) {
    return NextResponse.json({ error: "page_id and ad_account_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: dealership } = await serviceClient
    .from("dealerships")
    .select("fb_connect_pending, meta_pixel_id")
    .eq("id", dealershipId)
    .single();

  const pending = dealership?.fb_connect_pending;
  if (!pending) return NextResponse.json({ error: "No pending connection found. Please connect again." }, { status: 400 });

  const page = pending.pages?.find((p: any) => p.id === page_id);
  if (!page) return NextResponse.json({ error: "Selected page not found" }, { status: 400 });

  const leadForm = lead_form_id ? page.leadForms?.find((f: any) => f.id === lead_form_id) : null;

  // The Pixel ID comes from what the callback discovered — the dealer
  // picks from a list or gets it automatically, and never types it.
  // Rules (including the guard on the untrusted pixel_id) live in
  // resolvePixel, where they are unit-tested.
  const chosenPixel = resolvePixel(pending.adAccounts, ad_account_id, pixel_id);

  const update: Record<string, any> = {
    fb_page_id: page.id,
    fb_page_name: page.name,
    fb_page_access_token: page.access_token,
    fb_ad_account_id: ad_account_id.startsWith("act_") ? ad_account_id : `act_${ad_account_id}`,
    fb_lead_form_id: leadForm?.id ?? null,
    fb_lead_form_name: leadForm?.name ?? null,
    fb_connect_pending: null,
  };

  // Absent ONLY when nothing was resolved, so a reconnect that can't
  // read pixels (permission lost, account changed) leaves a working
  // configuration alone instead of nulling it. The three fields above
  // are deliberately not treated this way: they describe the
  // connection being replaced, and staleness there is the bug.
  if (chosenPixel) update.meta_pixel_id = chosenPixel.id;

  const { error } = await serviceClient
    .from("dealerships")
    .update(update)
    .eq("id", dealershipId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    // So the UI can say which pixel it picked rather than silently
    // configuring conversion tracking behind the dealer's back.
    pixelId: chosenPixel?.id ?? dealership?.meta_pixel_id ?? null,
    pixelName: chosenPixel?.name ?? null,
  });
}
