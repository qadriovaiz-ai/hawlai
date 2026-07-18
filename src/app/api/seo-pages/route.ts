import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateSeoPage } from "@/lib/agents/seoPageAgent";

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

  const { data } = await supabase.from("seo_pages").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  return NextResponse.json({ pages: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { topic } = await request.json();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single();
  const { output, _fallback } = await generateSeoPage(topic, dealership?.dealership_name ?? "the business", dealership?.business_category ?? "business", dealership?.city ?? null);
  if (_fallback || !output) return NextResponse.json({ error: "Couldn't generate this page right now — try again" }, { status: 500 });

  // Ensure slug uniqueness across all dealerships.
  let slug = output.slug || topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let attempt = 0;
  while (attempt < 10) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const { data: taken } = await supabase.from("seo_pages").select("id").eq("slug", candidate).maybeSingle();
    if (!taken) { slug = candidate; break; }
    attempt++;
  }

  const { data: saved, error } = await supabase
    .from("seo_pages")
    .insert({
      dealership_id: dealershipId,
      slug,
      title: output.title,
      meta_description: output.metaDescription,
      h1: output.h1,
      sections: output.sections,
      published: false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: saved });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, published } = await request.json();
  const { error } = await supabase.from("seo_pages").update({ published: !!published }).eq("id", id).eq("dealership_id", dealershipId);
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
  const { error } = await supabase.from("seo_pages").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
