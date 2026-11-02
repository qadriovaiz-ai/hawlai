// CREATING THE BUSINESS RECORD, AFTER THE EMAIL IS VERIFIED — Q2.
//
// WHY THIS MOVED OUT OF THE SIGNUP PAGE. Signup used to create the
// dealership in the browser immediately after `signUp`, using the
// session that call returned. With email verification ON, `signUp`
// returns a user and NO SESSION: `auth.uid()` is null, the RLS policy
// `dealerships_owner_all` refuses the row, and the new customer gets a
// policy error on the one screen they cannot get past. So the record is
// created after `verifyOtp` instead, which is the call that hands back
// a session.
//
// STILL THE USER'S OWN SESSION. No service client, no new route, no RLS
// exception — the only thing that changed is WHEN it runs.
//
// AND IT IS IDEMPOTENT NOW, WHICH IT WAS NOT. Nothing stopped a
// double-press or a refresh creating a second dealership for the same
// owner, and a verification screen in the middle gives that more time
// to happen. A business that exists is used rather than duplicated.
//
// home_dealership_id IS FILLED ONLY WHEN EMPTY. Its own comment in the
// old signup page says it is "set once here and never touched again" —
// it is what lets /api/agency/switch repoint dealership_id to a client
// team's business and still know how to get back. Writing it on every
// call would undo that for an agency that had switched.

import { PLACEHOLDER_BUSINESS_NAME } from "@/lib/onboarding/signup";

export type BusinessResult =
  | { ok: true; dealershipId: string; created: boolean }
  | { ok: false; error: string };

export async function ensureBusinessForOwner(
  supabase: any,
  user: { id: string; fullName?: string | null }
): Promise<BusinessResult> {
  // ALREADY THERE? USE IT. A failed READ is not "there is none": acting
  // on that would create a second business for an owner who has one,
  // and nothing downstream knows which of the two is his.
  const { data: existing, error: readError } = await supabase
    .from("dealerships")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (readError) return { ok: false, error: readError.message };

  const found = Array.isArray(existing) ? existing[0] : null;
  if (found?.id) {
    const linked = await linkProfile(supabase, user, String(found.id));
    if (!linked.ok) return linked;
    return { ok: true, dealershipId: String(found.id), created: false };
  }

  const { data: created, error: insertError } = await supabase
    .from("dealerships")
    .insert({
      // A STAND-IN, because dealerships.dealership_name is `not null`
      // (001_schema.sql:15) and the name is collected by onboarding
      // step 3. Three chokepoints keep it from leaving the product —
      // see lib/onboarding/signup.ts.
      dealership_name: PLACEHOLDER_BUSINESS_NAME,
      owner_id: user.id,
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };
  if (!created?.id) return { ok: false, error: "Could not create your business record" };

  const linked = await linkProfile(supabase, user, String(created.id));
  if (!linked.ok) return linked;

  return { ok: true, dealershipId: String(created.id), created: true };
}

/**
 * Point the profile at the business.
 *
 * A PROFILE THAT IS NOT LINKED IS AN ACCOUNT THAT CANNOT SEE ITS OWN
 * BUSINESS: resolveOnboardingState reads dealership_id from here, and
 * with it null the dashboard sends the owner back to login. So a failed
 * update is an error rather than something to shrug at — the old code
 * did not even check it.
 */
async function linkProfile(
  supabase: any,
  user: { id: string; fullName?: string | null },
  dealershipId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("home_dealership_id")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };

  const patch: Record<string, unknown> = { dealership_id: dealershipId };
  // ONLY WHEN EMPTY. See the note at the top of this file.
  if (!profile?.home_dealership_id) patch.home_dealership_id = dealershipId;
  const name = String(user.fullName ?? "").trim();
  if (name) patch.full_name = name;

  const { error: updateError } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}
