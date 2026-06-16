import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dealershipId = searchParams.get("dealership_id");
  if (!dealershipId) return NextResponse.json({ error: "dealership_id required" }, { status: 400 });

  const [{ data: leads }, { data: calls }, { data: appointments }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId),
  ]);

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l) => l.lead_temperature === "hot").length ?? 0;
  const warmLeads = leads?.filter((l) => l.lead_temperature === "warm").length ?? 0;
  const coldLeads = leads?.filter((l) => l.lead_temperature === "cold").length ?? 0;

  return NextResponse.json({
    totalLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    totalCalls: calls?.length ?? 0,
    totalAppointments: appointments?.length ?? 0,
    qualificationRate: totalLeads > 0 ? Math.round(((hotLeads + warmLeads) / totalLeads) * 100) : 0,
    hotLeadPercentage: totalLeads > 0 ? Math.round((hotLeads / totalLeads) * 100) : 0,
    appointmentRate: totalLeads > 0 ? Math.round(((appointments?.length ?? 0) / totalLeads) * 100) : 0,
  });
}
