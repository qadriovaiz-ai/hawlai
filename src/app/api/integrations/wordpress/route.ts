// Connecting a WordPress site — and the credential is encrypted at rest.
//
// MIGRATION 238 is the one that closes this. Migration 160 encrypted the
// Razorpay secret, the Shopify access token and the WooCommerce consumer
// secret; `wordpress_app_password` came from migration 025 and nobody
// came back for it, so it stayed in plaintext while the others became
// ciphertext. An application password has no scopes — it carries its
// user's capabilities, and an administrator's is administrator access to
// the entire site. Found 22 November 2026 while sizing the WordPress
// work; fixed before any of that was built, at the owner's instruction.
//
// THE READ FAILS CLOSED, AND THAT IS WHAT MAKES THE DEPLOY ORDER SAFE.
// Selecting a column that does not exist is an error, not an empty
// value, so this route would throw on every call if the code shipped
// before the migration ran. It reports "not connected" instead and logs
// why. The owner sees the panel ask them to reconnect, which is true and
// which they can act on — rather than a 500 they cannot read. This is
// the same ordering lesson commerceSecrets.ts records for migration 160,
// which "was reported as run and had not been".
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { testWordPressConnection } from "@/lib/agents/wordpressAgent";
import { WORDPRESS_SECRET_SELECT, encryptedWrite, clearedWrite, wordpressAppPassword } from "@/lib/crypto/commerceSecrets";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data, error } = await supabase
    .from("dealerships")
    .select(`wordpress_site_url, wordpress_username, ${WORDPRESS_SECRET_SELECT}`)
    .eq("id", dealershipId)
    .single();
  if (error) {
    // Before migration 238 this is "column does not exist". After it,
    // anything here is a real read failure — and either way the honest
    // answer is that we cannot show a connection, never that there is
    // one. The message is logged, not returned: it names columns.
    console.error(`[wordpress] could not read the connection: ${error.message}`);
    return NextResponse.json({ connected: false });
  }
  // THE SECRET IS DECRYPTED TO ANSWER "is it connected?", rather than
  // testing the column for non-null. A ciphertext that will not decrypt
  // — a rotated key, a half-finished backfill — is not a usable
  // connection, and reporting it as one sends the owner to a WordPress
  // panel that then fails on every write.
  return NextResponse.json({ connected: !!(data?.wordpress_site_url && wordpressAppPassword(data)) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { site_url, username, app_password } = await request.json();
  if (!site_url || !username || !app_password) {
    return NextResponse.json({ error: "Site URL, Username, and Application Password are all required" }, { status: 400 });
  }

  const test = await testWordPressConnection(site_url, username, app_password);
  if (!test.success) return NextResponse.json({ error: test.error }, { status: 400 });

  // THE ERROR IS CHECKED, which it was not before. An unchecked update
  // on a credential save tells the owner "connected" over a row that
  // never changed — and they only find out when the first publish says
  // the site is not connected. That is the usage-log failure of
  // 27 September, where a swallowed error meant 90 days of recording
  // nothing, in the one place where the owner is handing over a
  // password.
  const { error: saveError } = await supabase
    .from("dealerships")
    .update({
      wordpress_site_url: site_url,
      wordpress_username: username,
      ...encryptedWrite("wordpress_app_password", app_password),
    })
    .eq("id", dealershipId);
  if (saveError) {
    console.error(`[wordpress] could not save the connection: ${saveError.message}`);
    return NextResponse.json(
      { error: "The site answered, but Hawlai could not save the connection. Nothing was stored — try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, siteName: test.siteName });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // DISCONNECTING IS NEVER THE SLOW PATH, so a failure here is reported
  // rather than swallowed — but the direction matters: a disconnect that
  // silently did nothing leaves a live credential in the database while
  // the owner believes they revoked it.
  const { error: clearError } = await supabase
    .from("dealerships")
    .update({
      wordpress_site_url: null,
      wordpress_username: null,
      ...clearedWrite("wordpress_app_password"),
    })
    .eq("id", dealershipId);
  if (clearError) {
    console.error(`[wordpress] could not disconnect: ${clearError.message}`);
    return NextResponse.json(
      { error: "Hawlai could not remove the connection. It is still stored — try again, and revoke the application password in WordPress as well." },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
