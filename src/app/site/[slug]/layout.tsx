import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTheme } from "@/lib/landingThemes";
import { getSiteFontFamilies, getSiteFontStylesheetUrl } from "@/lib/siteFonts";
import CartIcon from "@/components/website/CartIcon";
import PageTracker from "@/components/website/PageTracker";
import ConsentBanner from "@/components/website/ConsentBanner";
import TrackingScripts from "@/components/website/TrackingScripts";
import { TrackingConfigProvider } from "@/components/website/TrackingConfigProvider";

// Same stale-cache risk as the page routes under this layout (see
// src/app/site/[slug]/page.tsx) — this specifically renders the nav
// menu from website_pages, which is exactly what showed stale
// (phantom, already-deleted) links live during this incident.
export const revalidate = 0;

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: website } = await supabase
    .from("websites")
    // meta_pixel_id/ga_tracking_id come from the DEALERSHIP (migration
    // 153) — the storefront previously had no tracking at all because
    // pixel config only existed on landing_pages.
    .select("id, slug, theme_key, published, logo_url, font_key, dealerships(dealership_name, meta_pixel_id, ga_tracking_id, google_ads_conversion_id, google_ads_conversion_label, google_remarketing_enabled)")
    .eq("slug", slug)
    .maybeSingle();

  if (!website || !website.published) notFound();

  const { data: pages } = await supabase.from("website_pages").select("slug, title, page_type").eq("website_id", website.id).order("order_index", { ascending: true });
  const theme = getTheme(website.theme_key);
  const fonts = getSiteFontFamilies((website as any).font_key);
  const fontStylesheetUrl = getSiteFontStylesheetUrl((website as any).font_key);
  const dealershipName = (website as any).dealerships?.dealership_name ?? "Business";
  const hasStore = (pages ?? []).some((p) => p.page_type === "products");

  return (
    <div
      // color was missing here — nav links and the footer set it
      // explicitly per-element (theme.dark), but <main> itself never
      // did, so any page that doesn't set its own text color (cart,
      // checkout, ProductReviews) fell through to the global dashboard
      // body default (near-white, since this app's slate scale is
      // inverted for the dark dashboard theme) against this light
      // storefront background — invisible text. Setting it here once
      // fixes every such page without touching each one individually;
      // pages/blocks that already set their own explicit color are
      // unaffected, since a more specific inline style always wins.
      style={{ backgroundColor: theme.bg, color: theme.dark, fontFamily: "var(--font-body)", ["--font-heading" as string]: fonts.heading, ["--font-body" as string]: fonts.body } as React.CSSProperties}
      className="min-h-screen site-fonts"
    >
      <link rel="stylesheet" href={fontStylesheetUrl} />
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <Link href={`/site/${slug}`} className="font-bold text-lg flex items-center gap-2" style={{ color: theme.dark }}>
          {(website as any).logo_url && <img src={(website as any).logo_url} alt={dealershipName} className="w-8 h-8 rounded-lg object-cover" />}
          {dealershipName}
        </Link>
        <div className="flex items-center gap-4">
          {(pages ?? []).map((p) => (
            <Link key={p.slug} href={p.slug === "home" ? `/site/${slug}` : `/site/${slug}/${p.slug}`} className="text-sm hover:underline" style={{ color: theme.dark }}>
              {p.title}
            </Link>
          ))}
          {hasStore && <CartIcon slug={slug} color={theme.dark} />}
        </div>
      </nav>
      <main>
        <TrackingConfigProvider
          config={{
            googleAdsConversionId: (website as any).dealerships?.google_ads_conversion_id ?? null,
            googleAdsConversionLabel: (website as any).dealerships?.google_ads_conversion_label ?? null,
            googleRemarketingEnabled: !!(website as any).dealerships?.google_remarketing_enabled,
          }}
        >
          {children}
        </TrackingConfigProvider>
      </main>
      <footer className="text-center text-xs py-8 opacity-50" style={{ color: theme.dark }}>
        © {new Date().getFullYear()} {dealershipName}
      </footer>
      <PageTracker slug={slug} />
      {/* The root-cause fix: the storefront — where every real
          e-commerce event happens — had no pixel at all. */}
      <TrackingScripts
        gaId={(website as any).dealerships?.ga_tracking_id}
        metaPixelId={(website as any).dealerships?.meta_pixel_id}
        googleAdsConversionId={(website as any).dealerships?.google_ads_conversion_id}
      />
      <ConsentBanner slug={slug} businessName={(website as any).dealerships?.dealership_name ?? null} />
    </div>
  );
}
