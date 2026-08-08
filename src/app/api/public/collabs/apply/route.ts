import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { listingId, name, handle, platform, followersEstimate, message, contactInfo, honeypot } = body;

  // Spam bots fill every field including hidden ones — a real applicant
  // never sees or fills this field. Silently accept without writing
  // anything, same trick used on the public order form.
  if (honeypot) return NextResponse.json({ success: true });

  if (!listingId) return NextResponse.json({ error: "Missing listing" }, { status: 400 });
  if (!name || String(name).trim().length < 2) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!contactInfo || String(contactInfo).trim().length < 3) return NextResponse.json({ error: "A way to reach you (phone, email, or Instagram DM) is required" }, { status: 400 });

  const supabase = createServiceClient();

  // Re-check the listing is still real, open, and public server-side —
  // never trust that the client only shows applications for open listings.
  const { data: listing } = await supabase.from("collab_listings").select("id, dealership_id, status, is_public").eq("id", listingId).maybeSingle();
  if (!listing || listing.status !== "open" || !listing.is_public) {
    return NextResponse.json({ error: "This opportunity is no longer accepting applications" }, { status: 400 });
  }

  const { error } = await supabase.from("collab_applications").insert({
    listing_id: listingId,
    dealership_id: listing.dealership_id,
    influencer_name: String(name).trim(),
    handle: handle ?? null,
    platform: platform ?? "instagram",
    followers_estimate: followersEstimate ? Number(followersEstimate) : null,
    message: message ?? null,
    contact_info: String(contactInfo).trim(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
