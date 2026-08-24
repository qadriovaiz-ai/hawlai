"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Users, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Meta Custom Audience sync — retargeting piece 5/7.
//
// Replaces the disabled "available once Meta Ads is connected"
// placeholder that stood here before. Website audiences are rule-based
// (Meta keeps them current itself); the customer list is pushed from
// real orders; the lookalike is derived from that list.

interface Audience {
  key: string;
  label: string;
  description: string;
  type: "website" | "customer_list" | "lookalike";
  syncStatus: "pending" | "synced" | "failed" | null;
  syncError: string | null;
  approximateCount: number | null;
  lastSyncedAt: string | null;
  metaAudienceId: string | null;
}

export default function CustomAudiencesPanel() {
  const [audiences, setAudiences] = useState<Audience[] | null>(null);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState<{ adAccount: boolean; pixel: boolean; connection: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState(false);

  function load() {
    fetch("/api/retargeting/audiences")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't load");
        setAudiences(d.audiences ?? []);
        setReady(!!d.ready);
        setMissing(d.missing ?? null);
      })
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function sync(key: string) {
    setBusy(key);
    setError(null);
    setTermsError(false);
    try {
      const res = await fetch("/api/retargeting/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceKey: key }),
      });
      const d = await res.json();
      if (!res.ok) {
        setTermsError(!!d.needsTermsAcceptance);
        throw new Error(d.error ?? "Sync failed");
      }
      load();
    } catch (err: any) {
      setError(err.message);
      load(); // refresh so the stored failure state shows on the row too
    } finally {
      setBusy(null);
    }
  }

  if (audiences === null && !error) {
    return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading audiences...</div>;
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-slate-400" /> Retargeting audiences in Meta
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Builds these lists directly in your Meta ad account so you can target them in any campaign.
        </p>
      </div>

      {/* States the exact missing prerequisite rather than a generic
          "not connected" — each one has a different fix. */}
      {!ready && missing && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            {missing.connection && <>Connect your Facebook Page first. </>}
            {missing.adAccount && <>No Meta ad account is linked yet. </>}
            {missing.pixel && <>Add your Meta Pixel ID for the website-based audiences. </>}
            <Link href="/dashboard/settings/integrations" className="underline">Open Integrations</Link>
          </span>
        </div>
      )}

      {termsError && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Meta needs you to accept the Custom Audience terms once, in Ads Manager, before any audience can be created.{" "}
            <a href="https://business.facebook.com/adsmanager/audiences" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
              Open Audiences <ExternalLink className="w-3 h-3" />
            </a>
          </span>
        </div>
      )}

      {error && !termsError && <p className="text-xs text-red-500">{error}</p>}

      <div className="space-y-2">
        {(audiences ?? []).map((a) => (
          <div key={a.key} className="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-800">{a.label}</p>
                {a.syncStatus === "synced" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                {a.syncStatus === "failed" && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{a.description}</p>
              {a.approximateCount != null && (
                <p className="text-[10.5px] text-slate-400 mt-1">
                  Meta estimates ~{a.approximateCount.toLocaleString("en-IN")} people
                </p>
              )}
              {a.syncStatus === "failed" && a.syncError && (
                <p className="text-[10.5px] text-red-500 mt-1">{a.syncError}</p>
              )}
            </div>
            <Button
              onClick={() => sync(a.key)}
              loading={busy === a.key}
              disabled={!ready || busy !== null}
              variant="secondary"
              size="sm"
            >
              {busy !== a.key && <RefreshCw className="w-3.5 h-3.5" />}
              {a.syncStatus === "synced" ? "Refresh" : "Create"}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-[10.5px] text-slate-400">
        The two website audiences update themselves once created — Meta keeps them current from your site activity. The customer list is sent from your real orders, and anyone who opted out of contact is excluded.
      </p>
    </div>
  );
}
