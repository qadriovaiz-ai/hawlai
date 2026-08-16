import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getAvailableSlots, createAppointmentForLead } from "@/lib/appointments/appointmentSlots";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: dealership } = await supabase.from("dealerships").select("id, dealership_name").eq("booking_slug", slug).maybeSingle();
  if (!dealership) return NextResponse.json({ error: "Booking page not found" }, { status: 404 });

  const slots = await getAvailableSlots(supabase, dealership.id);
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

  const result = await createAppointmentForLead(supabase, { dealershipId: dealership.id, leadId, appointmentDate, notes });
  if (!result.success) {
    const status = result.error?.includes("no longer available") ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
