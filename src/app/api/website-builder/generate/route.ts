import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateWebsite, PlannedPage } from "@/lib/agents/websiteBuilderAgent";

async function withTimeout<T>(promiseLike: PromiseLike<T>, label: string, ms = 8000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promiseLike), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  console.log("[website-builder GET] start");
  const supabase = await createClient();
  console.log("[website-builder GET] client created");

  let user;
  try {
    const result = await withTimeout(supabase.auth.getUser(), "auth.getUser");
    user = result.data.user;
  } catch (err: any) {
    console.error("[website-builder GET] auth.getUser failed:", err.message);
    return NextResponse.json({ error: `Auth check failed: ${err.message}` }, { status: 500 });
  }
  console.log("[website-builder GET] user resolved:", user?.id ?? "none");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let dealershipId: string | undefined;
  try {
    dealershipId = await withTimeout(getDealership(supabase, user.id), "getDealership");
  } catch (err: any) {
    console.error("[website-builder GET] getDealership failed:", err.message);
    return NextResponse.json({ error: `Dealership lookup failed: ${err.message}` }, { status: 500 });
  }
  console.log("[website-builder GET] dealershipId:", dealershipId ?? "none");
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealershipRow } = await supabase.from("dealerships").select("business_category").eq("id", dealershipId).maybeSingle();

  try {
    console.log("[website-builder GET] querying websites...");
    const { data: website, error: websiteError } = await withTimeout(
      supabase.from("websites").select("*").eq("dealership_id", dealershipId).maybeSingle(),
      "websites query"
    );
    console.log("[website-builder GET] websites query done. error:", websiteError?.message ?? "none", "found:", !!website);
    if (websiteError) throw new Error(websiteError.message);
    if (!website) return NextResponse.json({ website: null, pages: [], businessCategory: dealershipRow?.business_category ?? null });

    console.log("[website-builder GET] querying website_pages...");
    const { data: pages, error: pagesError } = await withTimeout(
      supabase.from("website_pages").select("*").eq("website_id", website.id).order("order_index", { ascending: true }),
      "website_pages query"
    );
    console.log("[website-builder GET] website_pages query done. error:", pagesError?.message ?? "none", "count:", pages?.length ?? 0);
    if (pagesError) throw new Error(pagesError.message);
    return NextResponse.json({ website, pages: pages ?? [] });
  } catch (err: any) {
    console.error("[website-builder/generate GET] error:", err.message);
    return NextResponse.json({ error: `Couldn't load your website. (${err.message})` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { prompt, pages: planPages, themeKey, businessSummary } = await request.json();
  if (!Array.isArray(planPages) || planPages.length === 0) {
    return NextResponse.json({ error: "A confirmed page plan is required — call /api/website-builder/plan first" }, { status: 400 });
  }
  const cleanPages: PlannedPage[] = planPages
    .filter((p: any) => p?.slug && p?.title)
    .map((p: any) => ({ slug: String(p.slug), title: String(p.title), pageType: String(p.pageType ?? "custom") }));
  if (cleanPages.length === 0) return NextResponse.json({ error: "No valid pages in plan" }, { status: 400 });

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  console.log("[website-builder POST] generating with:", JSON.stringify({
    dealershipId,
    dealershipName: dealership?.dealership_name,
    businessCategory: dealership?.business_category,
    city: dealership?.city,
    pages: cleanPages,
    themeKey,
    prompt,
  }));

  const { pages: generatedPages } = await generateWebsite(
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business",
    dealership?.city ?? null,
    cleanPages,
    businessSummary ?? null,
    brandProfile,
    prompt ?? null
  );

  const base = (dealership?.dealership_name ?? "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site";
  const resolvedTheme = ["navy_amber", "crimson_charcoal", "forest_cream", "midnight_sky"].includes(themeKey) ? themeKey : "navy_amber";

  // Upsert the website row (one per dealership) — regenerating replaces its pages.
  const { data: existing } = await supabase.from("websites").select("id, slug").eq("dealership_id", dealershipId).maybeSingle();
  let websiteId: string;
  let slug: string;
  if (existing) {
    websiteId = existing.id;
    slug = existing.slug;
    await supabase.from("websites").update({
      site_type: "custom",
      theme_key: resolvedTheme,
      nav_order: generatedPages.map((p) => p.slug),
      prompt: prompt ?? null,
      business_summary: businessSummary ?? null,
    }).eq("id", websiteId);
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
      dealership_id: dealershipId, slug, site_type: "custom", theme_key: resolvedTheme,
      nav_order: generatedPages.map((p) => p.slug), prompt: prompt ?? null, business_summary: businessSummary ?? null,
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
