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
          <p className="text-sm text-slate-500">Budget-limit se upar wale actions yahan approval ke liye rukte hain</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-slate-700 font-medium">Koi pending approval nahi hai</p>
          <p className="text-slate-400 text-sm mt-1">Jab koi action tumhari approval limit se upar jayega, woh yahan dikhega</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{pending.length} action{pending.length > 1 ? "s" : ""} tumhare decision ka wait kar rahe hain</p>
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
                      {approval.action_type.replaceAll("_", " ")} — {formatCurrency(approval.amount ?? 0)}
                    </p>
                    {details.original_request && (
                      <p className="text-sm text-slate-500 mt-0.5">"{details.original_request}"</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                      {details.daily_budget && <span>Daily budget: {formatCurrency(details.daily_budget)}</span>}
                      {details.duration_days && <span>Duration: {details.duration_days} din</span>}
                      {details.car_type && <span>Car: {details.car_type}</span>}
                      {details.targeting_city && <span>City: {details.targeting_city}</span>}
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
