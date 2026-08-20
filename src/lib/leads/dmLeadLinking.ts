// ------------------------------------------------------------------
// DM -> Lead Linking — P2 27a-iii (Cross-Channel Identity)
// ------------------------------------------------------------------
// Resolves (or creates) the lead an Instagram/Facebook DM conversation
// belongs to. Only called for the "dm" auto-reply channel, never
// comments — a public comment isn't a private lead conversation the
// same way a DM is.
//
// Two real scenarios:
// - Scenario A: first-ever message from a sender reveals a phone
//   matching exactly one existing lead — nothing to reconcile yet,
//   just attach the DM identity to it directly.
// - Scenario B: a DM-only lead already exists (from an earlier
//   message with no phone), and a LATER message reveals a phone
//   matching a different existing lead — a real merge.
//
// Confident/doubtful split, per the confirmed decision: exactly one
// phone match + compatible names -> automatic. Multiple matches, or a
// stark name mismatch -> flagged for human review, never auto-acted.
// Merges are non-destructive — the superseded lead row is marked via
// merged_into_lead_id, never deleted, and every automatic merge writes
// an audit_log entry so it's traceable/undoable.
// ------------------------------------------------------------------

import { logAuditEvent } from "../audit/logAuditEvent";
import { emitNotification } from "../notifications/emit";

type DmChannel = "instagram" | "facebook";

const PLACEHOLDER_NAMES: Record<DmChannel, string> = {
  instagram: "Instagram DM contact",
  facebook: "Facebook DM contact",
};

function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+?91[\s-]?|0)?([6-9]\d{9})\b/);
  return match ? match[1] : null;
}

// Deliberately lenient — only flags a STARK mismatch (zero shared
// meaningful word), not nicknames/abbreviations. A generic placeholder
// name on either side is always treated as compatible, since it isn't
// a genuine name to compare against.
function namesLikelyDifferent(nameA: string | null, nameB: string | null): boolean {
  const placeholders = Object.values(PLACEHOLDER_NAMES).map((p) => p.toLowerCase());
  const a = (nameA ?? "").toLowerCase().trim();
  const b = (nameB ?? "").toLowerCase().trim();
  if (!a || !b || placeholders.includes(a) || placeholders.includes(b)) return false;
  if (a === b) return false;
  const tokensA = a.split(/\s+/).filter((t) => t.length >= 3);
  const tokensB = b.split(/\s+/).filter((t) => t.length >= 3);
  return !tokensA.some((t) => tokensB.includes(t));
}

async function findPhoneCandidates(supabase: any, dealershipId: string, phone: string, excludeLeadId: string | null) {
  let query = supabase
    .from("leads")
    .select("id, name, phone")
    .eq("dealership_id", dealershipId)
    // Suffix match on the clean 10-digit number — existing leads.phone
    // may carry a +91/91/0 prefix inconsistently, this matches either way.
    .ilike("phone", `%${phone}`)
    .is("merged_into_lead_id", null);
  if (excludeLeadId) query = query.neq("id", excludeLeadId);
  const { data } = await query;
  return (data ?? []) as { id: string; name: string; phone: string | null }[];
}

async function flagForReview(supabase: any, dealershipId: string, dmLead: { id: string; name: string }, candidates: { id: string; name: string }[], phone: string) {
  await emitNotification(supabase, {
    dealershipId,
    kind: "lead_merge_needs_review",
    title: `Possible duplicate lead: "${dmLead.name}"`,
    body: candidates.length > 1
      ? `A DM revealed phone ${phone}, which matches ${candidates.length} existing leads — too ambiguous to merge automatically.`
      : `A DM revealed phone ${phone}, matching an existing lead ("${candidates[0].name}") with a very different name — not merged automatically, please review.`,
    href: `/dashboard/leads/${dmLead.id}`,
    dedupeKey: `lead_merge_needs_review:${dmLead.id}:${phone}`,
  });
}

async function mergeDmLeadInto(
  supabase: any,
  dealershipId: string,
  dmLead: { id: string; name: string; phone: string | null },
  survivor: { id: string; name: string },
  senderId: string,
  channel: DmChannel,
  matchedPhone: string
) {
  await supabase.from("leads").update({ dm_source_id: senderId, dm_channel: channel }).eq("id", survivor.id);
  await supabase.from("leads").update({ dm_source_id: null, dm_channel: null, merged_into_lead_id: survivor.id }).eq("id", dmLead.id);
  await supabase.from("auto_reply_log").update({ lead_id: survivor.id }).eq("lead_id", dmLead.id);

  await logAuditEvent(supabase, {
    dealershipId,
    actor: "system:dm_lead_merge",
    eventType: "lead_auto_merged",
    resourceType: "lead",
    resourceId: survivor.id,
    summary: `Merged DM-only lead "${dmLead.name}" into "${survivor.name}" — matched on phone ${matchedPhone}`,
    details: { mergedLeadId: dmLead.id, survivorLeadId: survivor.id, matchedPhone },
  });
}

export async function resolveDmLead(
  supabase: any,
  dealershipId: string,
  senderId: string,
  channel: DmChannel,
  incomingText: string
): Promise<string> {
  // Already-linked conversation — every subsequent message (including
  // after a merge) routes straight here, since the surviving lead is
  // whichever one carries dm_source_id going forward.
  const { data: linked } = await supabase
    .from("leads")
    .select("id, name, phone")
    .eq("dealership_id", dealershipId)
    .eq("dm_source_id", senderId)
    .eq("dm_channel", channel)
    .is("merged_into_lead_id", null)
    .maybeSingle();

  const extractedPhone = extractPhone(incomingText);

  if (linked) {
    // Scenario B — only acts the first time this lead doesn't already
    // have a phone; never overwrites one already set.
    if (extractedPhone && !linked.phone) {
      const candidates = await findPhoneCandidates(supabase, dealershipId, extractedPhone, linked.id);
      if (candidates.length === 1 && !namesLikelyDifferent(linked.name, candidates[0].name)) {
        await mergeDmLeadInto(supabase, dealershipId, linked, candidates[0], senderId, channel, extractedPhone);
        return candidates[0].id;
      }
      if (candidates.length >= 1) {
        await flagForReview(supabase, dealershipId, linked, candidates, extractedPhone);
      } else {
        await supabase.from("leads").update({ phone: extractedPhone }).eq("id", linked.id);
      }
    }
    return linked.id;
  }

  // Scenario A — first-ever message from this sender.
  if (extractedPhone) {
    const candidates = await findPhoneCandidates(supabase, dealershipId, extractedPhone, null);
    if (candidates.length === 1) {
      await supabase.from("leads").update({ dm_source_id: senderId, dm_channel: channel }).eq("id", candidates[0].id);
      return candidates[0].id;
    }
    if (candidates.length > 1) {
      const { data: newLead } = await supabase.from("leads").insert({
        dealership_id: dealershipId, name: PLACEHOLDER_NAMES[channel], phone: extractedPhone,
        dm_source_id: senderId, dm_channel: channel, source: `dm_${channel}`, status: "new",
      }).select("id, name").single();
      await flagForReview(supabase, dealershipId, newLead, candidates, extractedPhone);
      return newLead.id;
    }
  }

  // No phone at all, or no candidates matched — new DM-only lead,
  // never left unattributed.
  const { data: newLead } = await supabase.from("leads").insert({
    dealership_id: dealershipId, name: PLACEHOLDER_NAMES[channel], phone: extractedPhone ?? null,
    dm_source_id: senderId, dm_channel: channel, source: `dm_${channel}`, status: "new",
  }).select("id").single();
  return newLead.id;
}
