"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2, PhoneCall, Users, Megaphone, FileText, Search,
  ShieldCheck, Lock, Bell, Zap, ChevronRight, AlertCircle,
} from "lucide-react";
import type { ActivityItem, ActivityStatus } from "@/lib/activity/activityFeed";

// UX Transformation, Piece 1 — the shared timeline component.
// Used by the Work page and Home, so both render activity identically
// rather than each growing its own slightly different version.

const KIND_ICON: Record<ActivityItem["kind"], typeof PhoneCall> = {
  call: PhoneCall,
  lead: Users,
  campaign: Megaphone,
  content: FileText,
  research: Search,
  approval: ShieldCheck,
  privacy: Lock,
  alert: Bell,
  work: Zap,
};

const STATUS_STYLE: Record<ActivityStatus, { dot: string; label: string | null }> = {
  in_progress: { dot: "bg-blue-500", label: "In progress" },
  needs_you: { dot: "bg-amber-500", label: "Needs you" },
  scheduled: { dot: "bg-slate-400", label: "Scheduled" },
  failed: { dot: "bg-red-400", label: "Didn't complete" },
  done: { dot: "bg-green-500", label: null },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const future = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = KIND_ICON[item.kind] ?? Zap;
  const style = STATUS_STYLE[item.status];

  const body = (
    <div className="flex items-start gap-3 py-2.5">
      <div className="relative shrink-0 mt-0.5">
        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <span className={`absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full ring-2 ring-slate-100 ${style.dot}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm text-slate-700">{item.title}</p>
          {style.label && (
            <span className="text-[10px] font-medium text-slate-400">{style.label}</span>
          )}
        </div>
        {item.detail && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{item.detail}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10.5px] text-slate-400 tabular-nums whitespace-nowrap">{relativeTime(item.at)}</span>
        {item.href && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
      </div>
    </div>
  );

  if (!item.href) return <div className="px-1">{body}</div>;
  return (
    <Link href={item.href} className="block px-1 -mx-1 rounded-lg hover:bg-slate-200/50 transition-colors">
      {body}
    </Link>
  );
}

export default function ActivityFeed({
  limit = 25,
  title = "Recent activity",
  emptyMessage = "Nothing yet — this fills in as Hawlai works.",
}: {
  limit?: number;
  title?: string | null;
  emptyMessage?: string;
}) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    fetch(`/api/activity?limit=${limit}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setItems(d.items ?? []);
        setPartial(!!d.partial);
      })
      .catch(() => setItems([]));
  }, [limit]);

  if (items === null) {
    return (
      <div className="card p-5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading activity...
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-1">
      {title && <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>}

      {partial && (
        <div className="flex items-start gap-2 mb-2 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Some activity couldn&apos;t be loaded, so this list may be incomplete.</span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => <ActivityRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
