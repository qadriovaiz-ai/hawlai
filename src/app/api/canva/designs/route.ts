import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Design history for the signed-in user.
//
// Uses the session client, NOT the service-role client: canva_designs
// is protected by RLS (auth.uid() = user_id, migration 158), and going
// through the session client means that policy is doing the filtering.
// A service-role query would bypass RLS and leave correctness resting
// on remembering the .eq("user_id", ...) — exactly the kind of filter
// that gets dropped during a later refactor and silently leaks every
// user's designs.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("canva_designs")
    .select("id, canva_design_id, title, asset_type, exported_asset_url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[canva] design history query failed:", error.message);
    return NextResponse.json({ error: "Couldn't load your designs." }, { status: 500 });
  }

  return NextResponse.json({ designs: data ?? [] });
}
