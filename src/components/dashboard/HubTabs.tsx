"use client";

import { useState, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

export default function HubTabs({ title, description, icon, tabs }: {
  title: string;
  description: string;
  icon: ReactNode;
  tabs: Tab[];
}) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
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
                  ? "border-brand-600 text-brand-700"
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
