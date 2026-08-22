import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, Users2, Users, CreditCard, Palette, FolderOpen, Link2, Zap, Wand2, Box, ChevronRight, Megaphone, CalendarDays, Percent, Lock, Briefcase, BookOpen, MessageSquareWarning, IndianRupee, History, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { getDealershipPlanLimits, hasFeature, GATED_FEATURE_MIN_PLAN, PLAN_LABELS, type GatedFeatureKey } from "@/lib/plans";
import BusinessSwitcherCard from "@/components/business/BusinessSwitcherCard";

interface HubItem {
  href: string;
  label: string;
  desc: string;
  icon: typeof Globe;
  feature?: GatedFeatureKey; // set only when this item's own page actually enforces a plan gate
}

// Grouped rather than one flat 15-item list — a plain vertical list
// stopped being scannable in under 2 seconds once Marketing, Content
// Calendar, Audience, and Affiliate Marketing were added here (all 4
// were previously unreachable from anywhere in the app at all — see
// migration in the IA-audit commit).
const SECTIONS: { label: string; items: HubItem[] }[] = [
  {
    label: "Sell",
    items: [
      { href: "/dashboard/website-builder", label: "Website & Products", desc: "Site editor, products, orders, offers, shipping, payments, domain", icon: Globe },
      { href: "/dashboard/marketing", label: "Marketing", desc: "Strategy, launch ads, campaigns, creative studio, social posts", icon: Megaphone },
      { href: "/dashboard/calendar", label: "Content Calendar", desc: "Plan and track content across every channel", icon: CalendarDays },
      { href: "/dashboard/affiliate-marketing", label: "Affiliate Marketing", desc: "People who sell for you and earn commission, tracked automatically", icon: Percent, feature: "affiliateMarketing" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/dashboard/leads-hub", label: "Leads & CRM", desc: "Pipeline, call history, appointments, retention", icon: Users2 },
      { href: "/dashboard/complaints", label: "Complaints", desc: "Raised on calls, tracked through to resolution", icon: MessageSquareWarning },
      { href: "/dashboard/refunds", label: "Refund Requests", desc: "Raised on calls — every one needs your approval before money moves", icon: IndianRupee },
      { href: "/dashboard/audience", label: "Audience", desc: "Who your customers are, based on brand voice and real lead data", icon: Users },
    ],
  },
  {
    label: "Creative Tools",
    items: [
      { href: "/dashboard/graphic-design", label: "Design Studio", desc: "Advanced canvas editor, AI-generated graphics, your saved designs", icon: Wand2 },
      { href: "/dashboard/3d-studio", label: "3D Studio", desc: "Real, interactive 3D scenes — describe it, Claude writes the WebGL", icon: Box, feature: "threeDStudio" },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/dashboard/autopilot", label: "Autopilot", desc: "Every automation toggle in one place — calling, emails, social, campaigns, seasonal prep", icon: Zap },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/agency-portfolio", label: "Portfolio", desc: "Every business you manage, at a glance", icon: Briefcase, feature: "multiBusiness" },
      { href: "/dashboard/agency-branding", label: "Agency Branding", desc: "White-label client reports with your own logo and colors", icon: Palette, feature: "multiBusiness" },
      { href: "/dashboard/agency-team", label: "Agency Team", desc: "Who can reach which client, and as what — one screen for every business", icon: Users2, feature: "multiBusiness" },
      { href: "/dashboard/agency-billing", label: "Agency Billing", desc: "What each client costs you to run this month", icon: CreditCard, feature: "multiBusiness" },
      { href: "/dashboard/agency-limits", label: "Client Limits", desc: "Cap what each client can use, below what their plan includes", icon: SlidersHorizontal, feature: "multiBusiness" },
      { href: "/dashboard/team", label: "Team", desc: "Invite people, manage roles", icon: Users2 },
      { href: "/dashboard/audit-log", label: "Audit Log", desc: "Every approval decision, AI call action, and auto-pause — who/what did it and when", icon: History },
      { href: "/dashboard/settings/security", label: "Security", desc: "Two-factor authentication, SSO, and customer data requests", icon: ShieldCheck },
      { href: "/dashboard/billing", label: "Billing & Usage", desc: "Plan, usage this month", icon: CreditCard },
      { href: "/dashboard/settings/brand", label: "Brand", desc: "Brand voice, colors, logo, tagline", icon: Palette },
      { href: "/dashboard/settings/knowledge-base", label: "Business Knowledge", desc: "Hours, pricing notes, policies, FAQs the AI can use on calls", icon: BookOpen },
      { href: "/dashboard/assets", label: "Assets", desc: "Generated content, images, videos", icon: FolderOpen },
      { href: "/dashboard/settings/integrations", label: "Integrations", desc: "Meta, Google, Razorpay, Vapi, and more", icon: Link2 },
    ],
  },
];

export default async function BusinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [limits, { data: ownedBusinesses }] = await Promise.all([
    getDealershipPlanLimits(supabase, dealershipId),
    supabase.from("dealerships").select("id, dealership_name, city, plan").eq("owner_id", user.id).order("created_at", { ascending: true }),
  ]);
  const businesses = (ownedBusinesses ?? []).map((b) => ({ ...b, active: b.id === dealershipId }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Business</h1>
        <p className="text-sm text-slate-500">Everything you might want to open and use directly — for anything else, just ask in AI Employee.</p>
      </div>

      <BusinessSwitcherCard initialBusinesses={businesses} multiBusinessAllowed={hasFeature(limits, "multiBusiness")} />

      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-1 pb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{section.label}</p>
            <div className="space-y-2">
              {section.items.map((item) => {
                const locked = item.feature ? !hasFeature(limits, item.feature) : false;
                return (
                  <Link key={item.href} href={item.href} className="card p-4 flex items-center gap-3 hover:border-brand-300 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        {locked && item.feature && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-500 border border-brand-400/30">
                            <Lock className="w-2.5 h-2.5" /> {PLAN_LABELS[GATED_FEATURE_MIN_PLAN[item.feature]]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
