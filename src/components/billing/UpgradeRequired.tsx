import Link from "next/link";
import { Lock } from "lucide-react";
import { GATED_FEATURE_LABELS, GATED_FEATURE_MIN_PLAN, PLAN_LABELS, type GatedFeatureKey } from "@/lib/plans";
import { buttonClasses } from "@/components/ui/buttonClasses";

export default function UpgradeRequired({ feature }: { feature: GatedFeatureKey }) {
  const label = GATED_FEATURE_LABELS[feature];
  const planLabel = PLAN_LABELS[GATED_FEATURE_MIN_PLAN[feature]];

  return (
    <div className="max-w-lg mx-auto">
      <div className="card p-8 text-center space-y-3">
        <div className="w-12 h-12 bg-brand-500/20 rounded-xl flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-brand-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">{label} needs {planLabel}</h1>
        <p className="text-sm text-slate-500">
          Upgrade your plan to unlock {label.toLowerCase()} for your business.
        </p>
        <Link href="/dashboard/billing/plans" className={buttonClasses("primary", "md", "inline-flex justify-center mt-2")}>
          View plans
        </Link>
      </div>
    </div>
  );
}
