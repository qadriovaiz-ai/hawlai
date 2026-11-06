// What is running on its own, for the owner's own business — S7/P6.
//
// READ-ONLY, AND THERE IS NO WRITE HERE ON PURPOSE. A level is raised
// in exactly one place — /api/approvals/[id], when the owner approves
// the card that showed him the evidence — and lowered by S7/P3 without
// asking anyone. A PATCH on this route would be a third way to change a
// permission, which is the shape every bypass in this codebase has had.
//
// Taking one AWAY from this screen would be legitimate (rule 6: the
// safe direction is never the slow one) and it is deliberately not here
// yet: it needs its own card in the UI and its own test, and shipping
// the read first means the owner can SEE what he has granted before he
// has anything to undo.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business on this account." }, { status: 400 });

  // THE OWNER'S OWN CLIENT, not the service role. Every table this
  // reads has RLS scoped to `dealership_id in (select id from
  // dealerships where owner_id = auth.uid())`, so the request cannot
  // see another business's levels even if the id above were wrong.
  const { autonomyOverview } = await import("@/lib/autonomy/overview");
  const overview = await autonomyOverview(supabase, dealershipId);
  return NextResponse.json(overview);
}
