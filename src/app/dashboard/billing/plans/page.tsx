import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Check, X } from "lucide-react";
import type { PlanKey } from "@/lib/plans";
import UpgradeCta from "@/components/billing/UpgradeCta";

interface PlanRow {
  plan: PlanKey;
  price_inr: number;
  messages_per_day: number | null;
  team_seats: number | null;
  ad_campaigns_active: number | null;
  calling_free_minutes: number;
  calling_margin_inr: number;
  opus_access: "none" | "limited" | "full";
  whatsapp_automation: boolean;
  business_reports: boolean;
  marketing_automation_workflows: boolean;
  competitor_intel: boolean;
  growth_advisor: boolean;
  cro: boolean;
  influencer_marketing: boolean;
  three_d_studio: boolean;
  multi_business: boolean;
}

const PLAN_ORDER: PlanKey[] = ["free", "basic", "pro", "max"];

const PLAN_COPY: Record<PlanKey, { label: string; tagline: string }> = {
  free: { label: "Free", tagline: "Try Hawlai with your real business, no card needed." },
  basic: { label: "Basic", tagline: "Everything a single-location business runs day to day." },
  pro: { label: "Pro", tagline: "Add the intelligence layer — automation, research, growth." },
  max: { label: "Max", tagline: "For agencies and multi-business operators, fully unlocked." },
};

function formatPrice(priceInr: number): { amount: string; period: string } {
  if (priceInr === 0) return { amount: "₹0", period: "forever" };
  return { amount: `₹${priceInr.toLocaleString("en-IN")}`, period: "/month" };
}

function formatLimit(n: number | null, unit: string): string {
  if (n === null) return `Unlimited ${unit}`;
  return `${n.toLocaleString("en-IN")} ${unit}`;
}

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealership_id, dealerships(plan)")
    .eq("id", user.id)
    .single();
  const currentPlan: PlanKey = ((profile as any)?.dealerships?.plan as PlanKey) ?? "free";

  const { data: rows } = await supabase.from("plan_limits").select("*");
  const plans = PLAN_ORDER
    .map((key) => (rows as PlanRow[] | null)?.find((r) => r.plan === key))
    .filter((r): r is PlanRow => Boolean(r));

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      <div className="text-center space-y-2 pt-2">
        <h1 className="text-2xl font-bold text-slate-900">Plans</h1>
        <p className="text-sm text-slate-500 max-w-lg mx-auto">
          Every plan runs the same AI Employee — the difference is depth, volume, and which departments are unlocked.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {plans.map((plan) => {
          const isCurrent = plan.plan === currentPlan;
          const isPro = plan.plan === "pro";
          const price = formatPrice(plan.price_inr);
          const copy = PLAN_COPY[plan.plan];

          return (
            <div
              key={plan.plan}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                isPro
                  ? "border-brand-500/60 bg-gradient-to-b from-brand-600/10 to-transparent shadow-lg shadow-brand-600/10"
                  : "border-slate-200/80 bg-slate-100"
              }`}
            >
              {isPro && (
                <span className="absolute -top-3 left-5 text-[10px] font-semibold tracking-wide uppercase bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-full shadow-sm shadow-brand-600/30">
                  Most businesses pick this
                </span>
              )}

              <div className="space-y-1 mb-4">
                <h2 className="text-base font-bold text-slate-900">{copy.label}</h2>
                <p className="text-xs text-slate-500 leading-snug min-h-[32px]">{copy.tagline}</p>
              </div>

              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-2xl font-bold text-slate-900">{price.amount}</span>
                <span className="text-xs text-slate-400">{price.period}</span>
              </div>

              <UpgradeCta planLabel={copy.label} isCurrent={isCurrent} isFree={plan.plan === "free"} />

              <ul className="mt-5 space-y-2.5 text-xs flex-1">
                <FeatureLine included label={formatLimit(plan.messages_per_day, "AI messages/day")} />
                <FeatureLine included label={formatLimit(plan.team_seats, "team seats")} />
                <FeatureLine
                  included={plan.ad_campaigns_active !== 0}
                  label={plan.ad_campaigns_active === 0 ? "Ad campaigns" : formatLimit(plan.ad_campaigns_active, "active ad campaigns")}
                />
                <FeatureLine
                  included={plan.calling_free_minutes > 0 || plan.plan !== "free"}
                  label={
                    plan.plan === "free"
                      ? "AI phone calling"
                      : `${plan.calling_free_minutes.toLocaleString("en-IN")} free calling min/mo, then Vapi cost + ₹${plan.calling_margin_inr.toFixed(2)}/min`
                  }
                />
                <FeatureLine
                  included={plan.opus_access !== "none"}
                  label={
                    plan.opus_access === "full"
                      ? "Opus AI for all complex work"
                      : plan.opus_access === "limited"
                      ? "Opus AI for Strategy & Brand Kit"
                      : "Opus AI (Strategy, Brand Kit, 3D, Website)"
                  }
                />
                <FeatureLine included label="Website Builder & landing page" />
                <FeatureLine included label="Content, SEO, Social, CRM, Email" />
                <FeatureLine included label="Canvas Editor (Design Studio)" />
                <FeatureLine included={plan.business_reports} label="Full business reports (PDF + PPT)" />
                <FeatureLine included={plan.whatsapp_automation} label="WhatsApp automation" />
                <FeatureLine included={plan.marketing_automation_workflows} label="Marketing automation workflows" />
                <FeatureLine included={plan.competitor_intel} label="Competitor Intel" />
                <FeatureLine included={plan.growth_advisor} label="Growth Advisor" />
                <FeatureLine included={plan.cro} label="Conversion Rate Optimization" />
                <FeatureLine included={plan.influencer_marketing} label="Influencer Marketing" />
                <FeatureLine included={plan.three_d_studio} label="3D Studio" />
                <FeatureLine included={plan.multi_business} label="Multi-business / agency mode" />
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-400">
        Calling minutes billed transparently on your Usage page — you always see exactly what you've used before anything extra is charged.
      </p>
    </div>
  );
}

function FeatureLine({ included, label }: { included: boolean; label: string }) {
  return (
    <li className={`flex items-start gap-2 ${included ? "text-slate-700" : "text-slate-400"}`}>
      {included ? (
        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <X className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
      )}
      <span>{label}</span>
    </li>
  );
}
