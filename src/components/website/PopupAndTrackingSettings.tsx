"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Bell, Code2 } from "lucide-react";

export default function PopupAndTrackingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupTrigger, setPopupTrigger] = useState("exit_intent");
  const [popupDelay, setPopupDelay] = useState(15);
  const [popupHeadline, setPopupHeadline] = useState("");
  const [popupBody, setPopupBody] = useState("");
  const [popupCta, setPopupCta] = useState("Get in touch");

  const [gaId, setGaId] = useState("");
  const [metaPixelId, setMetaPixelId] = useState("");
  const [gtmId, setGtmId] = useState("");

  useEffect(() => {
    fetch("/api/website").then((r) => r.json()).then((d) => {
      const p = d.landingPage;
      if (!p) return;
      setPopupEnabled(!!p.popup_enabled);
      setPopupTrigger(p.popup_trigger ?? "exit_intent");
      setPopupDelay(p.popup_delay_seconds ?? 15);
      setPopupHeadline(p.popup_headline ?? "");
      setPopupBody(p.popup_body ?? "");
      setPopupCta(p.popup_cta_text ?? "Get in touch");
      setGaId(p.ga_tracking_id ?? "");
      setMetaPixelId(p.meta_pixel_id ?? "");
      setGtmId(p.gtm_id ?? "");
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/website", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popup_enabled: popupEnabled,
          popup_trigger: popupTrigger,
          popup_delay_seconds: popupDelay,
          popup_headline: popupHeadline,
          popup_body: popupBody,
          popup_cta_text: popupCta,
          ga_tracking_id: gaId || null,
          meta_pixel_id: metaPixelId || null,
          gtm_id: gtmId || null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Popups */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> Popup</p>
          <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} className="w-5 h-5 accent-purple-600" />
        </div>
        {popupEnabled && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <button onClick={() => setPopupTrigger("exit_intent")} className={`text-xs px-2.5 py-1.5 rounded-lg border ${popupTrigger === "exit_intent" ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>Exit Intent</button>
              <button onClick={() => setPopupTrigger("timed")} className={`text-xs px-2.5 py-1.5 rounded-lg border ${popupTrigger === "timed" ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>Timed</button>
              {popupTrigger === "timed" && (
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="number" min={3} value={popupDelay} onChange={(e) => setPopupDelay(Number(e.target.value))} className="w-14 bg-slate-100 border border-slate-200 rounded px-1.5 py-1 text-center" /> sec
                </div>
              )}
            </div>
            <input value={popupHeadline} onChange={(e) => setPopupHeadline(e.target.value)} placeholder="Popup headline" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <textarea value={popupBody} onChange={(e) => setPopupBody(e.target.value)} placeholder="Popup message" rows={2} className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
            <input value={popupCta} onChange={(e) => setPopupCta(e.target.value)} placeholder="Button text" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
          </div>
        )}
      </div>

      {/* Tracking Codes */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Code2 className="w-4 h-4" /> Tracking Codes</p>
        <p className="text-xs text-slate-400">Paste your own tracking IDs — Hawlai injects them into your landing page automatically. Hawlai's own analytics (Website Analytics on the Insights page) run regardless of these.</p>
        <input value={gaId} onChange={(e) => setGaId(e.target.value)} placeholder="Google Analytics ID (e.g. G-XXXXXXX)" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
        <input value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} placeholder="Meta Pixel ID" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
        <input value={gtmId} onChange={(e) => setGtmId(e.target.value)} placeholder="Google Tag Manager ID (e.g. GTM-XXXXXXX)" className="w-full text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2" />
      </div>

      <button onClick={handleSave} disabled={saving} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saved ? "Saved" : "Save Popup & Tracking Settings"}
      </button>
    </div>
  );
}
