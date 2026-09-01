import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { encryptedWrite, RAZORPAY_SECRET_SELECT } from "@/lib/crypto/commerceSecrets";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Never return the key secret to the client — only whether one is
  // set, and the key id (Razorpay's own publishable identifier, safe
  // to show/edit).
  // Checks BOTH columns for existence rather than decrypting: whether a
  // secret is set is answerable without reading its value, and this
  // endpoint has no business decrypting one.
  const { data: dealership } = await supabase
    .from("dealerships")
    .select(`razorpay_key_id, ${RAZORPAY_SECRET_SELECT}`)
    .eq("id", profile.dealership_id)
    .single();
  return NextResponse.json({
    keyId: dealership?.razorpay_key_id ?? "",
    hasSecret: Boolean(dealership?.razorpay_key_secret_encrypted || dealership?.razorpay_key_secret),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { keyId, keySecret } = await request.json();
  const update: Record<string, any> = {};
  if (keyId !== undefined) update.razorpay_key_id = String(keyId).trim() || null;
  // Only overwrite the secret if a new one was actually typed — lets
  // the dealer update just the key id without being forced to
  // re-paste the secret every time.
  // Encrypted on write, and the plaintext column is nulled in the same
  // statement — so from this deploy forward no new secret is ever
  // stored in the clear, regardless of when the backfill runs.
  if (keySecret !== undefined && String(keySecret).trim()) {
    Object.assign(update, encryptedWrite("razorpay_key_secret", String(keySecret).trim()));
  }

  const { error } = await supabase.from("dealerships").update(update).eq("id", profile.dealership_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
