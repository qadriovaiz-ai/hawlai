import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Briefcase, Flame, Users, ShieldCheck, PhoneCall, CalendarDays, IndianRupee, TrendingUp, Lock, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getDealershipPlanLimits, hasFeature, GATED_FEATURE_MIN_PLAN, PLAN_LABELS } from "@/lib/plans";
import { getPortfolioSummaries } from "@/lib/agents/portfolioAgent";
import BulkAutomationPanel from "@/components/agency/BulkAutomationPanel";
import { buttonClasses } from "@/components/ui/Button";

// Master audit Part E1 — the highest-value missing Agency-tier
// feature per the audit: a single screen showing every managed
// business at a glance instead of forcing a switch into each one just
// to see anything. Deliberately no AI-generated content (health
// score, growth summary) on the grid — those are a live Claude call
// per business, fine for one detail page, too expensive for N cards
// on one load.
export default async function AgencyPortfolioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  const allowed = hasFeature(limits, "multiBusiness");

  if (!allowed) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-6 text-center space-y-3">
          <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-brand-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Portfolio Overview</h1>
          <p className="text-sm text-slate-500">
            See every business you manage in one screen — leads, pending approvals, calls, appointments, and ad spend, side by side. Needs the {PLAN_LABELS[GATED_FEATURE_MIN_PLAN.multiBusiness]} plan.
          </p>
          <Link href="/dashboard/billing" className={buttonClasses("primary", "md", "inline-flex")}>Upgrade</Link>
        </div>
      </div>
    );
  }

  const summaries = await getPortfolioSummaries(supabase, user.id);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Portfolio</h1>
          <p className="text-sm text-slate-500">Every business you manage, at a glance</p>
        </div>
      </div>

      {summaries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">No businesses found.</p>
      ) : (
        <>
        <BulkAutomationPanel businesses={summaries.map((b) => ({ id: b.id, dealershipName: b.dealershipName }))} />
        <div className="grid sm:grid-cols-2 gap-4">
          {summaries.map((b) => (
            <Link key={b.id} href={`/dashboard/agency-portfolio/${b.id}`} className="card p-5 space-y-4 hover:border-brand-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{b.dealershipName}</p>
                  <p className="text-xs text-slate-400">{b.city ?? "—"} · {b.plan}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
              </div>

              {b.pendingApprovals > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1.5 w-fit">
                  <ShieldCheck className="w-3.5 h-3.5" /> {b.pendingApprovals} waiting for approval
                </div>
              )}

              <div className="grid grid-cols-3 gap-2.5">
                <Metric icon={Users} label="Leads" value={b.totalLeads} />
                <Metric icon={Flame} label="Hot" value={b.hotLeads} />
                <Metric icon={PhoneCall} label="Calls" value={b.callsMade} />
                <Metric icon={CalendarDays} label="Appts" value={b.appointments} />
                <Metric icon={IndianRupee} label="Spend" value={formatCurrency(b.spend)} />
                <Metric icon={TrendingUp} label="ROAS" value={b.roas != null ? `${b.roas.toFixed(1)}x` : "—"} />
              </div>
            </Link>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <Icon className="w-3 h-3 text-slate-400 mx-auto mb-1" />
      <p className="text-xs font-bold text-slate-800 tabular-nums truncate">{value}</p>
      <p className="text-[9px] text-slate-400">{label}</p>
    </div>
  );
}
