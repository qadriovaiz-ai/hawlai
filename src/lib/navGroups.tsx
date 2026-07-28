import { Home, Brain, ListChecks, ShieldCheck, Building2 } from "lucide-react";

// Frozen architecture (per the UX Blueprint + "architecture is now
// frozen" directive): exactly 5 nav destinations, matching Home / AI
// Employee / Tasks / Approval Center / Business. Every one of the 21
// departments and 160+ features still exists and works exactly as
// before — this file only changes how they're REACHED. Departments
// classified 🟢 Hidden (SEO, Content, Strategy, Analytics, Research,
// Automation, CRO, etc.) have zero nav presence now — they're used
// automatically by the AI or reached via a deep-link inside a chat
// reply, never browsed to. Departments classified 🔵 Dashboard
// (Website Builder, Products/Orders, Team, Billing, Brand, Domains,
// Integrations) are consolidated inside the single "Business" hub
// page rather than each getting their own top-level sidebar entry.
export const NAV_GROUPS = [
  {
    label: "",
    items: [
      { href: "/dashboard/overview", label: "Home", icon: Home },
      { href: "/chat", label: "AI Employee", icon: Brain },
      { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/dashboard/business", label: "Business", icon: Building2 },
    ],
  },
];
