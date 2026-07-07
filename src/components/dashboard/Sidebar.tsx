"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Phone, Calendar, BarChart3,
  PhoneCall, Car, ChevronRight, Megaphone, Settings, Brain
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/master-brain", label: "Master Brain", icon: Brain },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/queue", label: "Call Queue", icon: PhoneCall },
  { href: "/dashboard/calls", label: "Call History", icon: Phone },
  { href: "/dashboard/appointments", label: "Appointments", icon: Calendar },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/ads/full-launch", label: "Launch Ad", icon: Megaphone },
  { href: "/dashboard/settings/connect-facebook", label: "Settings", icon: Settings },
];

export default function Sidebar({ dealershipName }: { dealershipName: string }) {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">AutoPilot AI</p>
            <p className="text-xs text-slate-500 truncate">{dealershipName}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Main Menu
        </p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={cn("sidebar-link", isActive ? "sidebar-link-active" : "sidebar-link-inactive")}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {isActive && <ChevronRight className="w-3 h-3 opacity-40" />}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <div className="bg-brand-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-brand-700 mb-0.5">AI Engine Active</p>
          <p className="text-xs text-brand-600">Scoring leads automatically</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-xs text-green-600 font-medium">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
