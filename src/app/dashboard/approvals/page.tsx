import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { ShieldCheck, Bot, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils";
import { humanizeActionType, humanizeAgentName } from "@/lib/approvalLabels";
import ApprovalActions from "@/components/approvals/ApprovalActions";
import { checkApprovalAuthority, type ApprovalRole } from "@/lib/approvalAuthority";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-300 border border-amber-700/50",
  approved: "bg-green-500/10 text-green-300 border border-green-700/50",
  rejected: "bg-red-500/10 text-red-300 border border-red-700/50",
};

// Pulls whichever field actually carries the agent's own reasoning for
// this specific request — shown as a quoted callout so the person
// deciding hears the "why" in the agent's own words, not just a data
// dump of fields.
function pickReasoning(details: Record<string, any>): string | null {
  return details.summary ?? details.original_request ?? details.reason ?? details.headline ?? null;
}

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Resolve which dealership this person should see approvals for —
  // NOT profile.dealership_id, which is the user's own business (or
  // null for a pure invited team member with no business of their
  // own), not necessarily the dealership they're viewing here. Check
  // ownership first, then active team membership.
  const { data: ownedDealership } = await supabase.from("dealerships").select("id, approval_threshold").eq("owner_id", user.id).maybeSingle();

  let dealershipId: string | undefined;
  let approvalThreshold = 50000;
  let viewerRole: ApprovalRole = "owner";
  const isOwner = !!ownedDealership;

  if (ownedDealership) {
    dealershipId = ownedDealership.id;
    approvalThreshold = ownedDealership.approval_threshold ?? 50000;
  } else {
    // Scoped to the SPECIFIC dealership currently active for this
    // person (set via /api/agency/switch) — not just "any" active
    // membership, since an agency team member can genuinely be on
    // multiple teams at once.
    const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
    if (!profile?.dealership_id) redirect("/dashboard");
    const { data: membership } = await supabase.from("team_members").select("dealership_id, role").eq("user_id", user.id).eq("dealership_id", profile.dealership_id).eq("status", "active").maybeSingle();
    if (!membership) redirect("/dashboard");
    dealershipId = membership.dealership_id;
    viewerRole = membership.role as ApprovalRole;
  }

  if (!dealershipId) redirect("/dashboard");

  // pending_approvals RLS is owner-only by design (migration 070's
  // established pattern) — the service client is used here for
  // everyone, owner included, now that real authorization has
  // already been confirmed above via the user's own RLS-protected
  // session, not bypassed.
  const service = createServiceClient();

  if (!isOwner) {
    const { data: dealership } = await service.from("dealerships").select("approval_threshold").eq("id", dealershipId).single();
    approvalThreshold = dealership?.approval_threshold ?? 50000;
  }

  const { data: approvals, error: fetchError } = await service
    .from("pending_approvals")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  const pending = approvals?.filter((a) => a.status === "pending") ?? [];
  const decided = (approvals?.filter((a) => a.status !== "pending") ?? []).slice(0, 10);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500">Actions above your ₹{approvalThreshold.toLocaleString("en-IN")} limit wait here for your decision</p>
        </div>
      </div>

      {fetchError ? (
        <div className="card p-8 text-center border-red-700/40">
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-slate-700 font-medium">Couldn't load approvals</p>
          <p className="text-slate-400 text-sm mt-1">This is a connection issue, not an empty queue — refresh to try again.</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-slate-700 font-medium">All caught up</p>
          <p className="text-slate-400 text-sm mt-1.5 max-w-sm mx-auto">
            Nothing needs your approval right now. Anything over ₹{approvalThreshold.toLocaleString("en-IN")}, or outside an agent's own authority, will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{pending.length} action{pending.length > 1 ? "s" : ""} waiting for your decision</p>
          {pending.map((approval) => {
            const details = approval.action_details ?? {};
            const reasoning = pickReasoning(details);
            const exceedsThreshold = typeof approval.amount === "number" && approval.amount > approvalThreshold;
            const chips = [
              details.daily_budget && approval.action_type !== "change_campaign_budget" ? `Daily budget: ${formatCurrency(details.daily_budget)}` : null,
              details.duration_days ? `${details.duration_days} days` : null,
              details.car_type ? String(details.car_type) : null,
              details.targeting_city ? details.targeting_city : null,
            ].filter(Boolean) as string[];

            return (
              <div key={approval.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Hero: the ₹ amount is the single most important thing on
                        this card when one exists — it becomes the primary
                        visual element, with the action type demoted to a
                        small eyebrow above it. Non-monetary actions promote
                        the action title to primary instead. */}
                    {approval.amount ? (
                      <>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{humanizeActionType(approval.action_type)}</p>
                        <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">{formatCurrency(approval.amount)}</p>
                        {approval.action_type === "change_campaign_budget" && details.old_budget != null && details.new_budget != null && (
                          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">{formatCurrency(details.old_budget)} → {formatCurrency(details.new_budget)}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-lg font-semibold text-slate-900">{humanizeActionType(approval.action_type)}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatRelativeTime(approval.created_at)}</span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Requested by {humanizeAgentName(approval.requested_by_agent)}</span>
                  {exceedsThreshold && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-amber-500">Exceeds your ₹{approvalThreshold.toLocaleString("en-IN")} limit</span>
                    </>
                  )}
                </div>

                {reasoning && (
                  <p className="text-sm text-slate-600 border-l-2 border-slate-200 pl-3 italic">"{reasoning}"</p>
                )}

                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((chip, i) => (
                      <span key={i} className="badge bg-slate-200 text-slate-500 border-slate-300/80">{chip}</span>
                    ))}
                  </div>
                )}

                <div className="flex justify-end -mx-5 px-5 pt-3 border-t border-slate-200/80">
                  <ApprovalActions
                    approvalId={approval.id}
                    authority={checkApprovalAuthority(viewerRole, approvalThreshold, approval.amount ?? null)}
                    amount={approval.amount ?? null}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-500 mb-2">Recent decisions</p>
          <div className="divide-y divide-slate-200/80 border-t border-b border-slate-200/80">
            {decided.map((approval) => (
              <div key={approval.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`badge ${STATUS_BADGE[approval.status]}`}>
                      {approval.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(approval.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {humanizeActionType(approval.action_type)}
                    {approval.amount ? ` — ${formatCurrency(approval.amount)}` : ""}
                  </p>
                  {approval.action_details?.reason && (
                    <p className="text-xs text-slate-400 mt-0.5 italic">{approval.action_details.reason}</p>
                  )}
                  {approval.rejection_reason && (
                    <p className="text-xs text-red-400 mt-0.5">Reason: {approval.rejection_reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
