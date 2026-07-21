import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

async function ownsPage(supabase: any, pageId: string, dealershipId: string) {
  const { data } = await supabase.from("website_pages").select("id, websites!inner(dealership_id)").eq("id", pageId).maybeSingle();
  return data && (data as any).websites?.dealership_id === dealershipId;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });
  if (!(await ownsPage(supabase, id, dealershipId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: pageRow } = await supabase.from("website_pages").select("website_id").eq("id", id).single();
  const { count } = await supabase.from("website_pages").select("id", { count: "exact", head: true }).eq("website_id", pageRow?.website_id);
  if ((count ?? 0) <= 1) return NextResponse.json({ error: "A site needs at least one page" }, { status: 400 });

  const { error } = await supabase.from("website_pages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });
  if (!(await ownsPage(supabase, id, dealershipId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const update: any = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.metaDescription !== undefined) update.meta_description = body.metaDescription;
  if (body.sections !== undefined) update.sections = body.sections;

  const { error } = await supabase.from("website_pages").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
