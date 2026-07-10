"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Check, X, ArrowRight, AlertCircle } from "lucide-react";

const PRIORITY_STYLE: Record<string, string> = {
  high: "border-l-red-400 bg-red-50/50",
  medium: "border-l-amber-400 bg-amber-50/50",
  low: "border-l-slate-300 bg-slate-50/50",
};

const PRIORITY_ICON: Record<string, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-slate-400",
};

interface Opportunity {
  id: string;
  title: string;
  description?: string | null;
  priority: "high" | "medium" | "low";
  action_href?: string | null;
}

export default function OpportunityFeed({ initial }: { initial: Opportunity[] }) {
  const [items, setItems] = useState(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAction(id: string, status: "completed" | "dismissed") {
    setLoadingId(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setLoadingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card p-5 flex items-center gap-3 bg-green-50/50 border-green-100">
        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
          <Check className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-800">You're all caught up</p>
          <p className="text-xs text-green-600">No open opportunities right now</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-500" />
        <h2 className="text-sm font-semibold text-slate-700">Opportunities</h2>
        <span className="text-xs text-slate-400">({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 border-l-4 rounded-r-lg p-3 ${PRIORITY_STYLE[item.priority]} animate-fade-in-up`}
          >
            <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${PRIORITY_ICON[item.priority]}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
              {item.action_href && (
                <Link href={item.action_href} className="text-xs text-brand-600 font-medium hover:underline inline-flex items-center gap-0.5 mt-1">
                  Go fix this <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleAction(item.id, "completed")}
                disabled={loadingId === item.id}
                title="Mark as done"
                className="w-7 h-7 flex items-center justify-center rounded-md text-green-600 hover:bg-green-100 transition-colors disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleAction(item.id, "dismissed")}
                disabled={loadingId === item.id}
                title="Dismiss"
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
