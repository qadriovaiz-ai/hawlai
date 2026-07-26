"use client";

import { useState, useEffect } from "react";
import { Loader2, PhoneCall, Sparkles, Image as ImageIcon, Video, Crown, CheckCircle2 } from "lucide-react";

interface UsageData {
  plan: string;
  planDetails: {
    label: string;
    priceLabel: string;
    callsPerMonth: number | null;
    contentPerMonth: number | null;
    imagesPerMonth: number | null;
    videosPerMonth: number | null;
    customDomain: boolean;
    removeHawlaiBranding: boolean;
  };
  usage: { calls: number; content: number; images: number; videos: number };
}

function UsageBar({ icon: Icon, label, used, limit }: { icon: any; label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearLimit = limit != null && pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 text-slate-700"><Icon className="w-4 h-4 text-slate-400" /> {label}</span>
        <span className={nearLimit ? "text-red-500 font-medium" : "text-slate-500"}>
          {used} {limit != null ? `/ ${limit}` : "(unlimited)"}
        </span>
      </div>
      {limit != null && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${nearLimit ? "bg-red-400" : "bg-purple-500"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function UsageView() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/usage").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading usage...</div>;
  if (!data) return <div className="card p-8 text-sm text-red-400">Couldn't load usage data.</div>;

  const { planDetails, usage } = data;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-slate-900">{planDetails.label}</p>
              <p className="text-xs text-slate-400">{planDetails.priceLabel}</p>
            </div>
          </div>
          {data.plan === "free" && (
            <button className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg">Upgrade</button>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">This Month's Usage</p>
        <UsageBar icon={PhoneCall} label="AI Calls" used={usage.calls} limit={planDetails.callsPerMonth} />
        <UsageBar icon={Sparkles} label="Content Generated" used={usage.content} limit={planDetails.contentPerMonth} />
        <UsageBar icon={ImageIcon} label="Images Generated" used={usage.images} limit={planDetails.imagesPerMonth} />
        <UsageBar icon={Video} label="Videos Generated" used={usage.videos} limit={planDetails.videosPerMonth} />
        <p className="text-xs text-slate-400">Resets on the 1st of each month.</p>
      </div>

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">Plan Features</p>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {planDetails.customDomain ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <span className="w-4 h-4 inline-block" />}
          Custom domain
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {planDetails.removeHawlaiBranding ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <span className="w-4 h-4 inline-block" />}
          Remove "Powered by Hawlai"
        </div>
      </div>
    </div>
  );
}
