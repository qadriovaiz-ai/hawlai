import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateWebsite, SITE_TYPES } from "@/lib/agents/websiteBuilderAgent";

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

  try {
    const { data: website, error: websiteError } = await supabase.from("websites").select("*").eq("dealership_id", dealershipId).maybeSingle();
    if (websiteError) throw new Error(websiteError.message);
    if (!website) return NextResponse.json({ website: null, pages: [] });

    const { data: pages, error: pagesError } = await supabase.from("website_pages").select("*").eq("website_id", website.id).order("order_index", { ascending: true });
    if (pagesError) throw new Error(pagesError.message);
    return NextResponse.json({ website, pages: pages ?? [] });
  } catch (err: any) {
    console.error("[website-builder/generate GET] error:", err.message);
    return NextResponse.json({ error: `Couldn't load your website — the database tables may not be set up yet. (${err.message})` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { siteType, description } = await request.json();
  if (!siteType || !SITE_TYPES.find((t) => t.key === siteType)) {
    return NextResponse.json({ error: "Valid siteType required" }, { status: 400 });
  }

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const { pages: generatedPages } = await generateWebsite(
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business",
    dealership?.city ?? null,
    siteType,
    brandProfile,
    description ?? null
  );

  const base = (dealership?.dealership_name ?? "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site";

  // Upsert the website row (one per dealership) — regenerating replaces its pages.
  const { data: existing } = await supabase.from("websites").select("id, slug").eq("dealership_id", dealershipId).maybeSingle();
  let websiteId: string;
  let slug: string;
  if (existing) {
    websiteId = existing.id;
    slug = existing.slug;
    await supabase.from("websites").update({ site_type: siteType, nav_order: generatedPages.map((p) => p.slug) }).eq("id", websiteId);
    await supabase.from("website_pages").delete().eq("website_id", websiteId);
  } else {
    slug = base;
    let attempt = 0;
    while (attempt < 20) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
      const { data: taken } = await supabase.from("websites").select("id").eq("slug", candidate).maybeSingle();
      if (!taken) { slug = candidate; break; }
      attempt++;
    }
    const { data: newSite, error } = await supabase.from("websites").insert({
      dealership_id: dealershipId, slug, site_type: siteType, nav_order: generatedPages.map((p) => p.slug),
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    websiteId = newSite.id;
  }

  const pageRows = generatedPages.map((p, i) => ({
    website_id: websiteId, slug: p.slug, title: p.title, page_type: p.pageType,
    meta_description: p.metaDescription, sections: p.sections, order_index: i,
  }));
  const { error: pagesError } = await supabase.from("website_pages").insert(pageRows);
  if (pagesError) return NextResponse.json({ error: pagesError.message }, { status: 500 });

  return NextResponse.json({ success: true, websiteId, slug });
}
