"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, ExternalLink, Save, Check, Plus, Trash2, ChevronUp, ChevronDown, X, ArrowLeft, Wand2, Package, ClipboardList, Globe, Globe2 } from "lucide-react";
import ProductManager from "./ProductManager";
import OrdersPanel from "./OrdersPanel";
import DomainPanel from "./DomainPanel";

// Kept in sync with LANDING_THEMES in src/lib/landingThemes.ts, used to
// preview the AI's theme choice before the owner confirms the plan.
const THEME_PREVIEWS: Record<string, { label: string; dark: string; accent: string; bg: string }> = {
  navy_amber: { label: "Navy & Amber", dark: "#122744", accent: "#D9A441", bg: "#FAF8F5" },
  crimson_charcoal: { label: "Crimson & Charcoal", dark: "#1F1B1B", accent: "#C0392B", bg: "#FAFAFA" },
  forest_cream: { label: "Forest & Cream", dark: "#1E3A2B", accent: "#B08D57", bg: "#FBF9F3" },
  midnight_sky: { label: "Midnight & Sky", dark: "#0B1E3D", accent: "#4FA3D1", bg: "#F7F9FC" },
};

const SECTION_TYPES = [
  { type: "hero", label: "Hero" },
  { type: "text", label: "Text" },
  { type: "image_text", label: "Image + Text" },
  { type: "features_grid", label: "Features Grid" },
  { type: "testimonials", label: "Testimonials" },
  { type: "team_grid", label: "Team" },
  { type: "pricing", label: "Pricing" },
  { type: "faq", label: "FAQ" },
  { type: "cta_banner", label: "CTA Banner" },
  { type: "contact_form", label: "Contact Form" },
];

// Default empty content for a freshly-added section, and the item
// shape for list-based section types.
function emptySection(type: string): any {
  switch (type) {
    case "hero": return { type, headline: "New headline", subheadline: "", ctaText: "Get in Touch" };
    case "text": return { type, heading: "New section", body: "" };
    case "image_text": return { type, heading: "New section", body: "", imagePosition: "left" };
    case "features_grid": return { type, heading: "Features", items: [{ title: "Feature", description: "" }] };
    case "testimonials": return { type, heading: "What people say", items: [{ quote: "", author: "" }] };
    case "team_grid": return { type, heading: "Our Team", items: [{ name: "", role: "", bio: "" }] };
    case "pricing": return { type, heading: "Pricing", items: [{ name: "Plan", price: "", features: [] }] };
    case "faq": return { type, heading: "FAQ", items: [{ question: "", answer: "" }] };
    case "cta_banner": return { type, headline: "Ready to get started?", ctaText: "Contact Us" };
    case "contact_form": return { type, heading: "Get in Touch" };
    default: return { type };
  }
}

function emptyItem(sectionType: string): any {
  switch (sectionType) {
    case "features_grid": return { title: "", description: "" };
    case "testimonials": return { quote: "", author: "" };
    case "team_grid": return { name: "", role: "", bio: "" };
    case "pricing": return { name: "", price: "", features: [] };
    case "faq": return { question: "", answer: "" };
    default: return {};
  }
}

const ITEM_FIELDS: Record<string, { key: string; label: string; multiline?: boolean }[]> = {
  features_grid: [{ key: "title", label: "Title" }, { key: "description", label: "Description", multiline: true }],
  testimonials: [{ key: "quote", label: "Quote", multiline: true }, { key: "author", label: "Author" }],
  team_grid: [{ key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "bio", label: "Bio", multiline: true }],
  pricing: [{ key: "name", label: "Plan name" }, { key: "price", label: "Price" }],
  faq: [{ key: "question", label: "Question" }, { key: "answer", label: "Answer", multiline: true }],
};

