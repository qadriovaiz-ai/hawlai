import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealershipId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  return profile?.dealership_id ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await getDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: design, error } = await supabase.from("canvas_designs").select("*").eq("id", id).eq("dealership_id", dealershipId).single();
  if (error || !design) return NextResponse.json({ error: "Design not found" }, { status: 404 });
  return NextResponse.json({ design });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await getDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const update: Record<string, any> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.canvasWidth !== undefined) update.canvas_width = body.canvasWidth;
  if (body.canvasHeight !== undefined) update.canvas_height = body.canvasHeight;
  if (body.backgroundColor !== undefined) update.background_color = body.backgroundColor;
  if (body.backgroundImageUrl !== undefined) update.background_image_url = body.backgroundImageUrl;
  if (body.elements !== undefined) update.elements = body.elements;
  if (body.thumbnailUrl !== undefined) update.thumbnail_url = body.thumbnailUrl;
  if (body.exportedImageUrl !== undefined) update.exported_image_url = body.exportedImageUrl;

  const { error } = await supabase.from("canvas_designs").update(update).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await getDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("canvas_designs").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
