import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Megaphone, ArrowRight, Clock, MapPin } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import CampaignStatusToggle from "@/components/ads/CampaignStatusToggle";

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

  const { data: campaigns } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("status", "launched")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Campaigns</h1>
            <p className="text-sm text-slate-500">Activate, pause, ya naya ad launch karo</p>
          </div>
        </div>
        <Link href="/dashboard/ads/full-launch" className="btn-primary">
          Naya Ad Launch Karo
        </Link>
      </div>

      {!campaigns || campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Megaphone className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-slate-700 font-medium">Abhi koi campaign launch nahi hua</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Pehla ad launch karo, phir yahan se manage karo</p>
          <Link href="/dashboard/ads/full-launch" className="btn-primary inline-flex">
            Ad Launch Karo <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{campaigns.length} campaign{campaigns.length > 1 ? "s" : ""}</p>
          {campaigns.map((c) => {
            const status = c.meta_status ?? "PAUSED";
            const isScheduledFuture = c.scheduled_start && new Date(c.scheduled_start) > new Date();
            return (
              <div key={c.id} className="card p-4 flex items-center gap-4">
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
                    {c.daily_budget && <span>{formatCurrency(c.daily_budget)}/day</span>}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
