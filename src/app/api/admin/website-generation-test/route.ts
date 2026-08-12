import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { planWebsite, generateWebsite, saveGeneratedWebsite, type PlannedPage, type GeneratedPage } from "@/lib/agents/websiteBuilderAgent";

// One-time QA verification endpoint — same secret-header protection as
// the other admin endpoints. Creates a fresh throwaway test dealership
// (no real owner/session needed) and runs first-time website
// generation through it, to confirm the candle-by-qaaf fixes
// (max_tokens, resolveInternalHref, sanitizeInternalLinks,
// saveGeneratedWebsite) work for ANY business generically, not just as
// a one-off patch on that one dealership's data.
function checkAuth(request: Request): NextResponse | null {
  const secret = request.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return NextResponse.json({ error: "ADMIN_SEED_SECRET not configured in environment" }, { status: 500 });
  if (secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

// Walks every page's block tree looking for "button" blocks, returning
// each href found alongside whether it's an internal reference and, if
// so, whether it points at a real planned page slug. This is the same
// check resolveInternalHref()/sanitizeInternalLinks() rely on, done
// here independently so this test doesn't just trust that the
// production code path "said" it worked.
function auditLinks(pages: GeneratedPage[]): { pageSlug: string; href: string; targetSlug: string; validTarget: boolean }[] {
  const validSlugs = new Set(pages.map((p) => p.slug));
  const findings: { pageSlug: string; href: string; targetSlug: string; validTarget: boolean }[] = [];

  function walk(pageSlug: string, node: any) {
    if (node?.type === "button" && typeof node.props?.href === "string") {
      const href = node.props.href.trim();
      const isExternal = !href || href === "#" || /^(https?:|mailto:|tel:)/i.test(href);
      if (!isExternal) {
        const targetSlug = href.replace(/^\/+/, "").replace(/\/+$/, "") || "home";
        findings.push({ pageSlug, href, targetSlug, validTarget: targetSlug === "home" || validSlugs.has(targetSlug) });
      }
    }
    if (Array.isArray(node?.children)) node.children.forEach((c: any) => walk(pageSlug, c));
  }

  for (const page of pages) {
    for (const section of page.sections ?? []) walk(page.slug, section);
  }
  return findings;
}

async function runScenario(
  service: any,
  label: string,
  dealershipName: string,
  businessCategory: string,
  prompt: string,
  forcedPages: PlannedPage[] | null // null = let planWebsite() decide naturally
) {
  // Fresh throwaway dealership per run — owner_id is nullable
  // (dealerships.owner_id has no NOT NULL constraint), so this needs
  // no real auth user. Named/tagged clearly as a QA artifact.
  const { data: dealership, error: dealershipError } = await service
    .from("dealerships")
    .insert({ dealership_name: `${dealershipName} (QA TEST — safe to delete)`, business_category: businessCategory, city: "Mumbai", onboarding_completed: true })
    .select("id, dealership_name")
    .single();
  if (dealershipError || !dealership) return { label, error: `Couldn't create test dealership: ${dealershipError?.message}` };

  const brandProfile = { tone_of_voice: "warm and direct" };
  let pagePlan: PlannedPage[];
  let planSource: string;
  if (forcedPages) {
    pagePlan = forcedPages;
    planSource = "forced (adversarial — deliberately omits a products page for a product business)";
  } else {
    const plan = await planWebsite(prompt, dealership.dealership_name, businessCategory, "Mumbai", brandProfile, { supabase: service, dealershipId: dealership.id });
    pagePlan = plan.pages;
    planSource = plan._fallback ? "planWebsite fell back to defaults (its own API call failed)" : "planWebsite (AI-planned)";
  }

  const { pages: generatedPages, _fallback, fallbackWarnings } = await generateWebsite(
    dealership.dealership_name,
    businessCategory,
    "Mumbai",
    pagePlan,
    null,
    brandProfile,
    prompt,
    { supabase: service, dealershipId: dealership.id }
  );

  const saveResult = await saveGeneratedWebsite(service, dealership.id, dealership.dealership_name, generatedPages, {
    themeKey: "navy_amber",
    prompt,
    businessSummary: null,
  });

  // Publish it — the live public-facing HTTP checks this endpoint's
  // caller runs afterward need published=true, same as any real site.
  await service.from("websites").update({ published: true }).eq("id", saveResult.websiteId);

  const linkAudit = auditLinks(generatedPages);
  const invalidLinks = linkAudit.filter((l) => !l.validTarget);

  return {
    label,
    dealershipId: dealership.id,
    dealershipName: dealership.dealership_name,
    websiteSlug: saveResult.slug,
    liveUrl: `https://hawlai.online/site/${saveResult.slug}`,
    planSource,
    plannedPages: pagePlan.map((p) => p.slug),
    anyPageFellBack: !!_fallback,
    fallbackWarnings: fallbackWarnings?.length ? fallbackWarnings : undefined,
    savedAsFallback: saveResult.savedFallbackSlugs,
    internalLinksFound: linkAudit.length,
    invalidLinksFoundPostSanitization: invalidLinks, // should ALWAYS be empty — sanitizeInternalLinks runs inside generateWebsite already
    allLinksValid: invalidLinks.length === 0,
  };
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const service = createServiceClient();

  const [realistic, adversarial] = await Promise.all([
    runScenario(
      service,
      "realistic-first-generation",
      "Bloom & Wax Studio",
      "candle shop",
      "We're a home-based candle business selling handmade scented candles and gift sets online. Please build us a real shop where customers can browse and buy.",
      null // let planWebsite() decide the page list itself, as any real onboarding flow would
    ),
    runScenario(
      service,
      "adversarial-missing-products-page",
      "Riverside Pottery Co",
      "handmade pottery shop",
      "We sell handmade ceramic mugs, bowls, and vases online, plus custom orders. We want strong calls-to-action pushing people to shop our collection.",
      // Deliberately reproduces candle-by-qaaf's exact original bug
      // condition: a product-selling business whose plan has no
      // products/shop page at all — the scenario a homepage CTA is
      // most likely to hallucinate a link for.
      [
        { slug: "home", title: "Home", pageType: "home" },
        { slug: "about", title: "About", pageType: "about" },
        { slug: "contact", title: "Contact", pageType: "contact" },
        { slug: "privacy-policy", title: "Privacy Policy", pageType: "legal" },
        { slug: "terms", title: "Terms & Conditions", pageType: "legal" },
      ]
    ),
  ]);

  return NextResponse.json({ realistic, adversarial });
}
