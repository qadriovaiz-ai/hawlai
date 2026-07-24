"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, ExternalLink, Save, Check, Plus, Trash2, ArrowLeft, Wand2, Package, ClipboardList, Globe, Globe2, Tag, Monitor, Smartphone, Truck } from "lucide-react";
import ProductManager from "./ProductManager";
import OrdersPanel from "./OrdersPanel";
import DomainPanel from "./DomainPanel";
import OffersPanel from "./OffersPanel";
import ShippingPanel from "./ShippingPanel";
import AbandonedCartsPanel from "./AbandonedCartsPanel";
import BlockCanvas from "./blocks/BlockCanvas";
import ImageUploader from "./ImageUploader";
import { getTheme } from "@/lib/landingThemes";
import { FONT_PRESETS } from "@/lib/fontPresets";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";

// Kept in sync with LANDING_THEMES in src/lib/landingThemes.ts, used to
// preview the AI's theme choice before the owner confirms the plan.
const THEME_PREVIEWS: Record<string, { label: string; dark: string; accent: string; bg: string }> = {
  navy_amber: { label: "Navy & Amber", dark: "#122744", accent: "#D9A441", bg: "#FAF8F5" },
  crimson_charcoal: { label: "Crimson & Charcoal", dark: "#1F1B1B", accent: "#C0392B", bg: "#FAFAFA" },
  forest_cream: { label: "Forest & Cream", dark: "#1E3A2B", accent: "#B08D57", bg: "#FBF9F3" },
  midnight_sky: { label: "Midnight & Sky", dark: "#0B1E3D", accent: "#4FA3D1", bg: "#F7F9FC" },
};

