// Business Brain — live-call tool-calling dispatcher. Phase 1 built the
// framework (empty by design, provably inert — see git history for
// that commit's reasoning); Phase 2 piece 2 activated check_availability/
// create_appointment; Phase 2 piece 3 adds update_lead below.
//
// Safety contract for handleVapiToolCalls(): it NEVER throws and
// ALWAYS resolves to a well-formed { results: [...] } response — one
// entry per tool call Vapi asked for, even when the tool name is
// unknown, a handler throws, or the payload itself is malformed. An
// in-progress call has to keep going no matter what a tool does, so
// every failure mode here degrades to a spoken-safe fallback string
// instead of an error the assistant (or the caller) has no good way
// to react to. This wraps EVERY handler call below — neither
// appointment handler needs its own try/catch, a network failure or
// thrown error from either one is already caught here and turned into
// UNAVAILABLE_RESULT.

import { getAvailableSlots, createAppointmentForLead } from "../appointments/appointmentSlots";

export interface ToolCallContext {
  supabase: any;
  dealershipId: string;
  leadId?: string | null;
}

type ToolHandler = (args: Record<string, any>, ctx: ToolCallContext) => Promise<string>;

async function handleCheckAvailability(_args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  const slots = await getAvailableSlots(ctx.supabase, ctx.dealershipId);
  if (slots.length === 0) {
    return "No appointment slots are available in the next 7 days. Let the caller know a team member will call back to find a time.";
  }
  // Soonest 8 only — reading all ~60 possible weekly slots into a
  // voice conversation would be unusable; a caller wants "what's
  // soonest," not an exhaustive list.
  const soonest = slots.slice(0, 8);
  const readable = soonest
    .map((iso) => `${new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} (exact value to use if booking: ${iso})`)
    .join("; ");
  return `Available slots, soonest first: ${readable}. Offer 2-3 of these naturally in conversation, don't read the whole list. To book, call create_appointment with the exact ISO value shown for the slot the caller picks — never alter or guess it.`;
}

async function handleCreateAppointment(args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  if (!ctx.leadId) {
    return "Can't book an appointment — no caller record exists for this call. Let them know a team member will call back to schedule.";
  }
  const appointmentDate = String(args?.appointmentDate ?? "");
  if (!appointmentDate) {
    return "No time was specified. Ask the caller which time works, using a value from check_availability, then try again.";
  }
  const result = await createAppointmentForLead(ctx.supabase, {
    dealershipId: ctx.dealershipId,
    leadId: ctx.leadId,
    appointmentDate,
    notes: typeof args?.notes === "string" ? args.notes : null,
  });
  if (!result.success) {
    return `Couldn't book that time: ${result.error} Call check_availability again for a fresh list and offer the caller a different time.`;
  }
  const readable = new Date(appointmentDate).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  return `Booked successfully. Confirm to the caller: their appointment is set for ${readable}.`;
}

// Deliberately narrower than leads' full schema — a live call can
// record what it just learned, not re-litigate the funnel. "converted"
// is excluded on purpose (explicit decision): that transition has real
// downstream implications (deal closed, reporting, billing-adjacent
// context) and stays human-only. assigned_to/consent/DND fields aren't
// here either — those belong to their own dedicated flows, not a
// call's own tool.
const LEAD_STATUS_ALLOWED = ["new", "ready_to_call", "appointment_set", "not_interested"] as const;

async function handleUpdateLead(args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  if (!ctx.leadId) {
    return "Can't update the CRM — no caller record exists for this call.";
  }

  const update: Record<string, any> = {};
  if (typeof args?.status === "string") {
    if (!(LEAD_STATUS_ALLOWED as readonly string[]).includes(args.status)) {
      return `"${args.status}" can't be set from a call — allowed values are ${LEAD_STATUS_ALLOWED.join(", ")}. Marking a lead "converted" needs a team member's review, not this tool.`;
    }
    update.status = args.status;
  }
  if (typeof args?.budget === "number") update.budget = args.budget;
  if (typeof args?.vehicle === "string" && args.vehicle.trim()) update.vehicle = args.vehicle.trim();
  if (typeof args?.purchaseYear === "number") update.purchase_year = args.purchaseYear;
  if (typeof args?.dealValue === "number") update.deal_value = args.dealValue;
  const notes = typeof args?.notes === "string" ? args.notes.trim() : "";

  if (Object.keys(update).length === 0 && !notes) {
    return "Nothing to update — no valid fields were given.";
  }

  if (Object.keys(update).length > 0) {
    const { error } = await ctx.supabase.from("leads").update(update).eq("id", ctx.leadId);
    if (error) return `Couldn't update the lead: ${error.message}`;
  }

  if (notes) {
    // Best-effort, same as business_memory/notifications elsewhere in
    // this codebase — a note-insert hiccup shouldn't undo an otherwise
    // successful field update or block the call from continuing.
    try {
      await ctx.supabase.from("lead_notes").insert({ lead_id: ctx.leadId, dealership_id: ctx.dealershipId, note: notes, created_by: null });
    } catch {
      // swallow
    }
  }

  return "Lead updated successfully.";
}

// Keyed by tool name, matching BUSINESS_BRAIN_TOOLS's `name` field in
// toolRegistry.ts.
const CALL_TOOL_HANDLERS: Record<string, ToolHandler> = {
  check_availability: handleCheckAvailability,
  create_appointment: handleCreateAppointment,
  update_lead: handleUpdateLead,
};

interface VapiToolCall {
  id: string;
  type?: string;
  function?: { name: string; arguments?: Record<string, any> | string };
}

interface ToolCallResultsResponse {
  results: { toolCallId: string; result: string }[];
}

// A tool call that can't be fulfilled still gets a real, spoken-safe
// result string — not an HTTP error — so the assistant can tell the
// caller something sensible ("a team member will follow up on that")
// instead of the call stalling on a malformed or missing response.
const UNAVAILABLE_RESULT = "This action isn't available right now — let the caller know a team member will follow up on it.";

export async function handleVapiToolCalls(message: any, ctx: ToolCallContext): Promise<ToolCallResultsResponse> {
  try {
    const toolCalls: VapiToolCall[] = message?.toolCallList ?? message?.toolCalls ?? [];
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return { results: [] };

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const toolCallId = call?.id ?? "";
        const name = call?.function?.name;
        if (!toolCallId) return null; // can't return a result Vapi can match to a call it made
        if (!name || !CALL_TOOL_HANDLERS[name]) return { toolCallId, result: UNAVAILABLE_RESULT };

        try {
          const rawArgs = call.function?.arguments;
          const args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : (rawArgs ?? {});
          const result = await CALL_TOOL_HANDLERS[name](args, ctx);
          return { toolCallId, result };
        } catch (err: any) {
          console.error(`[vapi-tool-call] handler for "${name}" failed:`, err.message);
          return { toolCallId, result: UNAVAILABLE_RESULT };
        }
      })
    );

    return { results: results.filter((r): r is { toolCallId: string; result: string } => r !== null) };
  } catch (err: any) {
    // Payload was malformed enough that we couldn't even extract
    // toolCallIds — still return a validly-shaped (if empty) response
    // rather than letting this throw turn into a 500 the live call
    // would otherwise be left waiting on.
    console.error("[vapi-tool-call] handleVapiToolCalls failed entirely:", err.message);
    return { results: [] };
  }
}
