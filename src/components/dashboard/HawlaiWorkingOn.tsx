"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";
import { ActivityRow } from "@/components/activity/ActivityFeed";
import type { ActivityItem } from "@/lib/activity/activityFeed";

// UX Transformation, Piece 3 — the "What is Hawlai working on?" half
// of Home. Compact by design: Home answers the question, Work is where
// you go to actually look at it.
//
// Renders nothing at all when there's no live work. An empty "Hawlai
// is working on: nothing" card every time you open Home would make the
// product feel idle rather than calm — the absence of the card IS the
// signal, and Recent results below still shows what got done.
export default function HawlaiWorkingOn({ max = 4 }: { max?: number }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    fetch("/api/activity?grouped=1&limit=60")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        const g = d.grouped ?? {};
        setItems([...(g.now ?? []), ...(g.scheduled ?? [])]);
      })
      .catch(() => setItems([]));
  }, []);

  if (items === null) {
    return (
      <div className="card p-5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking what&apos;s running...
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="card p-5 space-y-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-slate-700">Hawlai is working on</p>
        <Link href="/dashboard/tasks" className="text-xs text-brand-500 hover:text-brand-400 inline-flex items-center gap-1">
          See all work <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {items.slice(0, max).map((item) => <ActivityRow key={item.id} item={item} />)}
      </div>
      {items.length > max && (
        <p className="text-[10.5px] text-slate-400 pt-1">+{items.length - max} more</p>
      )}
    </div>
  );
}