export default function WebsiteBuilderView() {
  const [tab, setTab] = useState<"website" | "products" | "orders" | "domain">("website");
  const [website, setWebsite] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ businessSummary: string; themeKey: string; pages: { slug: string; title: string; pageType: string }[] } | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);

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

  function mutatePageSections(pageId: string, mutator: (sections: any[]) => any[]) {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, sections: mutator(p.sections) } : p)));
  }

  function updateSectionField(pageId: string, sectionIndex: number, field: string, value: string) {
    mutatePageSections(pageId, (sections) => {
      const next = [...sections];
      next[sectionIndex] = { ...next[sectionIndex], [field]: value };
      return next;
    });
  }

  function updateItemField(pageId: string, sectionIndex: number, itemIndex: number, field: string, value: string) {
    mutatePageSections(pageId, (sections) => {
      const next = [...sections];
      const items = [...(next[sectionIndex].items ?? [])];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      next[sectionIndex] = { ...next[sectionIndex], items };
      return next;
    });
  }

  function addItem(pageId: string, sectionIndex: number) {
    mutatePageSections(pageId, (sections) => {
      const next = [...sections];
      const items = [...(next[sectionIndex].items ?? []), emptyItem(next[sectionIndex].type)];
      next[sectionIndex] = { ...next[sectionIndex], items };
      return next;
    });
  }

  function removeItem(pageId: string, sectionIndex: number, itemIndex: number) {
    mutatePageSections(pageId, (sections) => {
      const next = [...sections];
      const items = (next[sectionIndex].items ?? []).filter((_: any, i: number) => i !== itemIndex);
      next[sectionIndex] = { ...next[sectionIndex], items };
      return next;
    });
  }

  function moveSection(pageId: string, sectionIndex: number, direction: -1 | 1) {
    mutatePageSections(pageId, (sections) => {
      const target = sectionIndex + direction;
      if (target < 0 || target >= sections.length) return sections;
      const next = [...sections];
      [next[sectionIndex], next[target]] = [next[target], next[sectionIndex]];
      return next;
    });
  }

  function removeSection(pageId: string, sectionIndex: number) {
    mutatePageSections(pageId, (sections) => sections.filter((_, i) => i !== sectionIndex));
  }

  function addSection(pageId: string, type: string) {
    mutatePageSections(pageId, (sections) => [...sections, emptySection(type)]);
    setAddSectionOpen(false);
  }

  async function savePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setSaving(pageId);
    try {
      await fetch(`/api/website-builder/pages/${pageId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: page.sections }) });
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

  const TABS: { key: "website" | "products" | "orders" | "domain"; label: string; icon: any }[] = [
    { key: "website", label: "Website", icon: Globe },
    { key: "products", label: "Products", icon: Package },
    { key: "orders", label: "Orders", icon: ClipboardList },
    { key: "domain", label: "Domain", icon: Globe2 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`text-sm px-3.5 py-2 rounded-lg flex items-center gap-1.5 ${tab === t.key ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "products" && <ProductManager />}
      {tab === "orders" && <OrdersPanel />}
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
                  <input value={p.title} onChange={(e) => updatePlanPage(i, "title", e.target.value)} className="flex-1 text-xs bg-white text-slate-900 border border-slate-300 rounded px-2 py-1.5" placeholder="Page title" />
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
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-purple-500 capitalize">{section.type.replace(/_/g, " ")}</p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveSection(currentPage.id, i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveSection(currentPage.id, i, 1)} disabled={i === currentPage.sections.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeSection(currentPage.id, i)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    {section.headline !== undefined && (
                      <input value={section.headline ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "headline", e.target.value)} className="w-full text-sm bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5" placeholder="Headline" />
                    )}
                    {section.heading !== undefined && (
                      <input value={section.heading ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "heading", e.target.value)} className="w-full text-sm bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5" placeholder="Heading" />
                    )}
                    {section.subheadline !== undefined && (
                      <input value={section.subheadline ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "subheadline", e.target.value)} className="w-full text-sm bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5" placeholder="Subheadline" />
                    )}
                    {section.body !== undefined && (
                      <textarea value={section.body ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "body", e.target.value)} rows={3} className="w-full text-sm bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5" placeholder="Body text" />
                    )}
                    {section.ctaText !== undefined && (
                      <input value={section.ctaText ?? ""} onChange={(e) => updateSectionField(currentPage.id, i, "ctaText", e.target.value)} className="w-full text-sm bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5" placeholder="Button text" />
                    )}

                    {section.items && (
                      <div className="space-y-2 pt-1">
                        {section.items.map((item: any, itemIndex: number) => (
                          <div key={itemIndex} className="bg-slate-200 rounded-lg p-2.5 space-y-1.5 relative">
                            <button onClick={() => removeItem(currentPage.id, i, itemIndex)} className="absolute top-2 right-2 text-slate-400 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                            {(ITEM_FIELDS[section.type] ?? []).map((f) => (
                              f.multiline ? (
                                <textarea key={f.key} value={item[f.key] ?? ""} onChange={(e) => updateItemField(currentPage.id, i, itemIndex, f.key, e.target.value)} rows={2} placeholder={f.label} className="w-full text-xs bg-white text-slate-900 border border-slate-300 rounded px-2 py-1 pr-6" />
                              ) : (
                                <input key={f.key} value={item[f.key] ?? ""} onChange={(e) => updateItemField(currentPage.id, i, itemIndex, f.key, e.target.value)} placeholder={f.label} className="w-full text-xs bg-white text-slate-900 border border-slate-300 rounded px-2 py-1 pr-6" />
                              )
                            ))}
                          </div>
                        ))}
                        <button onClick={() => addItem(currentPage.id, i)} className="text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add item</button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="relative">
                  <button onClick={() => setAddSectionOpen(!addSectionOpen)} className="text-xs text-purple-500 hover:text-purple-400 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add section</button>
                  {addSectionOpen && (
                    <div className="absolute z-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 flex flex-col gap-0.5 w-44">
                      {SECTION_TYPES.map((s) => (
                        <button key={s.type} onClick={() => addSection(currentPage.id, s.type)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700">
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
