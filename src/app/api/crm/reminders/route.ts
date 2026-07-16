import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [{ data: staleLeads }, { data: todaysAppointments }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, phone, status, lead_temperature, created_at")
      .eq("dealership_id", dealershipId)
      .in("status", ["new", "ready_to_call"])
      .lt("created_at", twoDaysAgo)
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("appointments")
      .select("id, appointment_date, appointment_type, leads(name, phone)")
      .eq("dealership_id", dealershipId)
      .eq("status", "scheduled")
      .gte("appointment_date", todayStart.toISOString())
      .lte("appointment_date", todayEnd.toISOString())
      .order("appointment_date", { ascending: true }),
  ]);

  return NextResponse.json({
    staleLeads: staleLeads ?? [],
    todaysAppointments: todaysAppointments ?? [],
  });
}
