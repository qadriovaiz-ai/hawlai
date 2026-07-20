"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, ExternalLink, Save, Check } from "lucide-react";
import { SITE_TYPES } from "@/lib/agents/websiteBuilderAgent";

export default function WebsiteBuilderView() {
  const [website, setWebsite] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [siteType, setSiteType] = useState(SITE_TYPES[0].key);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    fetch("/api/website-builder/generate").then((r) => r.json()).then((d) => {
      setWebsite(d.website);
      setPages(d.pages ?? []);
      if (d.pages?.length > 0) setActivePage((prev) => prev ?? d.pages[0].id);
    }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch("/api/website-builder/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteType }) });
      load();
    } finally {
      setGenerating(false);
    }
  }

  async function togglePublish(published: boolean) {
    setWebsite((prev: any) => ({ ...prev, published }));
    await fetch("/api/website-builder/publish", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }) });
  }

  async function updateSectionField(pageId: string, sectionIndex: number, field: string, value: string) {
    setPages((prev) => prev.map((p) => {
      if (p.id !== pageId) return p;
      const sections = [...p.sections];
      sections[sectionIndex] = { ...sections[sectionIndex], [field]: value };
      return { ...p, sections };
    }));
  }

  async function savePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setSaving(pageId);
    try {
      await fetch(`/api/website-builder/pages/${pageId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: page.sections }) });
    } finally {
      setSaving(null);
      setTimeout(() => setSaving(null), 1000);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  const currentPage = pages.find((p) => p.id === activePage);

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">{website ? "Regenerate Website" : "Build Your Website"}</p>
        <div className="flex flex-wrap gap-1.5">
          {SITE_TYPES.map((t) => (
            <button key={t.key} onClick={() => setSiteType(t.key)} className={`text-xs px-2.5 py-1.5 rounded-lg border ${siteType === t.key ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {website && <p className="text-xs text-amber-500">Regenerating replaces all pages and any manual edits you've made.</p>}
        <button onClick={handleGenerate} disabled={generating} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {website ? "Regenerate" : "Generate Full Website"}
        </button>
      </div>

      {website && (
        <>
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Site: /site/{website.slug}</p>
              <p className="text-xs text-slate-400">{website.published ? "Live — visible to the public" : "Not published yet"}</p>
            </div>
            <div className="flex items-center gap-3">
              {website.published && (
                <a href={`/site/${website.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-500 hover:underline flex items-center gap-1">
                  View live <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <input type="checkbox" checked={website.published} onChange={(e) => togglePublish(e.target.checked)} className="w-5 h-5 accent-purple-600" />
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {pages.map((p) => (
                <button key={p.id} onClick={() => setActivePage(p.id)} className={`text-xs px-2.5 py-1.5 rounded-lg border ${activePage === p.id ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                  {p.title}
                </button>
              ))}
            </div>

            {currentPage && (
              <div className="space-y-3 pt-2">
                {currentPage.sections.map((section: any, i: number) => (
                  <div key={i} className="bg-slate-100 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-purple-500 capitalize">{section.type.replace(/_/g, " ")}</p>
                    {section.headline !== undefined && (
                      <input value={section.headline ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "headline", e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5" placeholder="Headline" />
                    )}
                    {section.heading !== undefined && (
                      <input value={section.heading ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "heading", e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5" placeholder="Heading" />
                    )}
                    {section.subheadline !== undefined && (
                      <input value={section.subheadline ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "subheadline", e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5" placeholder="Subheadline" />
                    )}
                    {section.body !== undefined && (
                      <textarea value={section.body ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "body", e.target.value)} rows={3} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5" placeholder="Body text" />
                    )}
                    {section.ctaText !== undefined && (
                      <input value={section.ctaText ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "ctaText", e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5" placeholder="Button text" />
                    )}
                    {section.items && <p className="text-xs text-slate-400">{section.items.length} item(s) — edit via regenerate for now</p>}
                  </div>
                ))}
                <button onClick={() => savePage(currentPage.id)} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  {saving === currentPage.id ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />} Save Page
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Link href="/dashboard/website" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="text-sm text-slate-700">Need just a single quick-launch landing page for ads instead? Use the Website page</span>
      </Link>
    </div>
  );
}
