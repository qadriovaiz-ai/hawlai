import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getDealershipPlanLimits } from "@/lib/plans";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const planLimits = await getDealershipPlanLimits(supabase, profile.dealership_id);

  return NextResponse.json({ planLimits });
}
