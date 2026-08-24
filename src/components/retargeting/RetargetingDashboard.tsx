"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart, Eye, Repeat, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Retargeting dashboard + one-click campaign — piece 6/7.
//
// Two numbers per segment, deliberately kept distinct: OUR first-party
// count (what actually happened on the site) and META's audience
// estimate (who Meta could actually match and reach). They genuinely
// differ — match rates, dedup, Meta's delivery minimum — and collapsing
// them into one figure would misrepresent reach.

interface Segment {
  key: string;
  label: string;
  count: number;
  valueInr: number | null;
  detail: string | null;
}

interface MetaAudience {
  audience_key: string;
  approximate_count: number | null;
  sync_status: string;
}

const ICONS: Record<string, typeof ShoppingCart> = {
  abandoned_cart: ShoppingCart,
  viewed_no_purchase: Eye,
  buyers: Repeat,
};

export default function RetargetingDashboard() {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [metaAudiences, setMetaAudiences] = useState<MetaAudience[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [discount, setDiscount] = useState("10");

  useEffect(() => {
    fetch("/api/retargeting/dashboard")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setSegments(d.segments ?? []);
        setMetaAudiences(d.metaAudiences ?? []);
      })
      .catch((err) => setError(err.message));
  }, []);

  function metaCountFor(key: string): number | null {
    const found = metaAudiences.find((a) => a.audience_key === key && a.sync_status === "synced");
    return found?.approximate_count ?? null;
  }

  async function createCampaign(audienceKey: string) {
    setBusy(audienceKey);
    setError(null);
    try {
      const res = await fetch("/api/retargeting/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceKey, discountPercent: discount ? Number(discount) : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't create the campaign");
      // Hands off to the existing launch screen so the draft goes
      // through the same review/approval path as any other ad.
      router.push(`/dashboard/ads/full-launch?draft=${d.draft.id}&retarget=${audienceKey}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (segments === null && !error) {
    return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-500/5 border border-red-300/50 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(segments ?? []).map((s) => {
          const Icon = ICONS[s.key] ?? ShoppingCart;
          const metaCount = metaCountFor(s.key);
          return (
            <div key={s.key} className="card p-4 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{s.count.toLocaleString("en-IN")}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
              {s.detail && <p className="text-[10.5px] text-slate-400">{s.detail}</p>}
              {metaCount != null && (
                <p className="text-[10.5px] text-slate-400">
                  Meta can reach ~{metaCount.toLocaleString("en-IN")}
                </p>
              )}

              {s.count > 0 && (
                <>
                  {openFor === s.key ? (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[10.5px] text-slate-500 mb-1">Discount to offer (%)</label>
                        <input
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value.replace(/\D/g, "").slice(0, 2))}
                          placeholder="Leave blank for none"
                          className="input text-xs"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Only what you enter here gets promised in the ad.
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button onClick={() => createCampaign(s.key)} loading={busy === s.key} size="sm" className="flex-1 justify-center">
                          Create draft
                        </Button>
                        <Button onClick={() => setOpenFor(null)} variant="secondary" size="sm" disabled={busy !== null}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={() => setOpenFor(s.key)} variant="secondary" size="sm" className="w-full justify-center">
                      <Sparkles className="w-3.5 h-3.5" /> Advertise to them
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10.5px] text-slate-400">
        The big number is what happened on your own site. &ldquo;Meta can reach&rdquo; is Meta&apos;s own estimate of how many of those people it can actually match — always lower, and it needs a minimum audience size before an ad will run at all.
      </p>
    </div>
  );
}
