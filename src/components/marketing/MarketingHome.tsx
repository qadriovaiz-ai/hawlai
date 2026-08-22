import Link from "next/link";
import ApprovalSlip from "@/components/marketing/ApprovalSlip";
import { Check } from "lucide-react";
import { buildGoogleFontsUrl } from "@/lib/googleFontsUrl";
import { createServiceClient } from "@/lib/supabase/service";
import type { PlanKey } from "@/lib/plans";

// Previously next/font/google's Space Grotesk + IBM Plex Mono — their
// build-time font fetch failing (fonts.gstatic.com hiccup) took down the
// whole Vercel build. Loaded as a runtime stylesheet <link> instead (see
// googleFontsUrl.ts). Also fixes a pre-existing mismatch: tailwind.config.ts's
// `heading`/`code` fontFamily keys read var(--font-display)/var(--font-mono),
// but this previously set --font-heading/--font-code — those Tailwind
// classes were silently falling back to generic sans-serif/monospace.
const fontStylesheetUrl = buildGoogleFontsUrl([
  { name: "Space Grotesk", weights: ["500", "700"] },
  { name: "IBM Plex Mono", weights: ["400", "500"] },
]);

const DEPARTMENT_GROUPS = [
  {
    name: "Content & Creative",
    items: ["Content Marketing", "SEO", "Graphic Design", "Video Marketing", "3D Studio", "Website Builder"],
  },
  {
    name: "Growth & Advertising",
    items: ["Paid Ads", "Social Media", "Email Marketing", "Influencer Marketing", "Automation Workflows", "Conversion Optimization"],
  },
  {
    name: "Sales & Operations",
    items: ["Leads & CRM", "WhatsApp Business", "AI Calling", "Appointments", "Team Management", "Client Reports"],
  },
  {
    name: "Strategy & Intelligence",
    items: ["Brand Strategy", "Competitor Intel", "Growth Advisor", "Customer Retention", "Business Insights"],
  },
];

// Prices are NOT hardcoded here — they're fetched from plan_limits
// below (the same table /dashboard/billing/plans reads) so this page
// can never drift from what a signed-up customer actually sees.
// Copy (tagline/features/cta) isn't a price, so it stays static —
// only the numbers that could silently go stale are data-driven.
const PLAN_COPY: Record<PlanKey, { label: string; tagline: string; features: string[]; featured?: boolean }> = {
  free: {
    label: "Free",
    tagline: "Try Hawlai on your real business, no card needed.",
    features: ["100 AI messages/day", "1 team seat", "1-page website"],
  },
  basic: {
    label: "Basic",
    tagline: "Everything a single-location business runs day to day.",
    features: ["200 AI messages/day", "WhatsApp automation", "5 ad campaigns", "Included calling minutes"],
  },
  growth: {
    label: "Growth",
    tagline: "More room to run — higher volume, automation, reports.",
    features: ["500 AI messages/day", "WhatsApp automation & reports", "10 ad campaigns", "Included calling minutes"],
  },
  pro: {
    label: "Pro",
    tagline: "Add the intelligence layer — automation, research, growth.",
    features: ["1,000 AI messages/day", "Automation workflows", "Competitor Intel & Growth Advisor", "Included calling minutes"],
    featured: true,
  },
  agency: {
    label: "Agency",
    tagline: "For agencies and multi-business operators, fully unlocked.",
    features: ["Unlimited AI messages", "3D Studio & full Opus AI", "Multi-business management", "Included calling minutes"],
  },
};

const PLAN_ORDER: PlanKey[] = ["free", "basic", "growth", "pro", "agency"];

// Mirrors migration 143's seeded price_inr values — same fallback
// pattern as plans.ts's FREE_FALLBACK. This is NOT the source of
// truth (plan_limits is); it only protects the homepage — the single
// most-visited, most-cacheable page in the app — from ever depending
// on a live Supabase round-trip to render. If plan_limits is
// unreachable (a build environment with no credentials, or a real
// Supabase outage) or drifts from these numbers, the page still
// renders correctly for everything except a stale price, rather than
// failing to render at all.
const FALLBACK_PRICE_INR: Record<PlanKey, number> = { free: 0, basic: 1999, growth: 3999, pro: 14999, agency: 49999 };

