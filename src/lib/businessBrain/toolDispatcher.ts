// Business Brain — live-call tool-calling dispatcher. Phase 1 built the
// framework (empty by design, provably inert — see git history for
// that commit's reasoning); Phase 2 activated check_availability/
// create_appointment/update_lead; Phase 3 piece 1 added
// check_order_status; Phase 3 piece 2 adds escalate_to_human below.
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
import { emitNotification } from "../notifications/emit";
import { logAuditEvent } from "../audit/logAuditEvent";

export interface ToolCallContext {
  supabase: any;
  dealershipId: string;
  leadId?: string | null;
  vapiCallId?: string | null; // Vapi's own call id (message.call.id) — used only to build a stable dedupe key
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

function lastTenDigits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

// orders.customer_phone is stored exactly as the customer typed it at
// checkout — no format is enforced (confirmed against the existing
// verified-reviews route, which does a plain trimmed exact match and
// inherits the same limitation). A live call can't afford that: a
// real customer with a differently-formatted number (+91 vs bare 10
// digits vs spaces) would wrongly hear "no order found." Matching by
// normalized last-10-digits in JS, not a SQL pattern match, handles
// any separator/format the customer used. Bounded to the 200 most
// recent orders for this dealership — comfortably covers a small
// business's real order volume without an unbounded scan.
async function handleCheckOrderStatus(_args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  if (!ctx.leadId) {
    return "Can't look up an order — no caller record exists for this call.";
  }

  const { data: lead } = await ctx.supabase.from("leads").select("phone").eq("id", ctx.leadId).maybeSingle();
  const leadDigits = lead?.phone ? lastTenDigits(String(lead.phone)) : "";
  if (!leadDigits) {
    return "No phone number is on file for this caller, so an order can't be looked up. Let them know a team member will check manually.";
  }

  const { data: candidates } = await ctx.supabase
    .from("orders")
    .select("id, status, payment_status, total, items, customer_phone, created_at")
    .eq("dealership_id", ctx.dealershipId)
    .order("created_at", { ascending: false })
    .limit(200);

  const orders = (candidates ?? [])
    .filter((o: any) => lastTenDigits(String(o.customer_phone ?? "")) === leadDigits)
    .slice(0, 3);

  if (orders.length === 0) {
    return "No orders found for this caller's phone number. Let them know a team member will look into it.";
  }

  // Includes each order's real id — if the caller has a complaint
  // about one of these, log_complaint's relatedOrderId takes this
  // exact value, same "echo the exact value back" pattern used for
  // create_appointment's time slots.
  const summary = orders
    .map((o: any) => {
      const itemNames = (o.items ?? []).map((it: any) => it.name).filter(Boolean).join(", ");
      const date = new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      return `${date}: ${itemNames || "order"}, total ₹${o.total}, status "${o.status}", payment "${o.payment_status}" (order id: ${o.id})`;
    })
    .join("; ");

  return `Found ${orders.length} recent order(s) for this caller: ${summary}. Share the relevant details naturally — don't read the order id aloud, just keep it in mind if the caller has a complaint about one of these.`;
}

// Callback-promise escalation, not a live transfer (explicit decision
// — true telephony transfer has no phone number to target and no live
// inbound scenario yet, see migration 122's header). The only context
// available at this point is whatever the model puts in `reason` —
// the full transcript doesn't exist until end-of-call-report — so the
// tool description instructs the model to be thorough. dedupeKey is
// keyed on the Vapi call id, not Date.now(), so if the model calls
// this more than once in the same call (e.g. retrying after a
// transient failure) it collapses into one notification rather than
// spamming the owner.
async function handleEscalateToHuman(args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  const reason = typeof args?.reason === "string" ? args.reason.trim() : "";
  if (!reason) {
    return "Explain why you're escalating before calling this tool — what the caller needs and what's been discussed so far.";
  }

  let leadName = "Unknown caller";
  if (ctx.leadId) {
    const { data: lead } = await ctx.supabase.from("leads").select("name").eq("id", ctx.leadId).maybeSingle();
    if (lead?.name) leadName = lead.name;
  }

  await emitNotification(ctx.supabase, {
    dealershipId: ctx.dealershipId,
    kind: "call_escalated",
    title: `Call needs a human: ${leadName}`,
    body: reason,
    href: ctx.leadId ? `/dashboard/leads/${ctx.leadId}` : null,
    dedupeKey: `call_escalated:${ctx.vapiCallId ?? ctx.leadId ?? "unknown"}`,
  });

  return "Escalation logged — a team member has been alerted with this context. Tell the caller warmly that you're arranging for someone to call them back shortly with everything discussed, thank them, and end the call naturally. Don't keep trying to resolve it yourself past this point.";
}

// A real, trackable record (complaints table) rather than only the
// post-call scoring agent's one-line guess — captures the caller's
// actual specifics while they're still on the line. Distinct from
// escalate_to_human: a complaint is about what went wrong and can
// coexist with a call that otherwise continues normally; it doesn't
// end the call by itself. Reuses the existing call_needs_follow_up
// notification kind rather than adding another one — semantically it
// already fits "something needs follow-up," and avoids a migration
// for this piece beyond the complaints table itself. dedupeKey is the
// complaint's own freshly-inserted id, not the call/lead — two
// distinct complaints logged in the same call are two real events,
// not the same one retried, so they should each get their own alert.
async function handleLogComplaint(args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  if (!ctx.leadId) {
    return "Can't log a complaint — no caller record exists for this call.";
  }
  const description = typeof args?.description === "string" ? args.description.trim() : "";
  if (!description) {
    return "Describe the complaint in the caller's own specifics — what went wrong, when, any details given — before calling this tool again.";
  }

  // A wrong/hallucinated order id must never sink an otherwise-valid
  // complaint — unlike request_refund (where an unresolved order is a
  // hard stop, since there's nothing to refund), the complaint itself
  // still has real value with no order attached. Re-validated against
  // this dealership the same way request_refund validates its own
  // orderId, but failure here degrades to order_id: null rather than
  // rejecting the whole complaint.
  const rawRelatedOrderId = typeof args?.relatedOrderId === "string" && args.relatedOrderId.trim() ? args.relatedOrderId.trim() : null;
  let relatedOrderId: string | null = null;
  if (rawRelatedOrderId) {
    const { data: relatedOrder } = await ctx.supabase.from("orders").select("id").eq("id", rawRelatedOrderId).eq("dealership_id", ctx.dealershipId).maybeSingle();
    relatedOrderId = relatedOrder?.id ?? null;
  }

  let callId: string | null = null;
  if (ctx.vapiCallId) {
    const { data: callRow } = await ctx.supabase.from("calls").select("id").eq("vapi_call_id", ctx.vapiCallId).maybeSingle();
    callId = callRow?.id ?? null;
  }

  const { data: inserted, error } = await ctx.supabase
    .from("complaints")
    .insert({ dealership_id: ctx.dealershipId, lead_id: ctx.leadId, call_id: callId, order_id: relatedOrderId, description })
    .select("id")
    .single();
  if (error) return `Couldn't log the complaint: ${error.message}`;

  await emitNotification(ctx.supabase, {
    dealershipId: ctx.dealershipId,
    kind: "call_needs_follow_up",
    title: "Complaint logged on a call",
    body: description,
    href: "/dashboard/complaints",
    dedupeKey: `complaint:${inserted.id}`,
  });

  return "Complaint logged and a team member has been alerted. Reassure the caller it's been recorded and will be looked into, then continue the call naturally — this doesn't need to end the call.";
}

// Real money never moves from this tool. It only ever inserts a
// refund_requests row with status "requested" — the actual Razorpay
// refund call lives in /api/refunds's PATCH handler (approve action
// only, dashboard-only, human-triggered). The result string is
// deliberately explicit that nothing is confirmed yet, since an AI
// telling a caller "your refund is done" when it isn't would be a
// real, damaging mistake — this is the one tool result in the whole
// build where getting the wording exactly right matters most.
async function handleRequestRefund(args: Record<string, any>, ctx: ToolCallContext): Promise<string> {
  if (!ctx.leadId) {
    return "Can't submit a refund request — no caller record exists for this call.";
  }
  const orderId = typeof args?.orderId === "string" ? args.orderId.trim() : "";
  if (!orderId) {
    return "You need the order's exact id from check_order_status before requesting a refund for it — look it up first.";
  }
  const reason = typeof args?.reason === "string" ? args.reason.trim() : "";
  if (!reason) {
    return "Explain why the caller wants a refund before calling this tool again.";
  }

  const { data: order } = await ctx.supabase
    .from("orders")
    .select("id, total, payment_status")
    .eq("id", orderId)
    .eq("dealership_id", ctx.dealershipId)
    .maybeSingle();
  if (!order) {
    return "That order wasn't found for this business — double-check the order id from check_order_status.";
  }
  if (order.payment_status !== "paid") {
    return "This order was never marked as paid online, so there's nothing to refund through this tool. Let the caller know a team member will look into it manually.";
  }

  const requestedAmount = typeof args?.amount === "number" && args.amount > 0 && args.amount <= order.total ? args.amount : order.total;

  let callId: string | null = null;
  if (ctx.vapiCallId) {
    const { data: callRow } = await ctx.supabase.from("calls").select("id").eq("vapi_call_id", ctx.vapiCallId).maybeSingle();
    callId = callRow?.id ?? null;
  }

  const { data: inserted, error } = await ctx.supabase
    .from("refund_requests")
    .insert({
      dealership_id: ctx.dealershipId,
      order_id: order.id,
      lead_id: ctx.leadId,
      call_id: callId,
      reason,
      requested_amount: requestedAmount,
      requested_via: "call",
    })
    .select("id")
    .single();
  if (error) return `Couldn't submit the refund request: ${error.message}`;

  await emitNotification(ctx.supabase, {
    dealershipId: ctx.dealershipId,
    kind: "refund_requested",
    title: `Refund requested — ₹${requestedAmount}`,
    body: reason,
    href: "/dashboard/refunds",
    dedupeKey: `refund_requested:${inserted.id}`,
  });

  return "Refund request submitted for a team member's review. This is NOT processed and no money has moved yet. Tell the caller their request has been logged and a team member will review and process it — never say the refund is done, confirmed, or that money has been sent.";
}

// Keyed by tool name, matching BUSINESS_BRAIN_TOOLS's `name` field in
// toolRegistry.ts.
const CALL_TOOL_HANDLERS: Record<string, ToolHandler> = {
  check_availability: handleCheckAvailability,
  create_appointment: handleCreateAppointment,
  update_lead: handleUpdateLead,
  check_order_status: handleCheckOrderStatus,
  log_complaint: handleLogComplaint,
  escalate_to_human: handleEscalateToHuman,
  request_refund: handleRequestRefund,
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
          // P0 30b — live-call tools are one of the highest-value audit
          // sources: a real, fully-autonomous action taken on a call
          // with no human review before it happens.
          await logAuditEvent(ctx.supabase, {
            dealershipId: ctx.dealershipId,
            actor: `vapi_call_tool:${name}`,
            eventType: "call_tool_executed",
            resourceType: ctx.leadId ? "lead" : undefined,
            resourceId: ctx.leadId ?? undefined,
            summary: `AI call executed ${name} — ${result.slice(0, 140)}`,
            details: { toolName: name, args, vapiCallId: ctx.vapiCallId ?? null },
          });
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
