import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, email, ai_score, lead_temperature, status, source")
    .eq("dealership_id", dealershipId);

  const all = leads ?? [];
  const withEmail = all.filter((l) => l.email);

  const byTemperature: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const l of all) {
    byTemperature[l.lead_temperature ?? "cold"] = (byTemperature[l.lead_temperature ?? "cold"] ?? 0) + 1;
    byStatus[l.status ?? "new"] = (byStatus[l.status ?? "new"] ?? 0) + 1;
    bySource[l.source ?? "unknown"] = (bySource[l.source ?? "unknown"] ?? 0) + 1;
  }

  return NextResponse.json({
    totalLeads: all.length,
    emailableLeads: withEmail.length,
    byTemperature,
    byStatus,
    bySource,
  });
}
