import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { buildGoogleFeed, buildMetaFeed, type FeedProduct } from "@/lib/ads/productFeed";

// Public product feeds for dynamic remarketing — piece 7/7.
//
// Public and unauthenticated by necessity: Google Merchant Center and
// Meta Commerce Manager fetch these on their own schedule, with no
// session and no ability to hold a credential. That's the same trust
// model as the storefront itself — every field exposed here (name,
// price, image, link) is already publicly visible on the product page.
// Nothing private is in a feed.
//
// Generated live from the database rather than being a stored file, so
// the feed is never stale: a price change is reflected the next time
// the platform fetches, with no sync job to fall behind.
//
// One shared route for both platforms rather than two: they read the
// same rows and differ only in serialisation, so splitting them would
// duplicate the query and the eligibility rules.

export const revalidate = 0;

const SUPPORTED = ["google", "meta"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string; slug: string }> }
) {
  const { platform, slug } = await params;

  if (!SUPPORTED.includes(platform as (typeof SUPPORTED)[number])) {
    return NextResponse.json({ error: "Unknown feed platform" }, { status: 404 });
  }

  const supabase = createServiceClient();

  const { data: website } = await supabase
    .from("websites")
    .select("slug, published, dealership_id, dealerships(dealership_name)")
    .eq("slug", slug)
    .maybeSingle();

  // An unpublished site must not expose a catalogue — the products
  // aren't buyable yet, and a feed pointing at dead links gets the
  // whole account flagged by the platform.
  if (!website || !website.published) {
    return NextResponse.json({ error: "Feed not available" }, { status: 404 });
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, price, images, inventory_count, brand, condition, gtin, category")
    .eq("dealership_id", website.dealership_id)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  const ctx = {
    siteOrigin: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
    slug,
    businessName: (website as any).dealerships?.dealership_name ?? "Our Store",
  };

  const rows = (products ?? []) as unknown as FeedProduct[];

  if (platform === "google") {
    return new NextResponse(buildGoogleFeed(rows, ctx), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Platforms fetch hourly at most; a short cache spares the DB
        // without letting the feed go meaningfully stale.
        "Cache-Control": "public, max-age=900",
      },
    });
  }

  return new NextResponse(buildMetaFeed(rows, ctx), {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}
