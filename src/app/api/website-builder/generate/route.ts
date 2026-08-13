import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateWebsite, saveGeneratedWebsite, PlannedPage } from "@/lib/agents/websiteBuilderAgent";
import { checkAndRecordGenerationUsage, generationLimitMessage } from "@/lib/usage/generationLimits";

// Generating several pages (even with the per-page 8s internal
// timeout below) across concurrent batches can still add up past
// Vercel's default route timeout — this doesn't replace the per-page
// safety net, it just gives the overall request room to actually
// finish instead of getting cut off between batches.
export const maxDuration = 300;

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

  const usage = await checkAndRecordGenerationUsage(dealershipId, "website_build");
  if (!usage.allowed) return NextResponse.json({ error: generationLimitMessage(usage), limitReached: true }, { status: 429 });

  try {
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

    const { pages: generatedPages, fallbackWarnings } = await generateWebsite(
      dealership?.dealership_name ?? "the business",
      dealership?.business_category ?? "business",
      dealership?.city ?? null,
      cleanPages,
      businessSummary ?? null,
      brandProfile,
      prompt ?? null,
      { supabase, dealershipId }
    );

    const resolvedTheme = ["navy_amber", "crimson_charcoal", "forest_cream", "midnight_sky"].includes(themeKey) ? themeKey : "navy_amber";

    let saveResult;
    try {
      saveResult = await saveGeneratedWebsite(supabase, dealershipId, dealership?.dealership_name ?? "site", generatedPages, {
        themeKey: resolvedTheme,
        prompt: prompt ?? null,
        businessSummary: businessSummary ?? null,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    // Pages whose fresh generation failed but whose existing (real)
    // content was protected need to be called out distinctly from
    // pages that got saved WITH placeholder text — the first is "your
    // live site is untouched, try regenerating that page again," the
    // second is "review this page before publishing."
    const protectedNote = saveResult.protectedSlugs.length
      ? `Kept the existing content for: ${saveResult.protectedSlugs.join(", ")} — regeneration failed for ${saveResult.protectedSlugs.length > 1 ? "these pages" : "this page"} so nothing was overwritten.`
      : undefined;

    return NextResponse.json({
      success: true,
      websiteId: saveResult.websiteId,
      slug: saveResult.slug,
      fallbackWarnings: fallbackWarnings?.length ? fallbackWarnings : undefined,
      protectedSlugs: saveResult.protectedSlugs.length ? saveResult.protectedSlugs : undefined,
      savedFallbackSlugs: saveResult.savedFallbackSlugs.length ? saveResult.savedFallbackSlugs : undefined,
      protectedNote,
    });
  } catch (err: any) {
    console.error("[website-builder/generate POST] error:", err.message, err.stack);
    return NextResponse.json({ error: `Website generation failed: ${err.message}` }, { status: 500 });
  }
}
