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
  const [{ data: pages }, { data: dealership }] = await Promise.all([
    website
      // seo_title, because that is what the page serves as its <title>;
      // `title` is the navigation label (migration 203).
      ? supabase.from("website_pages").select("slug, title, seo_title, meta_description, sections").eq("website_id", website.id)
      : Promise.resolve({ data: [] as any[] }),
    // The name the title falls back to, so the audit grades the string
    // a visitor really sees rather than an empty one.
    supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).maybeSingle(),
  ]);

  const audit = auditWebsite(website, pages ?? [], dealership?.dealership_name ?? null);
  return NextResponse.json(audit);
}
