"use client";

import { useState, useEffect } from "react";
import { Loader2, Crown, CheckCircle2 } from "lucide-react";

interface PlanLimits {
  plan: string;
  label: string;
  priceLabel: string;
  messagesPerDay: number | null;
  teamSeats: number | null;
  adCampaignsActive: number | null;
  callingFreeMinutes: number;
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

export default function UsageView() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/usage").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading usage...</div>;
  if (!data) return <div className="card p-8 text-sm text-red-400">Couldn't load usage data.</div>;

  const { planLimits } = data;

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
          {planLimits.plan !== "max" && (
            <button className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg">Upgrade</button>
          )}
        </div>
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
