"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Crown, CheckCircle2, MessageSquare, PhoneCall, Megaphone, Image as ImageIcon, Video, Mic, Palette, Globe, Search } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

interface PlanLimits {
  plan: string;
  label: string;
  priceLabel: string;
  messagesPerDay: number | null;
  teamSeats: number | null;
  adCampaignsActive: number | null;
  callingFreeMinutes: number;
  imagesPerMonth: number | null;
  videosPerMonth: number | null;
  voiceoverCharsPerMonth: number | null;
  brandKitsPerMonth: number | null;
  websiteBuildsPerMonth: number | null;
  researchCreditsPerMonth: number | null;
  whatsappAutomation: boolean;
  businessReports: boolean;
  marketingAutomationWorkflows: boolean;
  competitorIntel: boolean;
  growthAdvisor: boolean;
  cro: boolean;
  influencerMarketing: boolean;
  threeDStudio: boolean;
  multiBusiness: boolean;
}

interface UsageData {
  planLimits: PlanLimits;
  messagesUsedToday: number;
  calling: { minutesUsed: number; extraMinutesCharged: number; extraChargeInr: number };
  activeAdCampaigns: number;
  researchCreditsUsed: number;
  generation: { image: number; video: number; voiceoverChars: number; brandKit: number; websiteBuild: number };
}

const FEATURE_ROWS: { key: keyof PlanLimits; label: string }[] = [
  { key: "whatsappAutomation", label: "WhatsApp Automation" },
  { key: "businessReports", label: "Business Reports" },
  { key: "marketingAutomationWorkflows", label: "Marketing Automation Workflows" },
  { key: "competitorIntel", label: "Competitor Intel" },
  { key: "growthAdvisor", label: "Growth Advisor" },
  { key: "cro", label: "CRO" },
  { key: "influencerMarketing", label: "Influencer Marketing" },
  { key: "threeDStudio", label: "3D Studio" },
  { key: "multiBusiness", label: "Multi-Business" },
];

function UsageBar({ icon: Icon, label, used, limit, suffix }: { icon: any; label: string; used: number; limit: number | null; suffix?: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearLimit = limit != null && pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 text-slate-700"><Icon className="w-4 h-4 text-slate-400" /> {label}</span>
        <span className={nearLimit ? "text-red-500 font-medium" : "text-slate-500"}>
          {used}{suffix ?? ""} {limit != null ? `/ ${limit}${suffix ?? ""}` : "(unlimited)"}
        </span>
      </div>
      {limit != null && (
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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

  const { planLimits, messagesUsedToday, calling, activeAdCampaigns, researchCreditsUsed, generation } = data;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-slate-900">{planLimits.label}</p>
              <p className="text-xs text-slate-400">{planLimits.priceLabel}</p>
            </div>
          </div>
          {planLimits.plan !== "agency" && (
            <Link href="/dashboard/billing/plans" className={buttonClasses("primary", "sm")}>Upgrade</Link>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Usage</p>
        <UsageBar icon={MessageSquare} label="Messages Today" used={messagesUsedToday} limit={planLimits.messagesPerDay} />
        <UsageBar icon={Megaphone} label="Active Ad Campaigns" used={activeAdCampaigns} limit={planLimits.adCampaignsActive} />
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="flex items-center gap-1.5 text-slate-700"><PhoneCall className="w-4 h-4 text-slate-400" /> Calling Minutes This Month</span>
            <span className="text-slate-500">{calling.minutesUsed} / {planLimits.callingFreeMinutes} included</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${calling.extraMinutesCharged > 0 ? "bg-red-400" : "bg-purple-500"}`}
              style={{ width: `${planLimits.callingFreeMinutes ? Math.min(100, Math.round((calling.minutesUsed / planLimits.callingFreeMinutes) * 100)) : 0}%` }}
            />
          </div>
          {calling.extraMinutesCharged > 0 && (
            <p className="text-xs text-red-500 mt-1">
              {calling.extraMinutesCharged} extra min this month — ₹{calling.extraChargeInr.toFixed(2)} extra charge
            </p>
          )}
        </div>
        <p className="text-xs text-slate-400">Messages reset daily, calling minutes reset on the 1st of each month.</p>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Web Intelligence</p>
        <UsageBar icon={Search} label="Research Credits" used={researchCreditsUsed} limit={planLimits.researchCreditsPerMonth} />
        <p className="text-xs text-slate-400">Used automatically whenever the AI researches your industry, market, or competitors. Resets on the 1st of each month.</p>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Generation Usage This Month</p>
        <UsageBar icon={ImageIcon} label="Images" used={generation.image} limit={planLimits.imagesPerMonth} />
        <UsageBar icon={Video} label="Videos" used={generation.video} limit={planLimits.videosPerMonth} />
        <UsageBar icon={Mic} label="Voiceover Characters" used={generation.voiceoverChars} limit={planLimits.voiceoverCharsPerMonth} />
        <UsageBar icon={Palette} label="Brand Kits" used={generation.brandKit} limit={planLimits.brandKitsPerMonth} />
        <UsageBar icon={Globe} label="Website Builds" used={generation.websiteBuild} limit={planLimits.websiteBuildsPerMonth} />
        <p className="text-xs text-slate-400">Resets on the 1st of each month.</p>
      </div>

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">Plan Features</p>
        {FEATURE_ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-sm text-slate-600">
            {planLimits[key] ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <span className="w-4 h-4 inline-block" />}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
