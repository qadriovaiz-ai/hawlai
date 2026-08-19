import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Megaphone, ArrowRight, Clock, MapPin, IndianRupee, Users, TrendingDown, FlaskConical } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import CampaignStatusToggle from "@/components/ads/CampaignStatusToggle";
import ExplainCampaignButton from "@/components/ads/ExplainCampaignButton";
import TestVariantButton from "@/components/ads/TestVariantButton";
import ScoreBadge from "@/components/shared/ScoreBadge";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-300 border border-green-700/50",
  PAUSED: "bg-slate-200 text-slate-600 border border-slate-300",
};

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  // pending_approvals RLS is owner-only, so a non-owner manager viewing
  // this page can't read it directly — reading via the service client
  // here, scoped to the dealershipId already resolved above from this
  // person's own session, same precedent as /api/approvals/[id].
  const [{ data: campaigns }, performance, { data: pendingActivations }] = await Promise.all([
    supabase
      .from("ad_creatives")
      .select("*")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched")
      .order("created_at", { ascending: false }),
    getCampaignPerformance(supabase, dealershipId),
    createServiceClient()
      .from("pending_approvals")
      .select("action_details")
      .eq("dealership_id", dealershipId)
      .eq("action_type", "activate_ad_campaign")
      .eq("status", "pending"),
  ]);

  const perfById = new Map(performance.campaigns.map((p) => [p.id, p]));
  const pendingActivationIds = new Set((pendingActivations ?? []).map((a: any) => a.action_details?.campaign_id).filter(Boolean));

  // Group launched creatives that share a variant_group_id (started
  // via "Test a variant") so they render as one side-by-side
  // comparison instead of two unrelated cards — a group id assigned
  // but with only one member so far (no second variant launched yet)
  // stays a normal single card until there's actually something to
  // compare it against.
  const byGroup = new Map<string, any[]>();
  const singles: any[] = [];
  for (const c of campaigns ?? []) {
    if (c.variant_group_id) {
      const arr = byGroup.get(c.variant_group_id) ?? [];
      arr.push(c);
      byGroup.set(c.variant_group_id, arr);
    } else {
      singles.push(c);
    }
  }
  const variantGroups: { groupId: string; members: any[] }[] = [];
  for (const [groupId, members] of byGroup) {
    if (members.length >= 2) {
      variantGroups.push({ groupId, members: members.sort((a: any, b: any) => (a.variant_label ?? "").localeCompare(b.variant_label ?? "")) });
    } else {
      singles.push(...members);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Campaigns</h1>
            <p className="text-sm text-slate-500">Activate, pause, or launch a new ad</p>
          </div>
        </div>
        <Link href="/dashboard/ads/full-launch" className={buttonClasses("primary")}>
          Launch New Ad
        </Link>
      </div>

      {campaigns && campaigns.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <IndianRupee className="w-3.5 h-3.5" /> Total Spend
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(performance.totals.spend)}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <Users className="w-3.5 h-3.5" /> Leads from Ads
            </div>
            <p className="text-2xl font-bold text-slate-900">{performance.totals.leads}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <TrendingDown className="w-3.5 h-3.5" /> Avg Cost / Lead
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {performance.totals.cost_per_lead !== null ? formatCurrency(performance.totals.cost_per_lead) : "—"}
            </p>
          </div>
        </div>
      )}

      {!campaigns || campaigns.length === 0 ? (
        <div className="card text-center">
          <EmptyState icon={Megaphone} title="No campaigns launched yet" description="Launch your first ad, then manage it from here" className="pb-4" />
          <Link href="/dashboard/ads/full-launch" className={buttonClasses("primary", "md", "inline-flex mb-8")}>
            Launch Ad <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{campaigns.length} campaign{campaigns.length > 1 ? "s" : ""}</p>

          {/* Creative variant tests — master audit Part D. Comparison
              reads the same per-campaign performance the single-card
              view already has; nothing new is fetched for this. */}
          {variantGroups.map(({ groupId, members }) => (
            <div key={groupId} className="card p-4 space-y-3">
              <p className="text-xs font-semibold text-brand-600 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" /> Variant test — {members.length} versions
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {members.map((c: any) => {
                  const status = c.meta_status ?? "PAUSED";
                  const perf = perfById.get(c.id);
                  return (
                    <div key={c.id} className="border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center gap-3">
                        {c.generated_image_url ? (
                          <img src={c.generated_image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                            <Megaphone className="w-5 h-5 text-slate-300" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-brand-600 bg-brand-500/10 rounded px-1.5 py-0.5">
                              {c.variant_label ?? "—"}
                            </span>
                            <span className={`badge ${STATUS_BADGE[status] ?? STATUS_BADGE.PAUSED}`}>{status}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 truncate mt-0.5">{c.headline}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-slate-400">Spend</p>
                          <p className="text-xs font-semibold text-slate-800">{perf ? formatCurrency(perf.spend) : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Leads</p>
                          <p className="text-xs font-semibold text-slate-800">{perf?.leads ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">ROAS</p>
                          <p className="text-xs font-semibold text-slate-800">{perf?.roas != null ? `${perf.roas.toFixed(1)}x` : "—"}</p>
                        </div>
                      </div>
                      <CampaignStatusToggle creativeId={c.id} currentStatus={status} pendingActivation={pendingActivationIds.has(c.id)} />
                    </div>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-slate-400">Pause whichever version is underperforming from its own toggle above — there's no separate "declare winner" step.</p>
            </div>
          ))}

          {singles.map((c: any) => {
            const status = c.meta_status ?? "PAUSED";
            const isScheduledFuture = c.scheduled_start && new Date(c.scheduled_start) > new Date();
            const perf = perfById.get(c.id);
            return (
              <div key={c.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-4">
                  {c.generated_image_url ? (
                    <img src={c.generated_image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                      <Megaphone className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-slate-900 truncate">{c.headline}</p>
                      <span className={`badge ${STATUS_BADGE[status] ?? STATUS_BADGE.PAUSED}`}>{status}</span>
                      <ScoreBadge score={c.creative_score} />
                      {isScheduledFuture && (
                        <span className="badge bg-blue-500/10 text-blue-300 border border-blue-700/50">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Scheduled: {formatDate(c.scheduled_start)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 truncate">{c.body_copy}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-400">
                      {c.daily_budget && <span>{formatCurrency(c.daily_budget)}/day budget</span>}
                      {c.targeting_city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {c.targeting_city}
                        </span>
                      )}
                      <span>{formatDate(c.created_at)}</span>
                    </div>
                  </div>
                  <CampaignStatusToggle creativeId={c.id} currentStatus={status} pendingActivation={pendingActivationIds.has(c.id)} />
                </div>

                {perf && (perf.spend > 0 || perf.leads > 0) && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
                    <div>
                      <p className="text-xs text-slate-400">Spend</p>
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(perf.spend)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Impressions</p>
                      <p className="text-sm font-semibold text-slate-800">{perf.impressions.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Leads</p>
                      <p className="text-sm font-semibold text-slate-800">{perf.leads}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Cost / Lead</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {perf.cost_per_lead !== null ? formatCurrency(perf.cost_per_lead) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Sales</p>
                      <p className="text-sm font-semibold text-slate-800">{perf.conversions}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">ROAS</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {perf.roas !== null ? `${perf.roas.toFixed(1)}x` : "—"}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <ExplainCampaignButton campaignId={c.id} />
                  <TestVariantButton campaignId={c.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
