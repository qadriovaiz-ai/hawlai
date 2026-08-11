"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/navGroups";

// Mobile-only (md:hidden) replacement for Sidebar.tsx below the desktop
// breakpoint. Reuses NAV_GROUPS directly — same 5 hrefs/icons as the
// desktop sidebar and MainMenuPanel, so there's exactly one source of
// truth for "what are the 5 destinations," not three drifting copies.
//
// Deliberately doesn't render on /chat (AI Employee) — that screen has
// its own off-canvas ConversationSidebar + Main Menu already, and a
// permanent 60px bottom bar would compete with the one screen that
// most needs its vertical space (message thread + composer).
export default function MobileTabBar({ pendingApprovalsCount }: { pendingApprovalsCount: number }) {
  const pathname = usePathname();
  const items = NAV_GROUPS[0].items;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-100 border-t border-slate-200 flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              isActive ? "text-brand-400" : "text-slate-500"
            )}
          >
            <span className="relative">
              <Icon className="w-5 h-5" />
              {href === "/dashboard/approvals" && pendingApprovalsCount > 0 && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-100" />
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
