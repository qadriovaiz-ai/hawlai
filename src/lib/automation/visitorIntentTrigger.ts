// Leads whose browsing says they are interested — V5b.
//
// The workflow engine's three triggers are all CRM facts: a lead was
// created, converted, or booked an appointment. None of them is about
// what the person actually DID. This is the fourth, and it is the one
// the whole visitor engine was built to feed:
//
//   V1   which page they were on          page_events.path
//   V2   grouped into one sitting         groupIntoVisits
//   V3   scored, with its reasons         summariseIntent
//   V4c  what the pages mean to this      readPageKinds
//        business
//   V5a  which lead that visitor became   leads.visitor_id
//
// NOTHING NEW IS INVENTED HERE. It reads those five and answers one
// question: which leads showed high intent recently, and when.
//
// ─────────────────────────────────────────────────────────────────────
// THE TRIGGER DATE IS THE VISIT, NOT THE LEAD
// ─────────────────────────────────────────────────────────────────────
//
// `delay_days` counts from the trigger date, so a day-2 step means two
// days after the thing that triggered it. The thing here is the
// BEHAVIOUR. Using the lead's created_at would send "day 2" on a lead
// created in March the moment this workflow is switched on — the
// mistake migration 134 already fixed for `lead_converted`, recorded in
// this engine's own comment: "every converted lead's created_at is
// already in the past, which would've made delay_days meaningless".
//
// ─────────────────────────────────────────────────────────────────────
// A LEAD WE CANNOT CONNECT TO ANY BROWSING IS NEVER TRIGGERED
// ─────────────────────────────────────────────────────────────────────
//
// `visitor_id` is null for a lead from somebody who declined cookies,
// one the owner typed in, one imported, one from Meta. Null means "we
// cannot connect this person to any browsing" and NOT "they browsed
// nothing" — so they are left out, silently, rather than guessed at.
// That is the same rule `measuredSeconds` keeps for a visit that could
// not be timed, and it is why this trigger can never fire on somebody
// who was never measured.
//
// The owner's own visits are already excluded by `readVisits`
// (is_internal, migration 207) — otherwise a founder testing his own
// shop would trigger his own follow-ups.

import { readVisits } from "@/lib/growth/visits";
import { summariseIntent, readPageKinds } from "@/lib/growth/intent";

/** One lead the trigger applies to, with the moment that triggered it. */
export type IntentTriggeredLead = {
  leadId: string;
  email: string;
  name: string;
  /** When the visit happened — what `delay_days` counts from. */
  triggerDate: string;
  /** The score that qualified it, for the log and for a test to read. */
  score: number;
};

/**
 * How far back a visit still counts as a reason to follow up.
 *
 * A CONVENTION, NOT A MEASUREMENT, like VISIT_GAP_MINUTES. Fourteen
 * days is long enough that a weekend browser is not missed and short
 * enough that switching the workflow on does not email everybody who
 * ever looked. Changing it changes who gets mailed, which is why it is
 * one named constant and not a literal in a query.
 */
export const INTENT_LOOKBACK_DAYS = 14;

/** One `leads` row, as far as this file cares. */
type LeadRow = {
  id?: string;
  name?: string | null;
  email?: string | null;
  visitor_id?: string | null;
};

/**
 * Which leads showed high intent recently, and when.
 *
 * Returns [] rather than throwing on any failed read: an empty list
 * means "nobody is due", which is what every other trigger returns when
 * it finds nothing, and a workflow that cannot read is a workflow that
 * sends nothing rather than one that sends wrongly.
 */
export async function intentTriggeredLeads(
  supabase: any,
  dealershipId: string,
  opts: { now?: Date } = {}
): Promise<IntentTriggeredLead[]> {
  // The page kinds first: a FAILED read gives null, and scoring against
  // null classifies every page as unidentifiable, scores every visit
  // near zero and triggers nobody — which would read as "nobody was
  // interested" rather than "we could not tell".
  const kinds = await readPageKinds(supabase, dealershipId);
  if (!kinds) return [];

  const visits = await readVisits(supabase, dealershipId, {
    sinceDays: INTENT_LOOKBACK_DAYS,
    now: opts.now,
  });
  if (!visits || !visits.length) return [];

  const scored = summariseIntent(visits, kinds).visits.filter((v) => v.band === "high");
  if (!scored.length) return [];

  // THE BEST VISIT PER VISITOR, not every visit. Somebody who came back
  // three times is one person to follow up with once, and the engine's
  // own idempotency is per (step, lead) — handing it the same lead
  // three times would do nothing useful and would make the count in the
  // log a lie.
  const best = new Map<string, { startedAt: string; score: number }>();
  for (const v of scored) {
    const current = best.get(v.visitorId);
    if (!current || v.score > current.score) best.set(v.visitorId, { startedAt: v.startedAt, score: v.score });
  }

  const { data, error } = await supabase
    .from("leads")
    .select("id, name, email, visitor_id")
    .eq("dealership_id", dealershipId)
    .not("email", "is", null)
    .not("visitor_id", "is", null)
    // Never auto-email an opted-out lead — the same check every other
    // trigger in this engine makes, in the query rather than after it.
    .eq("dnd_opt_out", false)
    .in("visitor_id", [...best.keys()])
    .limit(200);

  // `!Array.isArray(data)` is what actually does the work here: a
  // failed PostgREST read carries `data: null`, so the error check
  // beside it is belt-and-braces and a mutation removing it survives,
  // correctly. Kept because a client that ever returned rows beside an
  // error would otherwise be believed; noted so nobody reads it as
  // load-bearing.
  if (error || !Array.isArray(data)) return [];

  const out: IntentTriggeredLead[] = [];
  for (const lead of data as LeadRow[]) {
    const visitorId = String(lead.visitor_id ?? "");
    const hit = best.get(visitorId);
    if (!hit || !lead.id || !lead.email) continue;
    out.push({
      leadId: lead.id,
      email: lead.email,
      name: String(lead.name ?? ""),
      triggerDate: hit.startedAt,
      score: hit.score,
    });
  }
  return out;
}
