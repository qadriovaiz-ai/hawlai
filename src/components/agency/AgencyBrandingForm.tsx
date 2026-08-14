"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AgencyBrandingForm() {
  const [loading, setLoading] = useState(true);
  const [agencyName, setAgencyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#7c3aed");
  const [hideHawlai, setHideHawlai] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/agency/branding")
      .then((r) => r.json())
      .then((d) => {
        setAgencyName(d.agency_name ?? "");
        setPrimaryColor(d.primary_color || "#7c3aed");
        setHideHawlai(!!d.hide_hawlai_branding);
        setLogoUrl(d.logo_url ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName, primaryColor, hideHawlaiBranding: hideHawlai, logoBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.logoUrl) setLogoUrl(data.logoUrl);
      setLogoBase64(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-slate-400" />;

  const previewLogo = logoBase64 ?? logoUrl;

  return (
    <div className="card p-5 space-y-4">
      <div>
        <label className="text-xs font-medium text-slate-600">Agency name</label>
        <input
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          placeholder="Your agency's name"
          className="input mt-1"
        />
        <p className="text-xs text-slate-400 mt-1">Replaces &ldquo;Hawlai&rdquo; in the report footer.</p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Primary color</label>
        <div className="flex items-center gap-2 mt-1">
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-9 rounded border border-slate-300 cursor-pointer" />
          <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="input flex-1" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Logo</label>
        <div className="flex items-center gap-3 mt-1">
          {previewLogo && <img src={previewLogo} alt="" className="h-10 object-contain" />}
          <Button onClick={() => fileRef.current?.click()} variant="secondary" size="sm">
            <Upload className="w-3.5 h-3.5" /> {previewLogo ? "Replace" : "Upload"}
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={handleFile} className="hidden" />
        </div>
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={hideHawlai} onChange={(e) => setHideHawlai(e.target.checked)} className="w-4 h-4 accent-brand-600 mt-0.5" />
        <div>
          <p className="text-sm text-slate-700">Use my branding on client reports</p>
          <p className="text-xs text-slate-400">Replaces Hawlai&apos;s color and footer with yours on the PDF, presentation, and shareable report link. Leave off to keep Hawlai branding.</p>
        </div>
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <Button onClick={save} loading={saving} variant="primary" className="w-full justify-center">
        {!saving && (saved ? <><Check className="w-4 h-4" /> Saved</> : "Save")}
      </Button>
    </div>
  );
}
