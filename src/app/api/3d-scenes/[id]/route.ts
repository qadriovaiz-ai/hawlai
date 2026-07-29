import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: scene, error } = await supabase.from("three_d_scenes").select("*").eq("id", id).eq("dealership_id", profile.dealership_id).single();
  if (error || !scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  return NextResponse.json({ scene });
}
