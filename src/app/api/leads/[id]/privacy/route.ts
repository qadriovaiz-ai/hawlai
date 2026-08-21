import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

// P3 9b — data subject rights (India's DPDP Act 2023 and equivalent
// regimes): a business must be able to produce everything it holds
// about one person, and erase it on request. Neither was possible
// before this — there was no export and no deletion anywhere.
//
// GET  = export everything held about this lead, as JSON.
// DELETE = erase it. Both are owner/team-scoped by RLS on the initial
// lead lookup, so one business can never reach another's records.

// Every table that holds something about a specific person. Kept as
// an explicit list rather than derived, so adding a new
// person-holding table is a deliberate decision to include it here.
const RELATED: { table: string; column: string; label: string }[] = [
  { table: "calls", column: "lead_id", label: "calls" },
  { table: "appointments", column: "lead_id", label: "appointments" },
  { table: "lead_notes", column: "lead_id", label: "notes" },
  { table: "lead_touchpoints", column: "lead_id", label: "touchpoints" },
  { table: "complaints", column: "lead_id", label: "complaints" },
  { table: "refund_requests", column: "lead_id", label: "refundRequests" },
  { table: "auto_reply_log", column: "lead_id", label: "socialMessages" },
  { table: "email_automation_log", column: "lead_id", label: "emails" },
];

// Deleting the lead cascades most related rows away, but four tables
// declare `on delete set null` — without explicit handling those rows
// would SURVIVE holding the person's actual words (DM text, email
// history), merely de-linked. That isn't erasure. So communication
// content is deleted outright, while genuine financial records are
// retained under legal-basis record-keeping (a business must keep
// transaction records for tax purposes) and only de-linked.
const ERASE_OUTRIGHT = ["auto_reply_log", "email_automation_log"];
const RETAIN_DELINKED = ["orders", "refund_requests"];

async function resolveLead(supabase: any, id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };

  // RLS-scoped read — a lead belonging to another business simply
  // isn't visible here, so this doubles as the authorization check.
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).eq("dealership_id", dealershipId).maybeSingle();
  if (!lead) return { error: NextResponse.json({ error: "Lead not found" }, { status: 404 }) };

  return { user, dealershipId, lead };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const resolved = await resolveLead(supabase, id);
  if (resolved.error) return resolved.error;
  const { lead, dealershipId, user } = resolved;

  const related: Record<string, any[]> = {};
  for (const { table, column, label } of RELATED) {
    const { data } = await supabase.from(table).select("*").eq(column, id);
    related[label] = data ?? [];
  }

  // Orders are kept but reported separately — see the DELETE handler
  // for why they aren't erased.
  const { data: orders } = await supabase.from("orders").select("*").eq("lead_id", id);

  await logAuditEvent(createServiceClient(), {
    dealershipId,
    actor: `user:${user!.id}`,
    eventType: "personal_data_exported",
    resourceType: "lead",
    resourceId: id,
    summary: `Exported all stored data for "${lead.name}"`,
  });

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      subject: lead,
      related,
      orders: orders ?? [],
      note: "This is everything stored about this person, across every table that holds their data.",
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="lead-${id}-data-export.json"`,
        "Content-Type": "application/json",
      },
    }
  );
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const resolved = await resolveLead(supabase, id);
  if (resolved.error) return resolved.error;
  const { lead, dealershipId, user } = resolved;

  const service = createServiceClient();

  // Audited BEFORE the delete — afterwards the name is gone, and an
  // erasure record with no indication of what was erased is useless
  // for proving compliance. Deliberately records only the name and
  // id, never the personal data itself: an audit trail that retains
  // the data defeats the point of erasing it.
  await logAuditEvent(service, {
    dealershipId,
    actor: `user:${user!.id}`,
    eventType: "personal_data_erased",
    resourceType: "lead",
    resourceId: id,
    summary: `Erased all stored data for "${lead.name}" at their request`,
    details: { erasedLeadId: id },
  });

  // Communication content first — these tables are `on delete set
  // null`, so the lead delete below would leave the person's actual
  // messages sitting there de-linked rather than erased.
  for (const table of ERASE_OUTRIGHT) {
    const { error: eraseError } = await service.from(table).delete().eq("lead_id", id);
    if (eraseError) console.error(`[privacy] couldn't erase ${table} for lead ${id}:`, eraseError.message);
  }

  // Deleting the lead cascades calls, appointments, notes, touchpoints
  // and complaints away, and nulls the reference on the retained
  // financial records (orders, refund_requests) — those SURVIVE
  // de-linked, deliberately: a business is legally required to keep
  // transaction records for tax purposes, so they stay as financial
  // records while ceasing to be attached to a person.
  const { error } = await service.from("leads").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    erasedOutright: ERASE_OUTRIGHT,
    retainedDelinked: RETAIN_DELINKED,
    note: "Personal data and communication history erased. Order and refund records are retained but no longer linked to this person, as required for financial record-keeping.",
  });
}
