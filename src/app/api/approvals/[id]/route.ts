import { createClient } from "@/lib/supabase/server";
import { recordDecisionQuietly } from "@/lib/growth/recordDecision";
import { measureForAction } from "@/lib/growth/measures";
import { createServiceClient } from "@/lib/supabase/service";
import { applyApprovalDecision } from "@/lib/approvals/decide";
import { NextResponse } from "next/server";
import { applyTargetingChange } from "@/lib/agents/campaignEditAgent";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";
import { dispatcherFor } from "@/lib/dispatch/registry";
import { releaseApprovedAction } from "@/lib/publish/release";
import { rejectPublishAction } from "@/lib/publish/reject";
import { createPlatformRegistry } from "@/lib/publish/registry";
import { humanizeActionType } from "@/lib/approvalLabels";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { setCampaignStatus } from "@/lib/ads/campaignStatus";
import { adsTokenFor } from "@/lib/ads/metaToken";


/**
 * What was already decided about this approval.
 *
 * WHY IT EXISTS: an approval card in the chat kept its verdict in React
 * state, so the moment the message list re-rendered — a new turn, a
 * reload — the buttons came back on a card that had already been
 * approved. Pressing Approve again was safe (the executor refuses a
 * spent action) but it answered in red, as an error, on a change that
 * had gone through perfectly.
 *
 * Returns the stored verification too, so a card rebuilt an hour later
 * still says what the live page read back rather than a weaker guess.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: approval } = await service.from("pending_approvals").select("id, dealership_id, status").eq("id", id).maybeSingle();
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  // Same authorization shape as PATCH below: the owner, or a genuinely
  // active member of THIS dealership, confirmed through the caller's own
  // RLS-protected session. Anyone else is told nothing.
  const { data: dealership } = await service.from("dealerships").select("owner_id").eq("id", approval.dealership_id).maybeSingle();
  if (dealership?.owner_id !== user.id) {
    const { data: teamMember } = await supabase
      .from("team_members").select("id").eq("user_id", user.id).eq("dealership_id", approval.dealership_id).eq("status", "active").maybeSingle();
    if (!teamMember) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  const { data: action } = await service
    .from("publish_actions")
    .select("status, platform_response")
    .eq("approval_id", id)
    .maybeSingle();

  const verification = (action?.platform_response as any)?.verification ?? null;
  return NextResponse.json({
    status: approval.status,
    publish: action
      ? { status: action.status, ...(verification ? { verified: Boolean(verification.verified), message: String(verification.message) } : {}) }
      : null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // WHO IS DECIDING — resolved here, where the session is, and nowhere
  // else. H1 moved the decision itself into applyApprovalDecision so
  // the WhatsApp channel can reach the same one; what stays behind is
  // the half only a browser can do.
  //
  // This reads the approval's dealership to resolve the role, and the
  // shared function reads the approval again in full. One small extra
  // query on this path, in exchange for the shared function owning its
  // own reads rather than trusting a row a caller handed it.
  const service = createServiceClient();
  const { data: owned } = await service.from("pending_approvals").select("dealership_id").eq("id", id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  const { data: owner } = await service.from("dealerships").select("owner_id").eq("id", owned.dealership_id).single();
  const isOwner = owner?.owner_id === user.id;
  let role: ApprovalRole = "owner";
  if (!isOwner) {
    // Confirms real membership via the user's own RLS-protected
    // session (team_members_self_read: user_id = auth.uid()) — not
    // bypassed, genuinely checked against their own identity. Scoped
    // directly to this approval's dealership, not "any" active
    // membership, since an agency team member can be on multiple
    // teams at once.
    const { data: teamMember } = await supabase.from("team_members").select("role").eq("user_id", user.id).eq("dealership_id", owned.dealership_id).eq("status", "active").maybeSingle();
    role = (teamMember?.role as ApprovalRole) ?? "viewer"; // not a member of THIS dealership at all = no authority, same as viewer
  }

  return applyApprovalDecision(id, body, {
    userId: user.id,
    role,
    label: `user:${user.id}`,
  });
}
