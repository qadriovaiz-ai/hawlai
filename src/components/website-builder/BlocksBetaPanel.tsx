"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Check } from "lucide-react";
import { getTheme } from "@/lib/landingThemes";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import type { Block } from "@/lib/blocks/types";
import BlockCanvas from "./blocks/BlockCanvas";

// Standalone preview surface for the new block-based canvas (Block
// Builder Phase 3) — deliberately kept separate from WebsiteBuilderView's
// existing page/section state and LivePreviewEditor rather than
// replacing them in place. The old editor keeps working exactly as
// before; this panel lets the new canvas be tried and saved
// independently until Phase 7 does the real cutover (retiring the old
// editor in the same release the new one is feature-complete).
export default function BlocksBetaPanel() {
  const [website, setWebsite] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/website-builder/generate")
      .then((r) => r.json())
      .then((d) => {
        setWebsite(d.website ?? null);
        setPages(d.pages ?? []);
        const first = d.pages?.[0];
        if (first) {
          setActivePageId(first.id);
          setBlocks(legacyToBlocks(first.sections));
        }
      })
      .finally(() => setLoading(false));
    // Real products for an accurate Product Grid block preview — same
    // active-only filter the live storefront applies, never AI-authored
    // or hand-filled.
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts((d.products ?? []).filter((p: any) => p.is_active)));
  }, []);

  function selectPage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setActivePageId(pageId);
    setBlocks(legacyToBlocks(page.sections));
    setSaved(false);
  }

  async function handleSave() {
    if (!activePageId) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/website-builder/pages/${activePageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: blocks }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  if (!website || pages.length === 0) return <div className="card p-5 text-sm text-slate-400">Build your website first (Website tab) before trying the new block canvas.</div>;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap gap-1.5">
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPage(p.id)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border ${activePageId === p.id ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"}`}
              >
                {p.title}
              </button>
            ))}
          </div>
          <button onClick={handleSave} disabled={saving} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {saved ? "Saved" : "Save Page"}
          </button>
        </div>
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5">
          Beta: a preview of the upcoming drag-and-drop block editor. Saving here writes the new block format to this page — the live storefront already renders it either way. The Website tab's editor is unaffected until this replaces it.
        </p>
      </div>

      <div className="card p-4">
        <BlockCanvas blocks={blocks} onChange={setBlocks} theme={getTheme(website.theme_key)} slug={website.slug} products={products} />
      </div>
    </div>
  );
}
