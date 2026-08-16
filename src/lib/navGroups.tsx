import { Home, Brain, ListChecks, ShieldCheck, Building2, Store } from "lucide-react";

// Was frozen at exactly 5 nav destinations (per the UX Blueprint);
// deliberately reopened to 6 to add direct Tools access — Home / AI
// Employee / Tasks / Approval Center / Business / Tools. Every one of
// the 21 departments and 160+ features still exists and works exactly
// as before — this file only changes how they're REACHED. Departments
// classified 🟢 Hidden (SEO, Content, Strategy, Analytics, Research,
// Automation, CRO, etc.) have zero nav presence — they're used
// automatically by the AI or reached via a deep-link inside a chat
// reply, never browsed to directly. Departments classified 🔵
// Dashboard (Website Builder, Products/Orders, Team, Billing, Brand,
// Domains, Integrations) are consolidated inside the single "Business"
// hub page rather than each getting their own top-level sidebar entry.
// Tools (/dashboard/tools) isn't one of the 21 departments itself — a
// browsable index across all of them (see src/lib/toolCatalog.ts) —
// which is exactly why it earned a direct nav slot rather than staying
// buried in AI Employee's Main Menu: unlike a single department, it's
// nobody's home page, only ever a place people jump *through*.
export const NAV_GROUPS = [
  {
    label: "",
    items: [
      { href: "/dashboard/overview", label: "Home", icon: Home },
      { href: "/chat", label: "AI Employee", icon: Brain },
      { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/dashboard/business", label: "Business", icon: Building2 },
      { href: "/dashboard/tools", label: "Tools", icon: Store },
    ],
  },
];
