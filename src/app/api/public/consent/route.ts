import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Records a visitor's tracking-consent choice server-side.
//
// Public and unauthenticated by necessity — a site visitor has no
// session. Service-role client for the same reason, scoped to a
// dealership resolved from the site slug, exactly as
// /api/public/track already does.
//
// Why a server-side row at all when localStorage already caches the
// choice: under DPDP the BUSINESS must be able to demonstrate consent
// was given. A flag on the visitor's own device demonstrates nothing.

export async function POST(request: Request) {
  const { slug, status, visitorId } = await request.json();

  if (status !== "granted" && status !== "denied") {
    return NextResponse.json({ error: "Invalid consent status" }, { status: 400 });
  }
  if (!slug) return NextResponse.json({ ok: true }); // nothing to attribute it to — fail quietly, never break the page

  const supabase = createServiceClient();

  // Same slug-resolution fallback as /api/public/track: quick-launch
  // landing pages and Website Builder sites are different namespaces
  // sharing one tracking contract.
  const { data: page } = await supabase.from("landing_pages").select("dealership_id").eq("slug", slug).eq("published", true).maybeSingle();
  let dealershipId = page?.dealership_id;
  if (!dealershipId) {
    const { data: website } = await supabase.from("websites").select("dealership_id").eq("slug", slug).eq("published", true).maybeSingle();
    dealershipId = website?.dealership_id;
  }
  if (!dealershipId) return NextResponse.json({ ok: true });

  // A denial with no visitor id is still worth nothing to store — we
  // have no key to record it against, and inventing one would create
  // the very identifier the visitor just declined.
  if (!visitorId || typeof visitorId !== "string") {
    return NextResponse.json({ ok: true, recorded: false });
  }

  await supabase.from("visitor_consent").upsert(
    {
      dealership_id: dealershipId,
      visitor_id: visitorId,
      status,
      scope: "analytics_and_ads",
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "dealership_id,visitor_id" }
  );

  return NextResponse.json({ ok: true, recorded: true });
}
