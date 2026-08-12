import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateWebsite, saveGeneratedWebsite, type PlannedPage } from "@/lib/agents/websiteBuilderAgent";

// URGENT incident-recovery endpoint — protected the same way
// /api/admin/seed-knowledge is (a secret header, not normal user auth,
// since this operates across every dealership, not one). See migration
// 097_website_fallback_protection.sql for the root cause: two call
// sites unconditionally overwrote website_pages with whatever
// generateWebsite() returned, including placeholder fallback content,
// with no check for whether the site was already published — found
// live on candle_by_qaaf (every page: Home, About, Contact, Privacy
// Policy, Terms). Both call sites are fixed to go through
// saveGeneratedWebsite() now, which never lets a fallback overwrite
// real existing content. This endpoint is for the damage already done
// before that fix: GET audits which businesses are currently affected,
// POST re-attempts real generation for one or all of them.
function checkAuth(request: Request): NextResponse | null {
  const secret = request.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return NextResponse.json({ error: "ADMIN_SEED_SECRET not configured in environment" }, { status: 500 });
  if (secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const service = createServiceClient();
  const { data: fallbackPages, error } = await service
    .from("website_pages")
    .select("id, slug, title, page_type, updated_at, website_id, websites(slug, published, dealership_id, dealerships(dealership_name))")
    .eq("is_fallback", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const affected = (fallbackPages ?? []).map((p: any) => ({
    dealershipName: p.websites?.dealerships?.dealership_name ?? "(unknown)",
    dealershipId: p.websites?.dealership_id,
    websiteSlug: p.websites?.slug,
    published: !!p.websites?.published,
    pageSlug: p.slug,
    pageTitle: p.title,
    lastUpdated: p.updated_at,
  }));

  const byWebsite = new Map<string, { dealershipName: string; websiteSlug: string; published: boolean; pages: string[] }>();
  for (const row of affected) {
    const key = row.websiteSlug ?? "unknown";
    if (!byWebsite.has(key)) byWebsite.set(key, { dealershipName: row.dealershipName, websiteSlug: row.websiteSlug, published: row.published, pages: [] });
    byWebsite.get(key)!.pages.push(row.pageTitle);
  }

  return NextResponse.json({
    totalAffectedPages: affected.length,
    totalAffectedWebsites: byWebsite.size,
    publishedAffectedWebsites: [...byWebsite.values()].filter((w) => w.published).length,
    websites: [...byWebsite.values()],
    pages: affected,
  });
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const service = createServiceClient();
  const body = await request.json().catch(() => ({}));
  const websiteSlug: string | undefined = body.websiteSlug;
  const all: boolean = !!body.all;

  if (!websiteSlug && !all) {
    return NextResponse.json({ error: "Provide either { websiteSlug } for one business or { all: true } for every currently-affected business" }, { status: 400 });
  }

  let targetWebsiteIds: string[];
  if (all) {
    const { data: fallbackPages } = await service.from("website_pages").select("website_id").eq("is_fallback", true);
    targetWebsiteIds = [...new Set((fallbackPages ?? []).map((p: any) => p.website_id))];
  } else {
    const { data: site } = await service.from("websites").select("id").eq("slug", websiteSlug).maybeSingle();
    if (!site) return NextResponse.json({ error: `No website found with slug "${websiteSlug}"` }, { status: 404 });
    targetWebsiteIds = [site.id];
  }

  if (targetWebsiteIds.length === 0) {
    return NextResponse.json({ regenerated: 0, results: [], note: "Nothing currently affected." });
  }

  const results: any[] = [];
  for (const websiteId of targetWebsiteIds) {
    try {
      const { data: website } = await service.from("websites").select("id, slug, dealership_id, theme_key, prompt, business_summary").eq("id", websiteId).single();
      if (!website) { results.push({ websiteId, error: "Website row not found" }); continue; }

      const [{ data: dealership }, { data: brandProfile }, { data: existingPages }] = await Promise.all([
        service.from("dealerships").select("dealership_name, business_category, city").eq("id", website.dealership_id).single(),
        service.from("brand_profiles").select("tone_of_voice, messaging_pillars").eq("dealership_id", website.dealership_id).maybeSingle(),
        service.from("website_pages").select("slug, title, page_type, order_index").eq("website_id", websiteId).order("order_index", { ascending: true }),
      ]);

      if (!existingPages || existingPages.length === 0) { results.push({ websiteId, slug: website.slug, error: "No existing pages to regenerate from" }); continue; }

      const pagePlan: PlannedPage[] = existingPages.map((p: any) => ({ slug: p.slug, title: p.title, pageType: p.page_type }));

      const { pages: generatedPages, fallbackWarnings } = await generateWebsite(
        dealership?.dealership_name ?? "the business",
        dealership?.business_category ?? "business",
        dealership?.city ?? null,
        pagePlan,
        website.business_summary,
        brandProfile,
        website.prompt,
        { supabase: service, dealershipId: website.dealership_id }
      );

      const saveResult = await saveGeneratedWebsite(service, website.dealership_id, dealership?.dealership_name ?? "site", generatedPages, {
        themeKey: website.theme_key ?? "navy_amber",
        prompt: website.prompt,
        businessSummary: website.business_summary,
      });

      results.push({
        websiteId,
        slug: saveResult.slug,
        dealershipName: dealership?.dealership_name,
        stillFallback: saveResult.savedFallbackSlugs,
        recoveredPages: pagePlan.map((p) => p.slug).filter((s) => !saveResult.savedFallbackSlugs.includes(s) && !saveResult.protectedSlugs.includes(s)),
        fallbackWarnings: fallbackWarnings?.length ? fallbackWarnings : undefined,
        fullyRecovered: saveResult.savedFallbackSlugs.length === 0,
      });
    } catch (err: any) {
      results.push({ websiteId, error: err.message });
    }
  }

  return NextResponse.json({
    regenerated: results.length,
    fullyRecovered: results.filter((r) => r.fullyRecovered).length,
    stillNeedsAttention: results.filter((r) => !r.fullyRecovered),
    results,
  });
}
