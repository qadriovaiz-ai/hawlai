import Link from "next/link";
import { PowerOff } from "lucide-react";
import { KILL_SWITCH_LABELS, unavailableMessage, type KillSwitchFeature } from "@/lib/featureFlags";
import { buttonClasses } from "@/components/ui/Button";

// The counterpart to UpgradeRequired, for features switched off
// product-wide rather than locked behind a plan.
//
// Kept as its own component precisely so the two can't be confused:
// showing UpgradeRequired here would tell an Agency customer to buy
// Agency, which is both useless and a small lie about why the page is
// empty. There is deliberately no "View plans" button — no plan
// unlocks this — and no upgrade language anywhere.
export default function FeatureUnavailable({ feature }: { feature: KillSwitchFeature }) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="card p-8 text-center space-y-3">
        <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center mx-auto">
          <PowerOff className="w-5 h-5 text-slate-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">{KILL_SWITCH_LABELS[feature]} is turned off</h1>
        <p className="text-sm text-slate-500">{unavailableMessage(feature)}</p>
        <Link href="/dashboard/assets" className={buttonClasses("secondary", "md", "inline-flex justify-center mt-2")}>
          Go to your library
        </Link>
      </div>
    </div>
  );
}
