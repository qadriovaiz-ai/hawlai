"use client";

import { useState, useEffect } from "react";
import { Loader2, Radio, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Per-business tracking IDs (retargeting piece 3/7).
//
// Deliberately describes what each field DOES rather than naming the
// mechanism — a dealer knows "show ads to people who visited", not
// "server-side event deduplication". The one exception is the pixel
// ID itself, which they have to copy verbatim from Meta.
export default function TrackingSettingsCard() {
  const [loaded, setLoaded] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [gaId, setGaId] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [capiConnected, setCapiConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/tracking")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setPixelId(d.metaPixelId ?? "");
          setGaId(d.gaTrackingId ?? "");
          setCapiConnected(!!d.conversionsApiConnected);
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
            placeholder="e.g. 1234567890123456"
            className="input text-sm"
          />
          <p className="text-[10px] text-slate-400 mt-0.5">From Meta Events Manager → Data Sources.</p>
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
