import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShieldCheck, Bot, Clock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import ApprovalActions from "@/components/approvals/ApprovalActions";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  approved: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: approvals } = await supabase
    .from("pending_approvals")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  const pending = approvals?.filter((a) => a.status === "pending") ?? [];
  const decided = (approvals?.filter((a) => a.status !== "pending") ?? []).slice(0, 10);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pending Approvals</h1>
          <p className="text-sm text-slate-500">Actions above your budget limit wait here for approval</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-slate-700 font-medium">No pending approvals</p>
          <p className="text-slate-400 text-sm mt-1">When an action goes over your approval limit, it'll show up here</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{pending.length} action{pending.length > 1 ? "s" : ""} waiting for your decision</p>
          {pending.map((approval) => {
            const details = approval.action_details ?? {};
            return (
              <div key={approval.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`badge ${STATUS_BADGE.pending}`}>Pending</span>
                      <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                        <Bot className="w-3 h-3" /> {approval.requested_by_agent}
                      </span>
                      <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(approval.created_at)}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {approval.action_type.replaceAll("_", " ")}
                      {approval.amount ? ` — ${formatCurrency(approval.amount)}` : ""}
                    </p>
                    {details.headline && approval.action_type === "change_campaign_targeting" && (
                      <p className="text-sm text-slate-500 mt-0.5">"{details.headline}"</p>
                    )}
                    {details.summary && approval.action_type === "change_campaign_targeting" && (
                      <p className="text-sm text-slate-600 mt-0.5">{details.summary}</p>
                    )}
                    {details.estimated_impact && approval.action_type === "change_campaign_targeting" && (
                      <p className="text-xs text-slate-400 mt-0.5 italic">Estimated impact: {details.estimated_impact}</p>
                    )}
                    {details.original_request && (
                      <p className="text-sm text-slate-500 mt-0.5">"{details.original_request}"</p>
                    )}
                    {details.headline && approval.action_type === "change_campaign_budget" && (
                      <p className="text-sm text-slate-500 mt-0.5">"{details.headline}"</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                      {details.daily_budget && <span>Daily budget: {formatCurrency(details.daily_budget)}</span>}
                      {details.duration_days && <span>Duration: {details.duration_days} days</span>}
                      {details.car_type && <span>Item: {details.car_type}</span>}
                      {details.targeting_city && <span>City: {details.targeting_city}</span>}
                      {approval.action_type === "change_campaign_budget" && (
                        <span>{formatCurrency(details.old_budget ?? 0)} -&gt; {formatCurrency(details.new_budget ?? 0)}</span>
                      )}
                    </div>
                  </div>
                  <ApprovalActions approvalId={approval.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-600">Recent Decisions</p>
          {decided.map((approval) => (
            <div key={approval.id} className="card p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${STATUS_BADGE[approval.status]}`}>
                    {approval.status === "approved" ? "Approved" : "Rejected"}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(approval.created_at)}</span>
                </div>
                <p className="font-semibold text-slate-900">
                  {approval.action_type.replaceAll("_", " ")} — {formatCurrency(approval.amount ?? 0)}
                </p>
                {approval.rejection_reason && (
                  <p className="text-xs text-red-500 mt-0.5">Reason: {approval.rejection_reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
