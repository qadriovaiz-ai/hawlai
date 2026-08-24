import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Feed status for the settings card (piece 7/7).
//
// Its own endpoint rather than extending /api/website, which returns
// the LANDING PAGE (landing_pages), not the storefront (websites).
// Those are different tables with different slug namespaces, and
// conflating them would have produced feed URLs pointing at the wrong
// slug — silently, since both would return 200.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const [{ data: website }, { count }] = await Promise.all([
    supabase.from("websites").select("slug, published").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).eq("is_active", true),
  ]);

  return NextResponse.json({
    slug: website?.slug ?? null,
    published: !!website?.published,
    productCount: count ?? 0,
  });
}
