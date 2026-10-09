// A one-shot outbound action asks first, and the asking is server-side.
//
// PHASE 2B. The A-to-Z audit found five actions one chat sentence could
// run with no approval anywhere: a real email to a customer, a real
// phone call, a public YouTube video, a live discount code, and the
// toggles that switch on unattended posting, emailing and calling. None
// was in any registry, two had no tests at all, and the worst of them
// turns every other gate in the product into a no-op.
//
// WHY NOT THE PUBLISH PIPELINE. src/lib/publish edits a resource on a
// platform: it has previewDiff, targetRef and staleness detection, all
// of which describe changing a thing that already exists. Sending a
// message is not that shape. Forcing it in would mean inventing an
// "email platform" and a "phone platform" adapter, which is new
// machinery for no gain.
//
// WHAT THIS USES INSTEAD, all of it already here:
//   - executionPolicy.ACTION_POLICIES   says whether approval is needed
//   - pending_approvals                 the row, with RLS
//   - /api/approvals/[id] PATCH         server-side authz (owner or an
//                                       active team member) + the rupee
//                                       authority threshold, and it
//                                       already executes on approve
//
// So the tool creates a row and returns a card. The browser cannot
// perform the action by pressing anything: the only path to execution is
// the approvals route, which re-reads the row and checks who is asking.

import { getActionPolicy, type RiskLevel } from "@/lib/executionPolicy";

export type ApprovalRequest = {
  /** A key in ACTION_POLICIES. Refused if it isn't. */
  actionType: string;
  /** Everything the approvals route needs to carry it out. */
  details: Record<string, unknown>;
  /** What the owner reads before deciding. Says what will happen, not what was done. */
  confirm: string;
  /** Rupees, when the action has an amount the authority threshold should see. */
  amount?: number | null;
  /** Which part of the product asked, for the audit trail. */
  requestedBy: string;
  /**
   * A risk level more specific than the action's own.
   *
   * ACTION_POLICIES classifies the ACTION; some actions cover
   * consequences that differ. "Switch on an automation" is one action
   * and six different consequences: auto-calling every new lead is not
   * the same as sending a welcome email. The toggle's own level wins,
   * and it may only be MORE severe DASH never less.
   */
  risk?: RiskLevel;
};

const SEVERITY: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export type ApprovalResult =
  | {
      needsApproval: true;
      approvalId: string;
      risk: RiskLevel;
      confirm: string;
      note: string;
    }
  | { error: string };

/**
 * Create the approval row and describe it.
 *
 * Returns `{ error }` rather than throwing, because every caller is an
 * executeTool case whose contract is to return an error object.
 *
 * NOTHING HAPPENS HERE except the row. If this function ever grows a
 * branch that performs the action, the gate is gone — the approval
 * coverage test asserts the senders are not reachable from these cases.
 */
export async function requestApproval(
  supabase: any,
  dealershipId: string,
  req: ApprovalRequest
): Promise<ApprovalResult> {
  const policy = getActionPolicy(req.actionType);
  if (!policy) {
    // A caller naming an action nobody has classified is a bug, and the
    // safe answer is to refuse rather than to act. ACTION_POLICIES' own
    // header says absence is not "safe by default".
    return { error: `"${req.actionType}" isn't a known action, so nothing was done. This is a bug worth reporting.` };
  }
  if (!policy.requiresApproval) {
    return { error: `"${req.actionType}" is not approval-gated, so it should not be routed through here.` };
  }

  const { data, error } = await supabase
    .from("pending_approvals")
    .insert({
      dealership_id: dealershipId,
      requested_by_agent: req.requestedBy,
      action_type: req.actionType,
      action_details: req.details,
      amount: req.amount ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { error: `Couldn't create the approval, so nothing was done: ${error?.message ?? "no row returned"}` };
  }

  // The more severe of the two, so an override can raise the level and
  // never quietly lower it.
  const risk =
    req.risk && SEVERITY[req.risk] > SEVERITY[policy.riskLevel] ? req.risk : policy.riskLevel;

  return {
    needsApproval: true,
    approvalId: data.id,
    risk,
    confirm: req.confirm,
    // The model is told, in the words the system prompt already binds to,
    // that NOTHING has happened yet. Without this it narrates a draft row
    // as a completed action, which is finding F-X1.
    note: `NOTHING HAS HAPPENED YET. This is waiting for the owner's approval (risk: ${risk}). Tell them exactly what will happen if they approve, in one or two lines, and do NOT say it is done, sent, placed, live or published. The approval card is in this same message — never send them to another page for it.`,
  };
}
