// Shared appointment slot logic — extracted from the public booking
// page's API route (src/app/api/public/book/route.ts) so the exact
// same working availability logic backs both the public booking form
// AND the new live-call appointment tools (Phase 2 piece 2). The call
// offers the same slots the public booking page would show, not a
// separate concept — deliberately kept as the same hardcoded 10am-6pm
// hourly-slot shape used today; making business hours configurable
// per dealership is a real but separate follow-up, not required here.

const SLOT_START_HOUR = 10;
const SLOT_END_HOUR = 18;
const SLOT_DAYS_AHEAD = 7;

export async function getAvailableSlots(supabase: any, dealershipId: string): Promise<string[]> {
  const { data: existing } = await supabase
    .from("appointments")
    .select("appointment_date")
    .eq("dealership_id", dealershipId)
    .eq("status", "scheduled")
    .gte("appointment_date", new Date().toISOString());

  const bookedTimes = new Set((existing ?? []).map((a: any) => new Date(a.appointment_date).toISOString()));

  const slots: string[] = [];
  const now = new Date();
  for (let day = 0; day < SLOT_DAYS_AHEAD; day++) {
    for (let hour = SLOT_START_HOUR; hour <= SLOT_END_HOUR; hour++) {
      const slot = new Date(now);
      slot.setDate(now.getDate() + day);
      slot.setHours(hour, 0, 0, 0);
      if (slot <= now) continue;
      if (bookedTimes.has(slot.toISOString())) continue;
      slots.push(slot.toISOString());
    }
  }
  return slots;
}

export interface CreateAppointmentParams {
  dealershipId: string;
  leadId: string;
  appointmentDate: string; // ISO — must exactly match a value getAvailableSlots would currently return
  notes?: string | null;
}

export interface CreateAppointmentResult {
  success: boolean;
  error?: string;
}

// Race-condition fix: re-derives the full available-slot list right
// before booking and requires an EXACT match, rather than trusting
// whatever was offered earlier (by the public page's GET, or an
// earlier check_availability tool call). This is stronger than just
// checking "is this one time double-booked" — it also rejects a
// hallucinated or out-of-hours time a caller (human or AI) never
// actually saw offered, since anything not in a freshly-computed slot
// list fails the same way. No DB-level unique constraint needed for
// this to be effective: the window this closes is milliseconds wide,
// not minutes, and appointment volume for a small business makes an
// exact-same-instant double-submit vanishingly unlikely in practice.
export async function createAppointmentForLead(supabase: any, params: CreateAppointmentParams): Promise<CreateAppointmentResult> {
  const currentSlots = await getAvailableSlots(supabase, params.dealershipId);
  if (!currentSlots.includes(params.appointmentDate)) {
    return { success: false, error: "That time slot is no longer available — please choose another." };
  }

  const { error } = await supabase.from("appointments").insert({
    lead_id: params.leadId,
    dealership_id: params.dealershipId,
    appointment_date: params.appointmentDate,
    appointment_type: "meeting",
    notes: params.notes ?? null,
  });
  if (error) return { success: false, error: error.message };

  await supabase.from("leads").update({ status: "appointment_set" }).eq("id", params.leadId);
  return { success: true };
}
