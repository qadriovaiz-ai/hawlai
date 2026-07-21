import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getWebsite(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return { dealershipId: undefined, website: undefined };
  const { data: website } = await supabase.from("websites").select("id, dealership_id").eq("dealership_id", dealershipId).maybeSingle();
  return { dealershipId, website };
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
}

// Add a new page directly (blank, or duplicated from an existing one via
// `duplicateFrom`) — independent of the AI plan/regenerate flow, so the
// owner can grow their site incrementally like a normal site editor
// instead of regenerating everything.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { website } = await getWebsite(supabase, user.id);
  if (!website) return NextResponse.json({ error: "Build your website first" }, { status: 400 });

  const { title, duplicateFrom } = await request.json();

  const { data: existingPages } = await supabase.from("website_pages").select("slug, order_index").eq("website_id", website.id);
  const maxOrder = Math.max(-1, ...(existingPages ?? []).map((p: any) => p.order_index ?? 0));

  if (duplicateFrom) {
    const { data: source } = await supabase.from("website_pages").select("*").eq("id", duplicateFrom).eq("website_id", website.id).maybeSingle();
    if (!source) return NextResponse.json({ error: "Page to duplicate not found" }, { status: 404 });

    let slug = `${source.slug}-copy`;
    let attempt = 0;
    while ((existingPages ?? []).some((p: any) => p.slug === slug)) {
      attempt++;
      slug = `${source.slug}-copy-${attempt + 1}`;
    }

    const { data: page, error } = await supabase.from("website_pages").insert({
      website_id: website.id,
      slug,
      title: `${source.title} (Copy)`,
      page_type: source.page_type,
      meta_description: source.meta_description,
      sections: source.sections,
      order_index: maxOrder + 1,
    }).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ page });
  }

  if (!title?.trim()) return NextResponse.json({ error: "Page title is required" }, { status: 400 });
  let slug = slugify(title);
  let attempt = 0;
  while ((existingPages ?? []).some((p: any) => p.slug === slug)) {
    attempt++;
    slug = `${slugify(title)}-${attempt + 1}`;
  }

  const { data: page, error } = await supabase.from("website_pages").insert({
    website_id: website.id,
    slug,
    title: title.trim(),
    page_type: "custom",
    meta_description: `${title.trim()}`,
    sections: [{ type: "hero", headline: title.trim(), subheadline: "", ctaText: "" }, { type: "text", heading: "", body: "" }],
    order_index: maxOrder + 1,
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page });
}
