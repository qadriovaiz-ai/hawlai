"use client";

import { useState, useEffect } from "react";
import { Loader2, Radio, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ConversionAction } from "@/lib/ads/googleConversions";

type ConversionOption = ConversionAction;

// Per-business tracking IDs (retargeting piece 3/7).
//
// Deliberately describes what each field DOES rather than naming the
// mechanism — a dealer knows "show ads to people who visited", not
// "server-side event deduplication".
//
// The Meta Pixel ID used to be the exception: a 15-digit number the
// dealer had to go and find in Events Manager. A1 made the Facebook
// connect flow discover it, so this box is now an override for the
// unusual case, not the way it gets set.
export default function TrackingSettingsCard() {
  const [loaded, setLoaded] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [gaId, setGaId] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [capiConnected, setCapiConnected] = useState(false);
  const [googleConversionId, setGoogleConversionId] = useState("");
  const [googleConversionLabel, setGoogleConversionLabel] = useState("");
  const [googleRemarketing, setGoogleRemarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not looked up yet; [] = looked up and Google had none.
  // Collapsing these to [] would show "create one first" before the
  // dealer has even asked us to check.
  const [conversions, setConversions] = useState<ConversionOption[] | null>(null);
  const [loadingConversions, setLoadingConversions] = useState(false);
  const [conversionsError, setConversionsError] = useState<string | null>(null);

  async function loadConversions() {
    setConversionsError(null);
    setLoadingConversions(true);
    try {
      const res = await fetch("/api/integrations/google-ads/conversions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read your conversion actions");
      setConversions(data.actions ?? []);
    } catch (err: any) {
      setConversionsError(err.message);
    } finally {
      setLoadingConversions(false);
    }
  }

  useEffect(() => {
    fetch("/api/settings/tracking")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setPixelId(d.metaPixelId ?? "");
          setGaId(d.gaTrackingId ?? "");
          setCapiConnected(!!d.conversionsApiConnected);
          setGoogleConversionId(d.googleAdsConversionId ?? "");
          setGoogleConversionLabel(d.googleAdsConversionLabel ?? "");
          setGoogleRemarketing(!!d.googleRemarketingEnabled);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/tracking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaPixelId: pixelId,
          gaTrackingId: gaId,
          googleAdsConversionId: googleConversionId,
          googleAdsConversionLabel: googleConversionLabel,
          googleRemarketingEnabled: googleRemarketing,
          // Only sent when actually typed — an empty box means "leave
          // it as it is", not "disconnect".
          ...(capiToken.trim() ? { conversionsApiToken: capiToken.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save");
      if (capiToken.trim()) {
        setCapiConnected(true);
        setCapiToken("");
      }
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Ad tracking</p>
      </div>
      <p className="text-xs text-slate-400">
        Lets you show ads to people who visited your site or looked at a product. Applies to your storefront and landing pages.
      </p>

      <div className="space-y-2.5">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Meta Pixel ID</label>
          <input
            value={pixelId}
            onChange={(e) => { setPixelId(e.target.value); setSaved(false); }}
            placeholder="Fills in when you connect Facebook"
            className="input text-sm"
          />
          {/* No longer "go and find this in Events Manager". Connecting
              Facebook reads the pixels off the chosen ad account and
              sets this, so the field exists for the rare case of a
              pixel that lives on an account we can't see. */}
          <p className="text-[10px] text-slate-400 mt-0.5">
            Set automatically when you{" "}
            <a href="/dashboard/settings/connect-facebook" className="text-brand-600 hover:underline">connect Facebook</a>.
            Only change it if you use a pixel from a different ad account.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Google Analytics ID</label>
          <input
            value={gaId}
            onChange={(e) => { setGaId(e.target.value); setSaved(false); }}
            placeholder="e.g. G-XXXXXXXXXX"
            className="input text-sm"
          />
        </div>

        {/* A4 — was two text boxes and an instruction to open Google
            Ads → Goals → Conversions and copy two fragments out of a
            tag snippet. Now the conversion actions are read over the
            API and the dealer clicks one. */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Record sales against Google campaigns</label>
          {googleConversionId && googleConversionLabel && !conversions ? (
            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              <span className="text-xs text-slate-600 flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="truncate">Tracking {googleConversionId}</span>
              </span>
              <button onClick={loadConversions} disabled={loadingConversions} className="text-[10px] text-brand-600 hover:underline shrink-0">
                {loadingConversions ? "Loading..." : "Change"}
              </button>
            </div>
          ) : !conversions ? (
            <Button variant="secondary" size="sm" onClick={loadConversions} loading={loadingConversions} className="w-full justify-center">
              {!loadingConversions && <Search className="w-3.5 h-3.5" />} Find my conversion actions
            </Button>
          ) : null}

          {conversions?.length === 0 && (
            <p className="text-[10px] text-slate-400 mt-1">
              No conversion actions found in your Google Ads account. Create one in Google Ads first — a purchase or lead
              action — then check again.
            </p>
          )}

          {conversions && conversions.length > 0 && (
            <div className="space-y-1.5 mt-1">
              {conversions.map((c) => {
                const active = c.conversionId === googleConversionId && c.conversionLabel === googleConversionLabel;
                return (
                  <button
                    key={c.resourceName}
                    onClick={() => {
                      setGoogleConversionId(c.conversionId ?? "");
                      setGoogleConversionLabel(c.conversionLabel ?? "");
                      setConversions(null);
                      setSaved(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg border text-xs transition-colors ${
                      active ? "border-purple-400 bg-purple-50" : "border-slate-200 bg-slate-100 hover:border-purple-400"
                    }`}
                  >
                    <span className="font-medium text-slate-900">{c.name}</span>
                    {c.category && <span className="text-[10px] text-slate-400 ml-1.5">{c.category.toLowerCase()}</span>}
                  </button>
                );
              })}
              <p className="text-[10px] text-slate-400">Pick the action that means a sale, then save.</p>
            </div>
          )}
          {conversionsError && <p className="text-[10px] text-red-500 mt-1">{conversionsError}</p>}
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={googleRemarketing}
            onChange={(e) => { setGoogleRemarketing(e.target.checked); setSaved(false); }}
            className="mt-0.5 w-3.5 h-3.5 accent-brand-600"
          />
          <span>
            <span className="text-xs text-slate-700">Show people the exact product they viewed</span>
            <span className="block text-[10px] text-slate-400">
              Needs a Google Merchant Center product feed to actually display products — leave off until that&apos;s connected.
            </span>
          </span>
        </label>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1.5">
            Meta Conversions API token
            {capiConnected && <span className="inline-flex items-center gap-1 text-[10px] text-green-500"><CheckCircle2 className="w-3 h-3" /> connected</span>}
          </label>
          <input
            type="password"
            value={capiToken}
            onChange={(e) => { setCapiToken(e.target.value); setSaved(false); }}
            placeholder={capiConnected ? "Saved — type a new token to replace it" : "Paste your access token"}
            className="input text-sm"
          />
          <p className="text-[10px] text-slate-400 mt-0.5">
            Sends purchases to Meta directly from our servers, so sales still get counted when a browser blocks tracking. Roughly 20–40% of purchases go unreported without it.
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {saved && <p className="text-xs text-green-500">Saved.</p>}

      <Button onClick={save} loading={saving} size="sm">Save tracking settings</Button>

      <p className="text-[10px] text-slate-400">
        Nothing is tracked until a visitor accepts cookies on your site — that&apos;s handled automatically.
      </p>
    </div>
  );
}
