import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("landing_pages")
    .select("*")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { slug, headline, subheadline, offer_text, hero_image_url, published } = body;

  if (slug) {
    const { data: existing } = await supabase
      .from("landing_pages")
      .select("id")
      .eq("slug", slug)
      .neq("dealership_id", dealershipId)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "This URL is already taken, try a different one" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("landing_pages")
    .upsert(
      {
        dealership_id: dealershipId,
        ...(slug !== undefined && { slug }),
        ...(headline !== undefined && { headline }),
        ...(subheadline !== undefined && { subheadline }),
        ...(offer_text !== undefined && { offer_text }),
        ...(hero_image_url !== undefined && { hero_image_url }),
        ...(published !== undefined && { published }),
      },
      { onConflict: "dealership_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
