import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { pageIds } = await request.json();
  if (!Array.isArray(pageIds) || pageIds.length === 0) return NextResponse.json({ error: "pageIds required" }, { status: 400 });

  const { data: website } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).maybeSingle();
  if (!website) return NextResponse.json({ error: "No website" }, { status: 400 });

  // Verify every page actually belongs to this website before touching anything.
  const { data: ownedPages } = await supabase.from("website_pages").select("id").eq("website_id", website.id);
  const ownedIds = new Set((ownedPages ?? []).map((p) => p.id));
  if (!pageIds.every((id: string) => ownedIds.has(id))) return NextResponse.json({ error: "Invalid page list" }, { status: 400 });

  await Promise.all(pageIds.map((id: string, index: number) => supabase.from("website_pages").update({ order_index: index }).eq("id", id)));
  return NextResponse.json({ success: true });
}
