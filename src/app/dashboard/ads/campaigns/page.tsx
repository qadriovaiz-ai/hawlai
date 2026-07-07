import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Megaphone, ArrowRight, Clock, MapPin, IndianRupee, Users, TrendingDown } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import CampaignStatusToggle from "@/components/ads/CampaignStatusToggle";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700 border border-green-200",
  PAUSED: "bg-slate-100 text-slate-600 border border-slate-200",
};

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [{ data: campaigns }, performance] = await Promise.all([
    supabase
      .from("ad_creatives")
      .select("*")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched")
      .order("created_at", { ascending: false }),
    getCampaignPerformance(supabase, dealershipId),
  ]);

  const perfById = new Map(performance.campaigns.map((p) => [p.id, p]));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Campaigns</h1>
            <p className="text-sm text-slate-500">Activate, pause, or launch a new ad</p>
          </div>
        </div>
        <Link href="/dashboard/ads/full-launch" className="btn-primary">
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
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Megaphone className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-slate-700 font-medium">No campaigns launched yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Launch your first ad, then manage it from here</p>
          <Link href="/dashboard/ads/full-launch" className="btn-primary inline-flex">
            Launch Ad <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{campaigns.length} campaign{campaigns.length > 1 ? "s" : ""}</p>
          {campaigns.map((c) => {
            const status = c.meta_status ?? "PAUSED";
            const isScheduledFuture = c.scheduled_start && new Date(c.scheduled_start) > new Date();
            const perf = perfById.get(c.id);
            return (
              <div key={c.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-4">
                  {c.generated_image_url ? (
                    <img src={c.generated_image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Megaphone className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-slate-900 truncate">{c.headline}</p>
                      <span className={`badge ${STATUS_BADGE[status] ?? STATUS_BADGE.PAUSED}`}>{status}</span>
                      {isScheduledFuture && (
                        <span className="badge bg-blue-50 text-blue-700 border border-blue-200">
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
                  <CampaignStatusToggle creativeId={c.id} currentStatus={status} />
                </div>

                {perf && (perf.spend > 0 || perf.leads > 0) && (
                  <div className="grid grid-cols-4 gap-3 pt-3 border-t border-slate-100">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
