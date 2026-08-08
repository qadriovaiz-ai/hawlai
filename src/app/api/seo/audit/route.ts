import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { auditWebsite } from "@/lib/agents/seoAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: website } = await supabase.from("websites").select("id, published, slug").eq("dealership_id", dealershipId).maybeSingle();
  const { data: pages } = website
    ? await supabase.from("website_pages").select("slug, title, meta_description, sections").eq("website_id", website.id)
    : { data: [] };

  const audit = auditWebsite(website, pages ?? []);
  return NextResponse.json(audit);
}
