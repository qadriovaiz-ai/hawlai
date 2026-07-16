import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: dealership } = await supabase.from("dealerships").select("id, dealership_name").eq("booking_slug", slug).maybeSingle();
  if (!dealership) return NextResponse.json({ error: "Booking page not found" }, { status: 404 });

  // Next 7 days, hourly slots 10am-6pm, minus already-booked ones.
  const { data: existing } = await supabase
    .from("appointments")
    .select("appointment_date")
    .eq("dealership_id", dealership.id)
    .eq("status", "scheduled")
    .gte("appointment_date", new Date().toISOString());

  const bookedTimes = new Set((existing ?? []).map((a: any) => new Date(a.appointment_date).toISOString()));

  const slots: string[] = [];
  const now = new Date();
  for (let day = 0; day < 7; day++) {
    for (let hour = 10; hour <= 18; hour++) {
      const slot = new Date(now);
      slot.setDate(now.getDate() + day);
      slot.setHours(hour, 0, 0, 0);
      if (slot <= now) continue;
      if (bookedTimes.has(slot.toISOString())) continue;
      slots.push(slot.toISOString());
    }
  }

  return NextResponse.json({ dealershipName: dealership.dealership_name, slots });
}

export async function POST(request: Request) {
  const { slug, name, phone, email, appointmentDate, notes } = await request.json();
  if (!slug || !name || !phone || !appointmentDate) {
    return NextResponse.json({ error: "slug, name, phone, and appointmentDate are required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: dealership } = await supabase.from("dealerships").select("id").eq("booking_slug", slug).maybeSingle();
  if (!dealership) return NextResponse.json({ error: "Booking page not found" }, { status: 404 });

  // Match an existing lead by phone, otherwise create one so this
  // booking shows up in the normal Leads/Pipeline flow.
  let leadId: string;
  const { data: existingLead } = await supabase.from("leads").select("id").eq("dealership_id", dealership.id).eq("phone", phone).maybeSingle();
  if (existingLead) {
    leadId = existingLead.id;
  } else {
    const { data: newLead, error: leadError } = await supabase
      .from("leads")
      .insert({ dealership_id: dealership.id, name, phone, email: email ?? null, source: "booking_page", status: "appointment_set" })
      .select("id")
      .single();
    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
    leadId = newLead.id;
  }

  const { error: apptError } = await supabase.from("appointments").insert({
    lead_id: leadId,
    dealership_id: dealership.id,
    appointment_date: appointmentDate,
    appointment_type: "meeting",
    notes: notes ?? null,
  });
  if (apptError) return NextResponse.json({ error: apptError.message }, { status: 500 });

  await supabase.from("leads").update({ status: "appointment_set" }).eq("id", leadId);

  return NextResponse.json({ success: true });
}
