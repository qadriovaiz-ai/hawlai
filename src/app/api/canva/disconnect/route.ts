import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Removes the stored Canva connection.
//
// Deletes the tokens only — canva_designs rows and the exported files
// already copied into Storage are left alone. Disconnecting an account
// shouldn't destroy work the customer already made and may be using in
// live ads; reconnecting later brings the history straight back.
//
// This revokes nothing on Canva's side, and the UI says so rather than
// implying we've cut access there.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("canva_connections").delete().eq("user_id", user.id);
  if (error) {
    console.error("[canva] disconnect failed:", error.message);
    return NextResponse.json({ error: "Couldn't disconnect Canva." }, { status: 500 });
  }

  return NextResponse.json({ connected: false });
}
