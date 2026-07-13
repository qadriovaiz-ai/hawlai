"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Megaphone, ShieldCheck, Sparkles,
  CalendarDays, BarChart3, Zap, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
      { href: "/dashboard/leads-hub", label: "Leads & Sales", icon: Users },
      { href: "/dashboard/insights", label: "Insights", icon: BarChart3 },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/settings/brand", label: "Brand Voice", icon: Sparkles },
      { href: "/dashboard/settings/automation", label: "Automation", icon: Zap },
      { href: "/dashboard/settings/integrations", label: "Integrations", icon: Link2 },
    ],
  },
];

export default function Sidebar({ dealershipName }: { dealershipName: string }) {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-slate-100 border-r border-slate-200 flex flex-col h-full shrink-0">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 shadow-sm shadow-brand-600/30">
            <Image src="/logo-icon.png" alt="Hawlai" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Hawlai</p>
            <p className="text-xs text-slate-500 truncate">{dealershipName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                return (
                  <Link key={href} href={href} className={cn("sidebar-link", isActive ? "sidebar-link-active" : "sidebar-link-inactive")}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="bg-brand-900/40 border border-brand-700/40 rounded-lg p-3">
          <p className="text-xs font-semibold text-brand-300 mb-0.5">AI Engine Active</p>
          <p className="text-xs text-brand-400">Scoring leads automatically</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full w-2 h-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-green-400 font-medium">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
