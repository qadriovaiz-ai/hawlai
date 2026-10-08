// The pictures this business already has.
//
// The second of the post card's three options. Every URL comes from a
// ROW this business owns — products, its own site's pages, its logo, its
// earlier graphics — and never from listing a storage folder. That
// matters: the ad-creatives bucket is public-read and holds every
// business's files, so a folder listing is exactly the shape of a
// cross-business leak.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { collectOwnImages } from "@/lib/chat/postImages";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Every query filtered on this business's id. The website's pages are
  // reached through its own websites row rather than queried directly,
  // because website_pages has no dealership_id of its own.
  const [{ data: products }, { data: website }, { data: graphics }] = await Promise.all([
    supabase.from("products").select("name, images").eq("dealership_id", dealershipId).order("order_index"),
    supabase.from("websites").select("id, logo_url").eq("dealership_id", dealershipId).maybeSingle(),
    supabase
      .from("graphic_designs")
      .select("design_type, image_url")
      .eq("dealership_id", dealershipId)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const { data: pages } = website?.id
    ? await supabase.from("website_pages").select("title, slug, sections").eq("website_id", website.id)
    : { data: null };

  const images = collectOwnImages({
    products: products ?? [],
    logoUrl: website?.logo_url ?? null,
    pages: pages ?? [],
    graphics: graphics ?? [],
  });

  return NextResponse.json({
    images,
    // Said rather than left as an empty list, so the card can explain
    // instead of showing a blank panel.
    empty: images.length === 0,
  });
}
