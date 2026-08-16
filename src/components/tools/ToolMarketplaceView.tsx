"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight, Lock, MessageCircle } from "lucide-react";
import { TOOL_CATALOG, TOOL_DEPARTMENTS, type ToolCatalogEntry } from "@/lib/toolCatalog";
import { hasFeature, GATED_FEATURE_LABELS, GATED_FEATURE_MIN_PLAN, PLAN_LABELS, type PlanLimits, type GatedFeatureKey, type PlanKey } from "@/lib/plans";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

type TierFilter = "all" | "free" | "pro" | "agency";

// Same one-line copy featureGate.ts's upgradeMessage() generates —
// replicated here rather than imported, since that file also imports
// NextResponse and a Supabase client (server-only), not safe to pull
// into a client bundle just for this one string.
function upgradeMessage(feature: GatedFeatureKey): string {
  return `${GATED_FEATURE_LABELS[feature]} needs the ${PLAN_LABELS[GATED_FEATURE_MIN_PLAN[feature]]} plan or higher.`;
}

function minPlanTier(entry: ToolCatalogEntry): TierFilter {
  if (!entry.gateKey) return "free";
  const minPlan = GATED_FEATURE_MIN_PLAN[entry.gateKey as GatedFeatureKey] as PlanKey;
  return minPlan === "agency" ? "agency" : "pro";
}

export default function ToolMarketplaceView({ limits }: { limits: PlanLimits }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  const unlockedCount = useMemo(
    () => TOOL_CATALOG.filter((t) => !t.gateKey || hasFeature(limits, t.gateKey as GatedFeatureKey)).length,
    [limits]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TOOL_CATALOG.filter((t) => {
      if (deptFilter !== "all" && t.department !== deptFilter) return false;
      if (tierFilter !== "all" && minPlanTier(t) !== tierFilter) return false;
      if (q && !`${t.label} ${t.description} ${t.department}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, tierFilter, deptFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolCatalogEntry[]>();
    for (const dept of TOOL_DEPARTMENTS) {
      const items = filtered.filter((t) => t.department === dept);
      if (items.length > 0) map.set(dept, items);
    }
    return map;
  }, [filtered]);

  function handleToolClick(entry: ToolCatalogEntry) {
    if (entry.gateKey && !hasFeature(limits, entry.gateKey as GatedFeatureKey)) {
      setLockedMessage(upgradeMessage(entry.gateKey as GatedFeatureKey));
      return;
    }
    router.push(entry.kind === "chat" ? "/chat" : entry.route);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tool Marketplace</h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse every agent and tool by department. Run it in chat with context already loaded, or open its dedicated workspace.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {TOOL_CATALOG.length} AI tools across {TOOL_DEPARTMENTS.length} departments · {unlockedCount} of {TOOL_CATALOG.length} unlocked on your plan
          </p>
        </div>
        <Badge tone="brand" className="shrink-0">{limits.label} plan</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search tools, departments or keywords — try "whatsapp" or "ads"'
          className="pl-9 pr-9"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "free", "pro", "agency"] as TierFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              tierFilter === t ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {t === "all" ? "All" : t === "free" ? "Free" : t === "pro" ? "Pro+" : "Agency"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setDeptFilter("all")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            deptFilter === "all" ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          All
        </button>
        {TOOL_DEPARTMENTS.map((dept) => (
          <button
            key={dept}
            onClick={() => setDeptFilter(dept)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              deptFilter === dept ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      {grouped.size === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">No tools match this search.</p>
      ) : (
        Array.from(grouped.entries()).map(([dept, items]) => (
          <div key={dept} className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-bold text-slate-800">{dept}</h2>
              <span className="text-xs text-slate-400">{items.length} tool{items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {items.map((entry) => {
                const locked = !!entry.gateKey && !hasFeature(limits, entry.gateKey as GatedFeatureKey);
                const tier = minPlanTier(entry);
                return (
                  <Card
                    key={entry.id}
                    onClick={() => handleToolClick(entry)}
                    className={`p-4 cursor-pointer transition-colors hover:border-slate-300 ${locked ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                      <Badge tone={tier === "free" ? "neutral" : tier === "agency" ? "brand" : "warning"} className="shrink-0">
                        {tier === "free" ? "Free" : tier === "agency" ? "Agency" : "Pro+"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">{entry.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {entry.kind === "chat" ? <MessageCircle className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                        {entry.kind === "chat" ? "Runs in chat" : entry.kind === "both" ? "Chat or dedicated page" : "Dedicated page"}
                      </span>
                      {locked && (
                        <span className="flex items-center gap-1 text-amber-500 font-medium">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      {lockedMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1">{lockedMessage}</span>
          <a href="/dashboard/billing/plans" className="text-brand-300 font-semibold hover:underline shrink-0">View plans</a>
          <button onClick={() => setLockedMessage(null)} className="text-slate-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
