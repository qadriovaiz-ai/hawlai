import { Home, Brain, ListChecks, ShieldCheck, Building2, Store, PhoneCall } from "lucide-react";
import type { ProductMode } from "@/lib/onboarding/intentRouter";

// Was frozen at exactly 5 nav destinations (per the UX Blueprint);
// deliberately reopened to 6 to add direct Tools access — Home / AI
// Employee / Work / Approval Center / Business / Tools. Every one of
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
      // Route stays /dashboard/tasks — every existing deep link points
      // there. Only the label changed, because the page now shows
      // Hawlai's own work alongside human tasks (UX Transformation
      // piece 2), and "Tasks" undersold that.
      { href: "/dashboard/tasks", label: "Work", icon: ListChecks },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/dashboard/business", label: "Business", icon: Building2 },
      { href: "/dashboard/tools", label: "Tools", icon: Store },
    ],
  },
];

// UX Transformation piece 5a — mode-aware navigation.
//
// The confirmed decision was "moderate narrowing: don't hide other
// capabilities, but don't force unrelated things on a focused user."
// Applied honestly, that means ADDING rather than subtracting: the
// nav is already only 6 items, and every one of them (Home, AI
// Employee, Work, Approvals, Business, Tools) is something any
// customer needs regardless of mode. Removing any of them would make
// the product worse, not more focused.
//
// What a calling-focused customer actually lacked was a direct route
// to their calling workspace — they had to go hunting through the
// Business hub. So mode adds one destination and removes nothing.
const MODE_ITEM: Partial<Record<ProductMode, { href: string; label: string; icon: typeof Home }>> = {
  calling: { href: "/dashboard/calling", label: "Calling", icon: PhoneCall },
  // The other modes get their entry once each has a real workspace
  // worth linking to. Adding a nav item that points at a page which
  // doesn't focus anything would be navigation theatre.
};

export function getNavGroups(mode: ProductMode | null | undefined) {
  const extra = mode ? MODE_ITEM[mode] : undefined;
  if (!extra) return NAV_GROUPS;

  const [base] = NAV_GROUPS;
  // Inserted after AI Employee: it's the customer's main working
  // surface, so it belongs above the general-purpose destinations
  // rather than appended at the end.
  const items = [...base.items];
  items.splice(2, 0, extra);
  return [{ label: base.label, items }];
}