function formatPrice(priceInr: number): { amount: string; period: string } {
  return priceInr === 0 ? { amount: "₹0", period: "forever" } : { amount: `₹${priceInr.toLocaleString("en-IN")}`, period: "/month" };
}

export default async function MarketingHome() {
  // Service-role client — this is an unauthenticated public page, and
  // plan_limits' RLS policy (migration 080) only allows `authenticated`
  // reads. The table holds no per-customer data, just shared pricing,
  // so a service-role read here is the same trust boundary as any
  // other public pricing page. Best-effort: never let a Supabase
  // problem take down the homepage — fall back to FALLBACK_PRICE_INR.
  let priceByPlan = new Map<PlanKey, number>();
  try {
    const service = createServiceClient();
    const { data: rows } = await service.from("plan_limits").select("plan, price_inr");
    priceByPlan = new Map((rows ?? []).map((r: any) => [r.plan as PlanKey, r.price_inr as number]));
  } catch (err) {
    console.error("[marketing-home] couldn't fetch live plan prices, using fallback:", err);
  }

  const PLANS = PLAN_ORDER.map((key) => {
    const copy = PLAN_COPY[key];
    const price = formatPrice(priceByPlan.get(key) ?? FALLBACK_PRICE_INR[key]);
    return { ...copy, ...price, href: "/auth/signup", cta: "Start free" };
  });

  return (
    <div
      className="min-h-screen bg-paper text-ink"
      style={{ ["--font-display" as string]: "'Space Grotesk', sans-serif", ["--font-mono" as string]: "'IBM Plex Mono', monospace" } as React.CSSProperties}
    >
      <link rel="stylesheet" href={fontStylesheetUrl} />

      {/* ===== NAV ===== */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <span className="font-heading font-bold text-lg tracking-tight">Hawlai</span>
          <nav className="hidden md:flex items-center gap-8 font-code text-xs uppercase tracking-wide text-ink/60">
            <a href="#departments" className="hover:text-ink transition-colors">Departments</a>
            <a href="#how-it-works" className="hover:text-ink transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="hidden sm:inline text-xs font-code uppercase tracking-wide text-ink/60 hover:text-ink transition-colors">
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="font-code text-xs uppercase tracking-wide bg-ink text-paper px-4 py-2 rounded-sm hover:bg-ink/90 transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="font-code text-[11px] uppercase tracking-[0.18em] text-brand-600 mb-5">
            One login. Every marketing department.
          </p>
          <h1 className="font-heading font-bold text-[2.6rem] sm:text-6xl leading-[1.05] tracking-tight mb-6">
            Hire an AI employee<br />for your marketing.
          </h1>
          <p className="text-lg text-ink/65 leading-relaxed mb-8 max-w-md">
            Hawlai writes your content, runs your ads, replies on WhatsApp, and reports back —
            like a real marketing hire, minus the recruiting. It never spends a rupee or
            publishes a post without asking you first.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/auth/signup"
              className="font-code text-sm uppercase tracking-wide bg-brand-600 text-white px-6 py-3.5 rounded-sm hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
            >
              Start free — no card
            </Link>
            <a href="#departments" className="font-code text-sm uppercase tracking-wide text-ink/50 hover:text-ink transition-colors">
              See what it does →
            </a>
          </div>
        </div>

        <ApprovalSlip />
      </section>

      {/* ===== TRUST STRIP ===== */}
      <section className="border-y border-ink/10 bg-ink/[0.03]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ["21+", "departments, one AI"],
            ["₹0", "spent without your OK"],
            ["24/7", "replies on WhatsApp"],
            ["Udyam", "registered Indian business"],
          ].map(([stat, label]) => (
            <div key={label}>
              <p className="font-heading font-bold text-2xl">{stat}</p>
              <p className="text-xs text-ink/50 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== DEPARTMENTS ===== */}
      <section id="departments" className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="max-w-xl mb-12">
          <p className="font-code text-[11px] uppercase tracking-[0.18em] text-brand-600 mb-3">The directory</p>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mb-4">
            Every department you'd normally hire for, in one AI employee.
          </h2>
          <p className="text-ink/60 leading-relaxed">
            You don't pick tools department by department. You just tell Hawlai what you need —
            it knows which department the job belongs to.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEPARTMENT_GROUPS.map((group) => (
            <div key={group.name} className="border border-ink/10 rounded-sm p-5 bg-white/40">
              <p className="font-code text-[10px] uppercase tracking-wide text-ink/40 mb-3">{group.name}</p>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="text-sm text-ink/75">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS / APPROVAL PHILOSOPHY ===== */}
      <section id="how-it-works" className="bg-ink text-paper">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="font-code text-[11px] uppercase tracking-[0.18em] text-brand-300 mb-3">Why business owners trust it</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mb-6">
              It works fast. It never spends without asking.
            </h2>
            <p className="text-paper/65 leading-relaxed mb-6">
              Most "autonomous AI" tools quietly spend your ad budget or post to your page while
              you're not looking. Hawlai doesn't. Every rupee it wants to spend and every post it
              wants to publish shows up as a requisition slip — you approve or decline, every time.
            </p>
            <ul className="space-y-3">
              {[
                "Content, research, and strategy — generated freely, no approval needed",
                "Ad spend and public posts — always wait for your yes",
                "Every approval logged, so you always know what ran and why",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-sm text-paper/80">
                  <Check className="w-4 h-4 text-marigold shrink-0 mt-0.5" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden md:block">
            <div className="border border-paper/15 rounded-sm p-6 font-code text-xs text-paper/50 space-y-3">
              <p className="text-paper/30 uppercase tracking-wide text-[10px] mb-1">Activity log — today</p>
              <p>9:02 — Drafted 4 Instagram captions <span className="text-paper/25">· auto</span></p>
              <p>9:14 — Requested ₹1,200 boost <span className="text-marigold">· awaiting you</span></p>
              <p>9:31 — Replied to 6 WhatsApp queries <span className="text-paper/25">· auto</span></p>
              <p>10:05 — Logged 2 new leads from calls <span className="text-paper/25">· auto</span></p>
              <p>10:40 — Boost approved by Ovaiz <span className="text-green-400">· published</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="font-code text-[11px] uppercase tracking-[0.18em] text-brand-600 mb-3">Pricing</p>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mb-4">
            Same AI employee. More depth as you grow.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.label}
              className={`relative flex flex-col rounded-sm border p-5 ${
                plan.featured ? "border-brand-600 bg-brand-600/[0.04]" : "border-ink/10 bg-white/40"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-5 font-code text-[9px] uppercase tracking-wide bg-brand-600 text-white px-2 py-1 rounded-sm">
                  Most picked
                </span>
              )}
              <p className="font-heading font-bold text-base mb-1">{plan.label}</p>
              <p className="text-xs text-ink/50 mb-4 min-h-[32px]">{plan.tagline}</p>
              <div className="flex items-baseline gap-1 mb-5">
                <span className="font-heading font-bold text-2xl">{plan.amount}</span>
                <span className="text-xs text-ink/40">{plan.period}</span>
              </div>
              <Link
                href={plan.href}
                className={`text-center font-code text-xs uppercase tracking-wide py-2.5 rounded-sm mb-5 transition-colors ${
                  plan.featured ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-ink/5 text-ink hover:bg-ink/10"
                }`}
              >
                {plan.cta}
              </Link>
              <ul className="space-y-2 text-xs text-ink/70">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-ink/40 mt-8">
          Ad spend goes through your own Meta account — Hawlai never takes a cut of your budget.
        </p>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="border-t border-ink/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 text-center">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mb-5">
            Your first marketing hire doesn't need a desk.
          </h2>
          <Link
            href="/auth/signup"
            className="inline-block font-code text-sm uppercase tracking-wide bg-brand-600 text-white px-8 py-4 rounded-sm hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
          >
            Start free — no card
          </Link>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-ink/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-heading font-bold">Hawlai</span>
          <p className="font-code text-[11px] text-ink/40 uppercase tracking-wide">
            Made in Uttar Pradesh, India · Udyam-registered
          </p>
        </div>
      </footer>
    </div>
  );
}
