import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateLogoConcept } from "@/lib/agents/brandKitAgent";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
  const { data: brandProfile } = await supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle();

  try {
    const buffer = await generateLogoConcept(dealership?.dealership_name ?? "Dealership", brandProfile);
    const serviceClient = createServiceClient();
    const filePath = `logos/${dealershipId}/${Date.now()}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
