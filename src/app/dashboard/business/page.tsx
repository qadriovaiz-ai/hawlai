import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, Users2, CreditCard, Palette, FolderOpen, Link2, Zap, ChevronRight } from "lucide-react";

const ITEMS = [
  { href: "/dashboard/website-builder", label: "Website & Products", desc: "Site editor, products, orders, offers, shipping, payments, domain", icon: Globe },
  { href: "/dashboard/autopilot", label: "Autopilot", desc: "Turn on automatic calling, welcome & follow-up emails", icon: Zap },
  { href: "/dashboard/settings/automation", label: "Social Auto-Reply", desc: "Automatic DM & comment replies", icon: Zap },
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Business</h1>
        <p className="text-sm text-slate-500">The administrative side — everything else, Hawlai handles for you in AI Employee.</p>
      </div>

      <div className="space-y-2">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="card p-4 flex items-center gap-3 hover:border-purple-300 transition-colors">
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
