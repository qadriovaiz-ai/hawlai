import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealershipId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  return profile?.dealership_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const dealershipId = await getDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: designs } = await supabase
    .from("canvas_designs")
    .select("id, name, canvas_width, canvas_height, thumbnail_url, updated_at")
    .eq("dealership_id", dealershipId)
    .order("updated_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ designs: designs ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const dealershipId = await getDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, canvasWidth, canvasHeight, backgroundColor } = await request.json();

  const { data, error } = await supabase.from("canvas_designs").insert({
    dealership_id: dealershipId,
    name: name || "Untitled design",
    canvas_width: canvasWidth || 1080,
    canvas_height: canvasHeight || 1080,
    background_color: backgroundColor || "#ffffff",
    elements: [],
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
