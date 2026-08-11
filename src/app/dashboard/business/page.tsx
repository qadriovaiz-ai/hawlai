import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, Users2, Users, CreditCard, Palette, FolderOpen, Link2, Zap, Wand2, Box, ChevronRight, Megaphone, CalendarDays, Percent } from "lucide-react";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import BusinessSwitcherCard from "@/components/business/BusinessSwitcherCard";

// Marketing, Affiliate Marketing, Audience, and Content Calendar were
// real, fully-built pages with no entry point anywhere in the app —
// not in this list, not a chat deep-link, not even a redirect stub.
// affiliateMarketing in particular is a paid Pro-tier feature that was
// unreachable for anyone actually paying for it. Added here rather
// than left to be found only by typing the URL directly.
const ITEMS = [
  { href: "/dashboard/website-builder", label: "Website & Products", desc: "Site editor, products, orders, offers, shipping, payments, domain", icon: Globe },
  { href: "/dashboard/marketing", label: "Marketing", desc: "Strategy, launch ads, campaigns, creative studio, social posts", icon: Megaphone },
  { href: "/dashboard/calendar", label: "Content Calendar", desc: "Plan and track content across every channel", icon: CalendarDays },
  { href: "/dashboard/leads-hub", label: "Leads & CRM", desc: "Pipeline, call history, appointments, retention", icon: Users2 },
  { href: "/dashboard/audience", label: "Audience", desc: "Who your customers are, based on brand voice and real lead data", icon: Users },
  { href: "/dashboard/graphic-design", label: "Design Studio", desc: "Advanced canvas editor, AI-generated graphics, your saved designs", icon: Wand2 },
  { href: "/dashboard/3d-studio", label: "3D Studio", desc: "Real, interactive 3D scenes — describe it, Claude writes the WebGL", icon: Box },
  { href: "/dashboard/autopilot", label: "Autopilot", desc: "Turn on automatic calling, welcome & follow-up emails", icon: Zap },
  { href: "/dashboard/settings/automation", label: "Social Auto-Reply", desc: "Automatic DM & comment replies", icon: Zap },
  { href: "/dashboard/affiliate-marketing", label: "Affiliate Marketing", desc: "People who sell for you and earn commission, tracked automatically", icon: Percent },
  { href: "/dashboard/team", label: "Team", desc: "Invite people, manage roles", icon: Users2 },
  { href: "/dashboard/billing", label: "Billing & Usage", desc: "Plan, usage this month", icon: CreditCard },
  { href: "/dashboard/settings/brand", label: "Brand", desc: "Brand voice, colors, logo, tagline", icon: Palette },
  { href: "/dashboard/assets", label: "Assets", desc: "Generated content, images, videos", icon: FolderOpen },
  { href: "/dashboard/settings/integrations", label: "Integrations", desc: "Meta, Google, Razorpay, Vapi, and more", icon: Link2 },
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
        <p className="text-sm text-slate-500">The administrative side — everything else, Hawlai handles for you in AI Employee.</p>
      </div>

      <BusinessSwitcherCard initialBusinesses={businesses} multiBusinessAllowed={hasFeature(limits, "multiBusiness")} />

      <div className="space-y-2">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="card p-4 flex items-center gap-3 hover:border-brand-300 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <item.icon className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
