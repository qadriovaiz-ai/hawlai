"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Home, Brain, ListChecks, ShieldCheck, Store, Megaphone, BarChart3,
  LayoutGrid, Users, PhoneCall, Settings, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tabHref, type NavNode, type NavSection } from "@/lib/navTree";

const ICONS: Record<string, any> = {
  home: Home, brain: Brain, tasks: ListChecks, approvals: ShieldCheck,
  store: Store, megaphone: Megaphone, chart: BarChart3, grid: LayoutGrid,
  users: Users, phone: PhoneCall, settings: Settings,
};

/**
 * Is this leaf the page currently open?
 *
 * The tab matters. Seven "Website & Products" leaves share one href and
 * differ only by ?tab=, so matching on pathname alone would light all
 * seven at once and tell the person nothing about where they are.
 */
function isLeafActive(node: NavNode, pathname: string, activeTab: string | null): boolean {
  if (!node.href) return false;
  if (pathname !== node.href) return false;
  if (!node.tab) return true;
  return activeTab === node.tab;
}

function containsActive(node: NavNode | NavSection, pathname: string, activeTab: string | null): boolean {
  if ((node as NavNode).href && isLeafActive(node as NavNode, pathname, activeTab)) return true;
  if (node.href && pathname === node.href && !node.children?.length) return true;
  return (node.children ?? []).some((c) => containsActive(c, pathname, activeTab));
}

function Branch({
  node, depth, pathname, activeTab,
}: { node: NavNode; depth: number; pathname: string; activeTab: string | null }) {
  const hasChildren = !!node.children?.length;
  // Open when the current page lives inside it, so a deep link arrives
  // with its own branch already unfolded rather than in a collapsed
  // sidebar that gives no clue where you are.
  const [open, setOpen] = useState(() => containsActive(node, pathname, activeTab));

  if (!hasChildren) {
    const href = tabHref(node.href!, node.tab);
    const active = isLeafActive(node, pathname, activeTab);
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2 rounded-md py-1.5 pr-2 text-[13px] transition-colors",
          active ? "bg-brand-500/10 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-200/60"
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        {node.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] text-slate-700 hover:bg-slate-200/60 transition-colors",
          containsActive(node, pathname, activeTab) && "font-medium"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <ChevronRight className={cn("w-3.5 h-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="flex-1 text-left">{node.label}</span>
      </button>
      {open && (
        <div className="space-y-0.5">
          {node.children!.map((child) => (
            <Branch key={child.label + (child.href ?? "")} node={child} depth={depth + 1} pathname={pathname} activeTab={activeTab} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The accordion.
 *
 * ONE TOP-LEVEL SECTION OPEN AT A TIME. With ~55 leaves across ten
 * sections, allowing several open makes the sidebar taller than the
 * viewport within two clicks, and the thing you opened first scrolls
 * out of sight. Nested levels inside a section stay independent —
 * closing them on each other would fight you while you browse one area.
 */
export default function NavTree({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const activeTab = useSearchParams().get("tab");

  const [openSection, setOpenSection] = useState<string | null>(
    () => sections.find((s) => !s.defaultCollapsed && containsActive(s, pathname, activeTab))?.label
      ?? sections.find((s) => containsActive(s, pathname, activeTab))?.label
      ?? null
  );

  return (
    <div className="space-y-0.5">
      {sections.map((section) => {
        const Icon = ICONS[section.iconKey] ?? LayoutGrid;

        if (!section.children?.length) {
          const active = pathname === section.href || (section.href !== "/dashboard" && !!section.href && pathname.startsWith(section.href));
          return (
            <Link key={section.label} href={section.href!} className={cn("sidebar-link", active ? "sidebar-link-active" : "sidebar-link-inactive")}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{section.label}</span>
            </Link>
          );
        }

        const open = openSection === section.label;
        const holdsActive = containsActive(section, pathname, activeTab);
        return (
          <div key={section.label}>
            <button
              onClick={() => setOpenSection(open ? null : section.label)}
              aria-expanded={open}
              className={cn("sidebar-link w-full", holdsActive ? "sidebar-link-active" : "sidebar-link-inactive")}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{section.label}</span>
              <ChevronRight className={cn("w-3.5 h-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-90")} />
            </button>
            {open && (
              <div className="mt-0.5 space-y-0.5 border-l border-slate-200 ml-4">
                {section.children.map((child) => (
                  <Branch key={child.label + (child.href ?? "")} node={child} depth={0} pathname={pathname} activeTab={activeTab} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
