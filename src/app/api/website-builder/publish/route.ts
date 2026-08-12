import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { published } = await request.json();

  // Last line of defense before anything goes public: refuse to
  // publish while any page still holds fallback placeholder content,
  // regardless of how it got that way. saveGeneratedWebsite() already
  // protects existing real content from being overwritten by a failed
  // regeneration, but this catches the other failure mode — a
  // brand-new site whose first generation partly failed and whose
  // owner didn't notice before hitting Publish.
  if (published) {
    const { data: website } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).maybeSingle();
    if (website) {
      const { data: fallbackPages } = await supabase.from("website_pages").select("title").eq("website_id", website.id).eq("is_fallback", true);
      if (fallbackPages && fallbackPages.length > 0) {
        return NextResponse.json(
          { error: `Can't publish — ${fallbackPages.map((p: any) => p.title).join(", ")} still ${fallbackPages.length > 1 ? "have" : "has"} placeholder content because generation failed. Hit Regenerate Website first.` },
          { status: 400 }
        );
      }
    }
  }

  const { error } = await supabase.from("websites").update({ published: !!published }).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