export default function WebsiteBuilderView() {
  const [tab, setTab] = useState<"website" | "products" | "orders" | "domain" | "offers" | "shipping">("website");
  const [website, setWebsite] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ businessSummary: string; themeKey: string; pages: { slug: string; title: string; pageType: string }[] } | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoSaving, setLogoSaving] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [fontSaving, setFontSaving] = useState(false);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [pageActionLoading, setPageActionLoading] = useState(false);
  const [pageActionError, setPageActionError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [dragPageIndex, setDragPageIndex] = useState<number | null>(null);
  const [overPageIndex, setOverPageIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts((d.products ?? []).filter((p: any) => p.is_active)));
  }, []);

  function load() {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    fetch("/api/website-builder/generate", { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? `Request failed (${r.status})`);
        setWebsite(d.website);
        setLogoUrl(d.website?.logo_url ?? "");
        setPages(d.pages ?? []);
        if (d.pages?.length > 0) setActivePage((prev: string | null) => prev ?? d.pages[0].id);
      })
      .catch((err: any) => {
        setLoadError(err.name === "AbortError" ? "Request timed out — check your connection and try again." : (err.message ?? "Something went wrong loading your website."));
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });
  }
  useEffect(load, []);

  async function handlePlan() {
    if (!prompt.trim()) return;
    setPlanning(true);
    setPlanError(null);
    try {
      const r = await fetch("/api/website-builder/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Request failed (${r.status})`);
      setPlan(d.plan);
    } catch (err: any) {
      setPlanError(err.message ?? "Couldn't plan the site — try again.");
    } finally {
      setPlanning(false);
    }
  }

  function updatePlanPage(index: number, field: "title" | "slug", value: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      const nextPages = [...prev.pages];
      nextPages[index] = { ...nextPages[index], [field]: value };
      return { ...prev, pages: nextPages };
    });
  }

  function removePlanPage(index: number) {
    setPlan((prev) => (prev ? { ...prev, pages: prev.pages.filter((_, i) => i !== index) } : prev));
  }

  function addPlanPage() {
    setPlan((prev) => (prev ? { ...prev, pages: [...prev.pages, { slug: "new-page", title: "New Page", pageType: "custom" }] } : prev));
  }

  async function handleGenerate() {
    if (!plan) return;
    setGenerating(true);
    try {
      await fetch("/api/website-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, pages: plan.pages, themeKey: plan.themeKey, businessSummary: plan.businessSummary }),
      });
      setPlan(null);
      setPrompt("");
      load();
    } finally {
      setGenerating(false);
    }
  }

  async function togglePublish(published: boolean) {
    setWebsite((prev: any) => ({ ...prev, published }));
    await fetch("/api/website-builder/publish", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }) });
  }

  async function saveLogo() {
    setLogoSaving(true);
    try {
      const r = await fetch("/api/website-builder/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoUrl }) });
      const d = await r.json();
      if (r.ok) setWebsite(d.website);
    } finally {
      setLogoSaving(false);
    }
  }

  async function saveTheme(themeKey: string) {
    setThemeSaving(true);
    setWebsite((prev: any) => ({ ...prev, theme_key: themeKey }));
    try {
      const r = await fetch("/api/website-builder/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themeKey }) });
      const d = await r.json();
      if (r.ok) setWebsite(d.website);
    } finally {
      setThemeSaving(false);
    }
  }

  async function saveFont(fontKey: string) {
    setFontSaving(true);
    setWebsite((prev: any) => ({ ...prev, font_key: fontKey }));
    try {
      const r = await fetch("/api/website-builder/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fontKey }) });
      const d = await r.json();
      if (r.ok) setWebsite(d.website);
    } finally {
      setFontSaving(false);
    }
  }

  async function reorderPages(fromIndex: number, toIndex: number) {
    const next = [...pages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setPages(next);
    await fetch("/api/website-builder/pages/reorder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageIds: next.map((p) => p.id) }) });
  }

  async function handleAddPage() {
    if (!newPageTitle.trim()) return;
    setPageActionLoading(true);
    setPageActionError(null);
    try {
      const r = await fetch("/api/website-builder/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newPageTitle }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't add page");
      setPages((prev) => [...prev, d.page]);
      setActivePage(d.page.id);
      setNewPageTitle("");
      setAddPageOpen(false);
    } catch (err: any) {
      setPageActionError(err.message);
    } finally {
      setPageActionLoading(false);
    }
  }

  async function handleDuplicatePage(pageId: string) {
    setPageActionLoading(true);
    setPageActionError(null);
    try {
      const r = await fetch("/api/website-builder/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duplicateFrom: pageId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't duplicate page");
      setPages((prev) => [...prev, d.page]);
      setActivePage(d.page.id);
    } catch (err: any) {
      setPageActionError(err.message);
    } finally {
      setPageActionLoading(false);
    }
  }

  async function handleDeletePage(pageId: string) {
    if (!confirm("Delete this page? This can't be undone.")) return;
    setPageActionLoading(true);
    setPageActionError(null);
    try {
      const r = await fetch(`/api/website-builder/pages/${pageId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't delete page");
      setPages((prev) => {
        const next = prev.filter((p) => p.id !== pageId);
        if (activePage === pageId) setActivePage(next[0]?.id ?? null);
        return next;
      });
    } catch (err: any) {
      setPageActionError(err.message);
    } finally {
      setPageActionLoading(false);
    }
  }

  function updatePageBlocks(pageId: string, blocks: any[]) {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, sections: blocks } : p)));
  }

  function updatePageMeta(pageId: string, field: "title" | "meta_description" | "og_image_url", value: string) {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, [field]: value } : p)));
  }

  async function savePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setSaving(pageId);
    setSaveError(null);
    try {
      const res = await fetch(`/api/website-builder/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: page.sections,
          title: page.title,
          metaDescription: page.meta_description,
          ogImageUrl: page.og_image_url,
          expectedUpdatedAt: page.updated_at,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save — please try again");
        return;
      }
      if (data.updatedAt) {
        setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, updated_at: data.updatedAt } : p)));
      }
    } finally {
      setTimeout(() => setSaving(null), 1000);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  if (loadError) {
    return (
      <div className="card p-5 space-y-2">
        <p className="text-sm text-red-400">{loadError}</p>
        <button onClick={load} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg">Try again</button>
      </div>
    );
  }

  const currentPage = pages.find((p) => p.id === activePage);

  const TABS: { key: "website" | "products" | "orders" | "domain" | "offers" | "shipping"; label: string; icon: any }[] = [
    { key: "website", label: "Website", icon: Globe },
    { key: "products", label: "Products", icon: Package },
    { key: "offers", label: "Offers", icon: Tag },
    { key: "orders", label: "Orders", icon: ClipboardList },
    { key: "shipping", label: "Shipping", icon: Truck },
    { key: "domain", label: "Domain", icon: Globe2 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`text-sm px-3.5 py-2 rounded-lg flex items-center gap-1.5 ${tab === t.key ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "products" && <ProductManager />}
      {tab === "offers" && <OffersPanel />}
      {tab === "orders" && (
        <div className="space-y-4">
          <OrdersPanel />
          <AbandonedCartsPanel />
        </div>
      )}
      {tab === "shipping" && <ShippingPanel />}
      {tab === "domain" && <DomainPanel />}

      {tab === "website" && (
      <>
      {!plan && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">{website ? "Regenerate Website" : "Build Your Website"}</p>
          <p className="text-xs text-slate-400">Describe your website in one go — business, what you sell, and the vibe you want. AI will plan the pages and theme for you to review before anything is generated.</p>
          {website && <p className="text-xs text-amber-500">Regenerating replaces all pages and any manual edits you've made.</p>}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={`Create a premium website for my skincare brand. I sell Vitamin C Serum and Face Wash. Theme should be luxury.`}
            className="w-full text-sm bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-3 py-2 placeholder:text-slate-500"
          />
          {planError && <p className="text-xs text-red-400">{planError}</p>}
          <button onClick={handlePlan} disabled={planning || !prompt.trim()} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
            {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Plan My Website
          </button>
        </div>
      )}

      {plan && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Review Your Plan</p>
            <button onClick={() => setPlan(null)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
          </div>
          <p className="text-xs text-slate-500 bg-slate-100 rounded-lg p-2.5">{plan.businessSummary}</p>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Theme</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(THEME_PREVIEWS).map(([key, t]) => (
                <button key={key} onClick={() => setPlan((prev) => (prev ? { ...prev, themeKey: key } : prev))} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${plan.themeKey === key ? "border-purple-500 bg-purple-50" : "border-slate-200 bg-slate-100"}`}>
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: t.dark }} />
                  <span className="w-3 h-3 rounded-full inline-block -ml-2" style={{ backgroundColor: t.accent }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Pages</p>
            <div className="space-y-1.5">
              {plan.pages.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-100 rounded-lg p-2">
                  <input value={p.title} onChange={(e) => updatePlanPage(i, "title", e.target.value)} className="flex-1 text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5" placeholder="Page title" />
                  <span className="text-[10px] text-slate-400 uppercase w-16 shrink-0">{p.pageType}</span>
                  <button onClick={() => removePlanPage(i)} className="text-slate-400 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <button onClick={addPlanPage} className="text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1 mt-1.5"><Plus className="w-3.5 h-3.5" /> Add page</button>
          </div>

          <button onClick={handleGenerate} disabled={generating} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {website ? "Regenerate Website" : "Build Website"}
          </button>
        </div>
      )}

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

          <div className="card p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-700">Design</p>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Logo</p>
              <div className="flex items-center gap-2">
                <ImageUploader kind="logo" currentUrl={logoUrl} onUploaded={(url) => { setLogoUrl(url); }} compact />
                <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Or paste an image URL" className="flex-1 text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2" />
                <button onClick={saveLogo} disabled={logoSaving} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg disabled:opacity-50">
                  {logoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Theme</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(THEME_PREVIEWS).map(([key, t]) => (
                  <button key={key} onClick={() => saveTheme(key)} disabled={themeSaving} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50 ${website.theme_key === key ? "border-purple-500 bg-purple-50" : "border-slate-200 bg-slate-100"}`}>
                    <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: t.dark }} />
                    <span className="w-3 h-3 rounded-full inline-block -ml-2" style={{ backgroundColor: t.accent }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Font</p>
              <div className="flex flex-wrap gap-1.5">
                {FONT_PRESETS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => saveFont(f.key)}
                    disabled={fontSaving}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50 text-left ${(website.font_key ?? "modern") === f.key ? "border-purple-500 bg-purple-50" : "border-slate-200 bg-slate-100"}`}
                  >
                    <span className="font-semibold text-slate-700">{f.label}</span>
                    <span className="text-slate-400"> · {f.headingLabel} + {f.bodyLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex flex-wrap gap-1.5">
                {pages.map((p, pi) => (
                  <button
                    key={p.id}
                    draggable
                    onDragStart={() => setDragPageIndex(pi)}
                    onDragOver={(e) => { e.preventDefault(); if (dragPageIndex !== null && dragPageIndex !== pi) setOverPageIndex(pi); }}
                    onDrop={(e) => { e.preventDefault(); if (dragPageIndex !== null && dragPageIndex !== pi) reorderPages(dragPageIndex, pi); setDragPageIndex(null); setOverPageIndex(null); }}
                    onDragEnd={() => { setDragPageIndex(null); setOverPageIndex(null); }}
                    onClick={() => setActivePage(p.id)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing ${activePage === p.id ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"} ${overPageIndex === pi ? "ring-2 ring-purple-400" : ""} ${dragPageIndex === pi ? "opacity-40" : ""}`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
              <div className="relative">
                <button onClick={() => setAddPageOpen(!addPageOpen)} className="text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Page</button>
                {addPageOpen && (
                  <div className="absolute right-0 z-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-56 space-y-2">
                    <input value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} placeholder="Page title, e.g. Offers" className="w-full text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5" />
                    <button onClick={handleAddPage} disabled={pageActionLoading || !newPageTitle.trim()} className="w-full text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1.5 rounded disabled:opacity-50">Add</button>
                  </div>
                )}
              </div>
            </div>

            {currentPage && (
              <div className="flex items-center gap-3">
                <button onClick={() => handleDuplicatePage(currentPage.id)} disabled={pageActionLoading} className="text-xs text-slate-500 hover:text-purple-500 flex items-center gap-1 disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Duplicate this page</button>
                <button onClick={() => handleDeletePage(currentPage.id)} disabled={pageActionLoading} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Delete this page</button>
              </div>
            )}
            {pageActionError && <p className="text-xs text-red-400">{pageActionError}</p>}

            {currentPage && (
              <div className="border-t border-slate-200 pt-3 space-y-2.5">
                <p className="text-xs font-semibold text-slate-600">SEO — {currentPage.title}</p>
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">Page title (browser tab &amp; search results)</p>
                  <input
                    value={currentPage.title ?? ""}
                    onChange={(e) => updatePageMeta(currentPage.id, "title", e.target.value)}
                    className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">Meta description ({(currentPage.meta_description ?? "").length}/160)</p>
                  <textarea
                    value={currentPage.meta_description ?? ""}
                    onChange={(e) => updatePageMeta(currentPage.id, "meta_description", e.target.value.slice(0, 160))}
                    rows={2}
                    placeholder="Short summary shown under the title in Google search results"
                    className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">Open Graph image URL (shown on WhatsApp/Facebook link previews)</p>
                  <input
                    value={currentPage.og_image_url ?? ""}
                    onChange={(e) => updatePageMeta(currentPage.id, "og_image_url", e.target.value)}
                    placeholder="https://..."
                    className="w-full text-sm bg-white text-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Saved together with the page — click "Save Page" below.</p>
              </div>
            )}

            {currentPage && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Drag blocks from the palette, click any block to edit or select it</p>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    <button onClick={() => setPreviewMode("desktop")} className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1 ${previewMode === "desktop" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}><Monitor className="w-3.5 h-3.5" /> Desktop</button>
                    <button onClick={() => setPreviewMode("mobile")} className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1 ${previewMode === "mobile" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}><Smartphone className="w-3.5 h-3.5" /> Mobile</button>
                  </div>
                </div>

                <div className={previewMode === "mobile" ? "max-w-[375px] mx-auto" : ""}>
                  <BlockCanvas
                    blocks={legacyToBlocks(currentPage.sections)}
                    onChange={(blocks) => updatePageBlocks(currentPage.id, blocks)}
                    theme={getTheme(website?.theme_key)}
                    slug={website.slug}
                    products={products}
                  />
                </div>

                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <button onClick={() => savePage(currentPage.id)} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                  {saving === currentPage.id ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} Save Page
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Link href="/dashboard/website" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
        <span className="text-sm text-slate-700">Need just a single quick-launch landing page for ads instead? Use the Website page</span>
      </Link>
      </>
      )}
    </div>
  );
}
