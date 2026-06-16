import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateSeedLeads, generateSeedCalls, generateSeedAppointments } from "@/lib/seed-data";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealershipId } = await request.json();
  if (!dealershipId) return NextResponse.json({ error: "dealershipId required" }, { status: 400 });

  // Check if already seeded
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("dealership_id", dealershipId);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ message: "Already seeded", skipped: true });
  }

  // Insert leads
  const seedLeads = generateSeedLeads(dealershipId);
  const { data: insertedLeads, error: leadsError } = await supabase
    .from("leads")
    .insert(seedLeads)
    .select("id");

  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });

  const leadIds = (insertedLeads ?? []).map((l) => l.id);

  // Insert calls
  const seedCalls = generateSeedCalls(leadIds, dealershipId);
  await supabase.from("calls").insert(seedCalls);

  // Insert appointments
  const seedAppointments = generateSeedAppointments(leadIds, dealershipId);
  await supabase.from("appointments").insert(seedAppointments);

  return NextResponse.json({
    success: true,
    leads: leadIds.length,
    calls: seedCalls.length,
    appointments: seedAppointments.length,
  });
}
