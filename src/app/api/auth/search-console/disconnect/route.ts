import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { tokenClear } from "@/lib/crypto/oauthSecrets";

/**
 * Disconnecting clears the stored tokens here and tells the owner to
 * remove Hawlai's access at Google too.
 *
 * Deliberately does NOT revoke on Google's side for them: revoking that
 * grant can take other Google connections with it, since Gmail, YouTube,
 * Ads and this share one OAuth app. Silently breaking their email
 * automation while they thought they were unhooking Search Console would
 * be the worse outcome.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business" }, { status: 400 });

  const { error } = await supabase
    .from("dealerships")
    .update({ ...tokenClear("search_console"), search_console_site_url: null, search_console_email: null, search_console_token_expiry: null })
    .eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    note: "Search Console is disconnected here. Hawlai's access is still listed in your Google account — remove it at myaccount.google.com/permissions if you want it gone there too.",
  });
}
