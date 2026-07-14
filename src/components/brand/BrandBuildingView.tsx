"use client";

import { useState, useEffect } from "react";
import {
  Loader2, RefreshCw, Palette, Type, Sparkles, Target, Compass, BookOpen,
  Share2, UserCircle2, ListChecks, Wand2, Image as ImageIcon, Copy, Check,
} from "lucide-react";

export default function BrandBuildingView() {
  const [loading, setLoading] = useState(true);
  const [kit, setKit] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brand-kit/build")
      .then((res) => res.json())
      .then((data) => {
        setKit(data);
        setLogoUrl(data.logoUrl ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleRegenerate() {
    setLoading(true);
    fetch("/api/brand-kit/build?regenerate=true")
      .then((res) => res.json())
      .then((data) => {
        setKit(data);
        setLogoUrl(data.logoUrl ?? logoUrl);
      })
      .finally(() => setLoading(false));
  }

  async function handleGenerateLogo() {
    setLogoLoading(true);
    setLogoError(null);
    try {
      const res = await fetch("/api/brand-kit/logo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Logo generation failed");
      setLogoUrl(data.url);
    } catch (err: any) {
      setLogoError(err.message);
    } finally {
      setLogoLoading(false);
    }
  }

  function copyText(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading && !kit) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-16 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Building your brand kit...
      </div>
    );
  }

  if (!kit) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <button
          onClick={handleRegenerate}
          disabled={loading}
          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Regenerate kit
        </button>
      </div>

      {/* Logo */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> Logo</p>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Generated logo" className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-8 h-8 text-slate-300" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-slate-400">AI-generated logo concept based on your business and brand voice. Regenerate as many times as you like — pick your favorite.</p>
            <button
              onClick={handleGenerateLogo}
              disabled={logoLoading}
              className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50 w-fit"
            >
              {logoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {logoUrl ? "Generate another" : "Generate logo"}
            </button>
            {logoError && <p className="text-xs text-red-400">{logoError}</p>}
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Palette className="w-4 h-4" /> Brand Colors</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kit.colors?.map((c: any, i: number) => (
            <button
              key={i}
              onClick={() => copyText(c.hex, c.hex)}
              className="text-left group"
            >
              <div className="h-16 rounded-lg border border-slate-200 relative" style={{ backgroundColor: c.hex }}>
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 rounded-lg">
                  {copied === c.hex ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-700 mt-1">{c.name}</p>
              <p className="text-[11px] text-slate-400">{c.hex} · {c.role}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Type className="w-4 h-4" /> Typography</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Headings</p>
            <p className="text-lg font-semibold text-slate-800">{kit.typography?.headingFont}</p>
          </div>
          <div className="bg-slate-100 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Body</p>
            <p className="text-lg text-slate-800">{kit.typography?.bodyFont}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">{kit.typography?.rationale}</p>
      </div>

      {/* Tagline */}
      <div className="bg-purple-500/10 border border-purple-700/40 rounded-xl p-5">
        <p className="text-xs font-semibold text-purple-400 flex items-center gap-1.5 mb-1"><Sparkles className="w-3.5 h-3.5" /> Tagline</p>
        <p className="text-lg font-semibold text-purple-100">{kit.tagline}</p>
      </div>

      {/* Mission & Vision */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-slate-100 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1"><Target className="w-3.5 h-3.5" /> Mission</p>
          <p className="text-sm text-slate-700">{kit.mission}</p>
        </div>
        <div className="bg-slate-100 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1"><Compass className="w-3.5 h-3.5" /> Vision</p>
          <p className="text-sm text-slate-700">{kit.vision}</p>
        </div>
      </div>

      {/* Brand Story */}
      <div className="card p-5 space-y-1">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> Brand Story</p>
        <p className="text-sm text-slate-600">{kit.brandStory}</p>
      </div>

      {/* Social Identity */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Share2 className="w-4 h-4" /> Social Media Identity</p>
        <div className="space-y-2">
          <div className="bg-slate-100 rounded-lg p-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Instagram bio</p>
              <p className="text-sm text-slate-700">{kit.socialIdentity?.instagramBio}</p>
            </div>
            <button onClick={() => copyText("ig", kit.socialIdentity?.instagramBio)} className="shrink-0 text-slate-400 hover:text-slate-600">
              {copied === "ig" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="bg-slate-100 rounded-lg p-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Facebook bio</p>
              <p className="text-sm text-slate-700">{kit.socialIdentity?.facebookBio}</p>
            </div>
            <button onClick={() => copyText("fb", kit.socialIdentity?.facebookBio)} className="shrink-0 text-slate-400 hover:text-slate-600">
              {copied === "fb" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {kit.socialIdentity?.hashtags?.map((h: string, i: number) => (
              <span key={i} className="text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded-full">{h}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Personal Branding */}
      <div className="card p-5 space-y-1">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><UserCircle2 className="w-4 h-4" /> Personal Branding</p>
        <p className="text-sm text-slate-600">{kit.personalBranding}</p>
      </div>

      {/* Guidelines */}
      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ListChecks className="w-4 h-4" /> Brand Guidelines</p>
        <div className="space-y-1.5">
          {kit.guidelines?.map((g: string, i: number) => (
            <p key={i} className="text-sm text-slate-600 bg-slate-100 rounded-lg p-2.5">✓ {g}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
