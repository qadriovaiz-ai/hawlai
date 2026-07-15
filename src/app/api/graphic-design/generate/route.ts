import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateGraphic } from "@/lib/agents/graphicDesignAgent";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { designType, prompt } = await request.json();
  if (!designType) return NextResponse.json({ error: "designType required" }, { status: 400 });

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  try {
    const buffer = await generateGraphic(
      designType,
      dealership?.dealership_name ?? "the business",
      dealership?.business_category ?? "car dealership",
      prompt ?? "",
      brandProfile
    );
    const serviceClient = createServiceClient();
    const filePath = `graphic-designs/${dealershipId}/${designType}-${Date.now()}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

    const { data: saved } = await supabase
      .from("graphic_designs")
      .insert({ dealership_id: dealershipId, design_type: designType, prompt: prompt ?? "", image_url: publicUrlData.publicUrl })
      .select()
      .single();

    return NextResponse.json({ url: publicUrlData.publicUrl, id: saved?.id ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("graphic_designs")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(40);

  return NextResponse.json({ items: data ?? [] });
}
