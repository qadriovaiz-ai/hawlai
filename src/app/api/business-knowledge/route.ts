import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const CATEGORIES = ["hours", "pricing_note", "policy", "faq", "general"];

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("business_knowledge").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  return NextResponse.json({ facts: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!body.content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const category = CATEGORIES.includes(body.category) ? body.category : "faq";

  const { data, error } = await supabase.from("business_knowledge").insert({
    dealership_id: dealershipId, category, title: body.title.trim(), content: body.content.trim(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, fact: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, title, content, category, is_active } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: any = { updated_at: new Date().toISOString() };
  if (title !== undefined) update.title = title;
  if (content !== undefined) update.content = content;
  if (category !== undefined && CATEGORIES.includes(category)) update.category = category;
  if (is_active !== undefined) update.is_active = !!is_active;

  const { error } = await supabase.from("business_knowledge").update(update).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  const { error } = await supabase.from("business_knowledge").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
