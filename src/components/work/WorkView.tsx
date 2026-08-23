"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Play, Bell, CalendarClock, CheckCheck, AlertCircle } from "lucide-react";
import { ActivityRow } from "@/components/activity/ActivityFeed";
import type { ActivityItem } from "@/lib/activity/activityFeed";

// UX Transformation, Piece 2 — the AI-work half of the Work page.
//
// /dashboard/tasks already showed HUMAN tasks and goals, and those are
// preserved untouched below this component. What was missing was any
// answer to "what is Hawlai itself doing right now" — agent_tasks and
// automation runs were only visible inside the Autopilot page, framed
// as configuration rather than activity.
//
// Reuses the activity feed's grouping so this page and Home can never
// disagree about what counts as "now".

interface Grouped {
  now: ActivityItem[];
  needsYou: ActivityItem[];
  scheduled: ActivityItem[];
  completed: ActivityItem[];
}

const SECTIONS: {
  key: keyof Grouped;
  label: string;
  icon: typeof Play;
  empty: string;
  /** Only sections that represent something outstanding stay visible when empty — an empty "Completed" is just noise. */
  showWhenEmpty: boolean;
}[] = [
  { key: "now", label: "Now", icon: Play, empty: "Hawlai isn't running anything this moment.", showWhenEmpty: true },
  { key: "needsYou", label: "Waiting for you", icon: Bell, empty: "Nothing needs your attention.", showWhenEmpty: true },
  { key: "scheduled", label: "Scheduled", icon: CalendarClock, empty: "Nothing scheduled.", showWhenEmpty: false },
  { key: "completed", label: "Recently completed", icon: CheckCheck, empty: "Nothing completed yet.", showWhenEmpty: false },
];

export default function WorkView() {
  const [grouped, setGrouped] = useState<Grouped | null>(null);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    fetch("/api/activity?grouped=1&limit=60")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setGrouped(d.grouped ?? null);
        setPartial(!!d.partial);
      })
      .catch(() => setGrouped({ now: [], needsYou: [], scheduled: [], completed: [] }));
  }, []);

  if (grouped === null) {
    return (
      <div className="card p-5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading work...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {partial && (
        <div className="flex items-start gap-2 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Some activity couldn&apos;t be loaded, so this may be incomplete.</span>
        </div>
      )}

      {SECTIONS.map(({ key, label, icon: Icon, empty, showWhenEmpty }) => {
        const items = grouped[key] ?? [];
        if (items.length === 0 && !showWhenEmpty) return null;

        return (
          <div key={key} className="card p-5 space-y-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Icon className="w-4 h-4 text-slate-400" /> {label}
              </p>
              {items.length > 0 && (
                <span className="text-[10.5px] text-slate-400 tabular-nums">{items.length}</span>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">{empty}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.slice(0, key === "completed" ? 10 : undefined).map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            )}

            {key === "needsYou" && items.some((i) => i.kind === "approval") && (
              <Link href="/dashboard/approvals" className="inline-block text-xs text-brand-500 hover:text-brand-400 pt-1">
                Go to Approvals →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
