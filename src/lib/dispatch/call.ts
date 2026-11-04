// PLACING A CALL — a Dispatch, moved out of the approvals route in
// S6/P1 unchanged.
//
// Every check below was already there, in the route's own branch. What
// is new is where it lives: a route file with ten `if (action_type ===
// …)` branches is ten contracts nobody can compare, and the one that
// mattered most — "re-read the subject before acting" — was true in
// some branches and absent in others.

import type { DispatchContext, DispatchPreview, DispatchResult, Dispatcher } from "@/lib/dispatch/types";

async function leadFor(ctx: DispatchContext, leadId: string) {
  const { data } = await ctx.service
    .from("leads")
    .select("id, name, phone, dealership_id, dnd_opt_out")
    .eq("id", leadId)
    .eq("dealership_id", ctx.dealershipId)
    .maybeSingle();
  return data;
}

export const callDispatcher: Dispatcher = {
  key: "place_outbound_call",
  undoable: false,
  // WHAT CANNOT BE TAKEN BACK, AND NOTHING ELSE. The tool's own confirm
  // line says what is being sent and to whom — it is the only thing
  // that knows. This sentence is appended to it, so restating the
  // action here made the card say the same thing twice.
  cannotBeTakenBack:
    "A call cannot be unmade — if it is the wrong number or the wrong moment, they have still been called.",

  async preview(ctx, details): Promise<DispatchPreview | { error: string }> {
    const lead = await leadFor(ctx, String(details?.lead_id ?? ""));
    if (!lead) return { error: "That lead is no longer on file, so there is nothing to call." };
    const warnings: string[] = [];
    if (!lead.phone) warnings.push("There is no phone number on file for them, so this cannot go out.");
    if (lead.dnd_opt_out) warnings.push("They have opted out of contact, so this cannot go out.");
    return {
      summary: `An automated call to ${lead.name}`,
      to: `${lead.name}${lead.phone ? ` on ${lead.phone}` : " — no number on file"}`,
      warnings,
    };
  },

  async execute(ctx, details, once): Promise<DispatchResult> {
    // RE-READ, NOT THE ROW. A card can sit for hours: the number may
    // have changed, or they may have opted out since it was made.
    const lead = await leadFor(ctx, String(details?.lead_id ?? ""));
    if (!lead) return { ok: false, error: "That lead is no longer on file, so no call was placed.", status: 400 };
    if (!lead.phone) {
      return { ok: false, error: `${lead.name} has no phone number on file, so no call was placed.`, status: 400 };
    }
    if (lead.dnd_opt_out) {
      return { ok: false, error: `${lead.name} has opted out of contact, so no call was placed.`, status: 400 };
    }

    // NO IDEMPOTENCY KEY AT THE PLATFORM, and said rather than
    // pretended: Vapi's call endpoint takes no claim, so `once` cannot
    // be handed on. The no-repeat rule for this dispatcher is the
    // route's own — a card that is not `pending` is refused before
    // anything here runs (S6/P1a, after approving a call card twice
    // placed two real calls).
    void once;

    const { triggerVapiCall } = await import("@/lib/agents/vapiCallAgent");
    const called = await triggerVapiCall(ctx.service, lead);
    if (!called.success) {
      return { ok: false, error: called.error ?? "The call didn't go through, so nothing was approved.", status: 500 };
    }
    return { ok: true, note: `Calling ${lead.name} now.`, verified: true };
  },
};
