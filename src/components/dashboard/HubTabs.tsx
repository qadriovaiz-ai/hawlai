"use client";

import { Suspense, useState, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

interface HubTabsProps {
  title: string;
  description: string;
  icon: ReactNode;
  tabs: Tab[];
}

// useSearchParams() requires a Suspense ancestor — split into an outer
// shell + inner component rather than pushing that requirement onto
// every caller (marketing/insights/leads-hub pages).
export default function HubTabs(props: HubTabsProps) {
  return (
    <Suspense fallback={null}>
      <HubTabsInner {...props} />
    </Suspense>
  );
}

function HubTabsInner({ title, description, icon, tabs }: HubTabsProps) {
  // Lets a link deep-link straight to a specific tab (e.g.
  // /dashboard/marketing?tab=launch) instead of always landing on
  // tabs[0] — used by Home's "Launch New Ad" CTA and the retired
  // crm-marketing redirect, so the destination actually matches what
  // the link promised.
  const requestedTab = useSearchParams().get("tab");
  const [activeKey, setActiveKey] = useState(
    tabs.some((t) => t.key === requestedTab) ? (requestedTab as string) : tabs[0]?.key
  );
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveKey(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px",
                isActive
                  ? "border-brand-600 text-brand-300"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in-up">{active?.content}</div>
    </div>
  );
}
