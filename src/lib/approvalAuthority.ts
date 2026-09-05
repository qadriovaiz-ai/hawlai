// Calibrated approval authority — who can approve how much, instead
// of every team member (or nobody) having equal say regardless of
// stakes. Mirrors how a real business delegates decisions: routine,
// small spends can be approved by a manager; anything above the
// dealership's own threshold needs the owner specifically.
//
// This does NOT weaken approval-first — every spend/publish action
// still requires an explicit approve click from SOMEONE. It only
// calibrates WHO that someone can be, based on how much is at stake.

import { getActionPolicy } from "./executionPolicy";

export type ApprovalRole = "owner" | "admin" | "marketing_manager" | "designer" | "content_writer" | "sales" | "viewer";

// null = unlimited (can approve anything). A finite number = can only
// approve actions with amount <= this value (or null-amount actions,
// which aren't money-related, e.g. pausing a campaign). 0 = no
// approval authority at all — can view the queue but not act on it.
const ROLE_APPROVAL_CEILING: Record<ApprovalRole, number | null> = {
  owner: null,
  admin: null, // trusted as highly as the owner for this purpose
  marketing_manager: 0, // overridden below — uses the dealership's configured approval_threshold
  designer: 0,
  content_writer: 0,
  sales: 0,
  viewer: 0,
};

export interface ApprovalAuthorityResult {
  canApprove: boolean;
  reason?: string; // shown in the UI when canApprove is false, or as a note when it's true but capped
}

/**
 * @param actionKey  Optional key into ACTION_POLICIES. Supplying it is
 *                   what lets this function tell a genuinely routine
 *                   no-amount action (pausing a campaign) apart from a
 *                   critical one (changing a live price). Omitted, the
 *                   behaviour is exactly as it was before — every
 *                   existing caller is unaffected.
 */
export function checkApprovalAuthority(
  role: ApprovalRole,
  approvalThreshold: number,
  actionAmount: number | null,
  actionKey?: string
): ApprovalAuthorityResult {
  if (role === "owner" || role === "admin") return { canApprove: true };

  if (role === "marketing_manager") {
    // CRITICAL ACTIONS WITH NO RUPEE AMOUNT NEED THE OWNER.
    //
    // The gap this closes: "amount is null" used to mean "not money
    // related, therefore routine". That reasoning holds for pausing a
    // campaign. It fails badly for a price change, which carries no
    // amount of its own and unbounded revenue consequence — a ₹10
    // change on the best-selling product is not a small action, and
    // the threshold has nothing to measure it against.
    //
    // So a null amount is not evidence of low stakes. It is the
    // ABSENCE of evidence, and the risk level is what settles it.
    // Where the threshold cannot bound the risk, the decision goes up.
    //
    // Deliberately scoped to CRITICAL only. `publish_post` is high,
    // not critical, and stays within a marketing manager's authority —
    // publishing a post is the job. This is not a general tightening.
    if (actionAmount === null && actionKey) {
      const policy = getActionPolicy(actionKey);
      if (policy?.riskLevel === "critical") {
        return {
          canApprove: false,
          reason: "This one needs the owner or an admin — it changes what customers see immediately and can't be undone by lowering a budget.",
        };
      }
    }

    // Non-monetary actions (amount is null, e.g. pausing a campaign)
    // are within a marketing manager's routine authority.
    if (actionAmount === null) return { canApprove: true };
    if (actionAmount <= approvalThreshold) return { canApprove: true };
    return { canApprove: false, reason: `This needs the owner — it's above your ₹${approvalThreshold.toLocaleString("en-IN")} approval limit.` };
  }

  return { canApprove: false, reason: "Your role doesn't have approval authority — ask the owner or an admin to review this." };
}
