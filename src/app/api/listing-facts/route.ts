import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanListingFactsPatch } from "@/lib/seo/listingFacts";
import { NextResponse } from "next/server";

// The listing facts, read and written by the owner (I4 of
// docs/PLAN-AUTO-INTERVIEW.md).
//
// WHY A SERVICE CLIENT AFTER A SESSION-RESOLVED ID, which is the
// pattern this codebase has settled on: `business_listing_facts` has NO
// client write policy at all (migration 221). That is deliberate — a
// table whose columns decide what a public page says about a real
// business should not be writable by a browser holding a session token.
// So authorization happens here, against the user's own RLS-bound
// session, and only then does the service client touch the row.
//
// THE DEALERSHIP ID IS NEVER TAKEN FROM THE BODY. It is read from the
// caller's own `profiles` row with the RLS client, which is the only
// version of that question nobody can lie about.
//
// AND ONE RULE THAT IS NOT ABOUT PLUMBING: recording a fact and
// publishing it are different permissions. Anyone on the business may
// record the phone number; only the OWNER may put it, or a street
// address, on a public page. A team member who asks to publish is
// refused and told, rather than having the flag quietly written false —
// a silent false is a setting the owner would later find switched off
// with no explanation.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business" }, { status: 400 });

  // The owner's own read goes through RLS, which migration 221 grants to
  // the owner and to an active team member. No service client needed to
  // READ — if RLS refuses, the answer genuinely is "not yours".
  const { data } = await supabase
    .from("business_listing_facts")
    .select("*")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  // NULL IS THE NORMAL ANSWER for a business that has not been asked
  // yet, not an error. The screen renders empty fields from it.
  return NextResponse.json(data ?? null);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business" }, { status: 400 });

  const service = createServiceClient();

  // AUTHORIZATION BEFORE ANY WRITE, and the owner check is its own
  // question: `profiles.dealership_id` says which business this user
  // belongs to, and `dealerships.owner_id` says whether they own it.
  // A team member belongs without owning.
  const { data: dealership } = await service.from("dealerships").select("owner_id").eq("id", dealershipId).maybeSingle();
  const isOwner = dealership?.owner_id === user.id;

  const body = await request.json().catch(() => ({}));
  const { patch, refusedPublish } = cleanListingFactsPatch(body, { canPublish: isOwner });

  if (refusedPublish.length > 0) {
    return NextResponse.json(
      {
        error:
          "Only the owner can put a phone number or a street address on a public page. The facts can be saved without publishing them.",
        refused: refusedPublish,
      },
      { status: 403 }
    );
  }

  // NOTHING TO WRITE IS NOT A WRITE. An empty patch means the caller
  // sent no column this route is willing to touch; upserting it would
  // create a row of defaults and stamp `answered_at` on a business
  // nobody answered for.
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  const { error } = await service.from("business_listing_facts").upsert(
    {
      dealership_id: dealershipId,
      ...patch,
      // WHO ANSWERED, AND WHEN. These facts are published as
      // machine-readable statements about a real business and the
      // interview runs without a person checking it, so "the owner
      // typed this on this day" is the difference between a fact and a
      // value that appeared. 'owner' is the only value written: there
      // is no model path into this table.
      answered_by: "owner",
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dealership_id" }
  );

  if (error) {
    console.error(`[listing-facts] could not save for ${dealershipId}: ${error.message}`);
    return NextResponse.json({ error: "Could not save that just now." }, { status: 500 });
  }

  // THE SAVED ROW, READ BACK. The screen shows what the database holds
  // rather than what it hoped it sent — `opening_hours` is normalised on
  // the way in, so an interval the reader refuses is visibly absent
  // instead of appearing to have been saved.
  const { data: saved } = await service
    .from("business_listing_facts")
    .select("*")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  return NextResponse.json({ ok: true, saved: saved ?? null });
}
