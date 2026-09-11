import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { razorpayOAuthAccessToken } from "@/lib/crypto/commerceSecrets";
import { revokeRazorpayToken } from "@/lib/payments/razorpayOAuth";
import { clearedConnectionWrite } from "@/lib/payments/razorpayConnection";

// Turns off Pay Online: revokes Hawlai's access at Razorpay (Connect
// Razorpay only) and clears every stored Razorpay credential, pasted
// keys included. Orders and refund history are left alone.
//
// Revoking comes first — once the tokens are cleared there's nothing
// left to revoke with. Whether Razorpay confirmed it is reported, not
// assumed.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "Your account isn't linked to a business yet." }, { status: 400 });

  const { data: row, error } = await supabase.from("dealerships").select("*").eq("id", dealershipId).maybeSingle();
  if (error || !row) {
    if (error) console.error("[razorpay-disconnect] load failed:", error.message);
    return NextResponse.json({ error: "Couldn't disconnect Razorpay. Nothing was changed — try again." }, { status: 500 });
  }

  const access = razorpayOAuthAccessToken(row);
  const revokedAtRazorpay = access ? await revokeRazorpayToken(access) : null;

  const { error: saveError } = await supabase.from("dealerships").update(clearedConnectionWrite(row)).eq("id", dealershipId);
  if (saveError) {
    console.error("[razorpay-disconnect] clear failed:", saveError.message);
    return NextResponse.json({ error: "Couldn't disconnect Razorpay. Try again." }, { status: 500 });
  }

  return NextResponse.json({ connected: false, revokedAtRazorpay });
}
