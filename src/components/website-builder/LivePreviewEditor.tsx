"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus, X, GripVertical } from "lucide-react";
import type { LandingTheme } from "@/lib/landingThemes";
import ImageUploader from "./ImageUploader";
import RichTextArea from "./RichTextArea";

// Renders page sections styled exactly like the live storefront
// (SectionRenderer's look), but every text field is an editable
// input/textarea in place — so editing here already shows what the
// real site will look like, instead of a generic gray form list.

interface Props {
  sections: any[];
  theme: LandingTheme;
  onUpdateField: (sectionIndex: number, field: string, value: string) => void;
  onUpdateItem: (sectionIndex: number, itemIndex: number, field: string, value: string) => void;
  onAddItem: (sectionIndex: number) => void;
  onRemoveItem: (sectionIndex: number, itemIndex: number) => void;
  onMoveSection: (sectionIndex: number, direction: -1 | 1) => void;
  onRemoveSection: (sectionIndex: number) => void;
  onReorderSections: (fromIndex: number, toIndex: number) => void;
}

const ITEM_FIELDS: Record<string, { key: string; label: string; multiline?: boolean }[]> = {
  features_grid: [{ key: "title", label: "Title" }, { key: "description", label: "Description", multiline: true }],
  testimonials: [{ key: "quote", label: "Quote", multiline: true }, { key: "author", label: "Author" }],
  team_grid: [{ key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "bio", label: "Bio", multiline: true }],
  pricing: [{ key: "name", label: "Plan name" }, { key: "price", label: "Price" }],
  faq: [{ key: "question", label: "Question" }, { key: "answer", label: "Answer", multiline: true }],
};

function EditableText({ value, onChange, style, className, placeholder, multiline }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties; className?: string; placeholder?: string; multiline?: boolean }) {
  const sharedClassName = `bg-transparent border border-transparent hover:border-dashed hover:border-current focus:border-dashed focus:border-current focus:outline-none rounded px-1 -mx-1 w-full ${className ?? ""}`;
  if (multiline) {
    return <RichTextArea value={value} onChange={onChange} placeholder={placeholder} style={style} className={sharedClassName} rows={2} />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={style} className={sharedClassName} />;
}

function SectionToolbar({ onMoveUp, onMoveDown, onRemove, disableUp, disableDown, dragHandleProps }: { onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void; disableUp: boolean; disableDown: boolean; dragHandleProps: any }) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-200 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      <span {...dragHandleProps} className="text-slate-400 hover:text-slate-700 p-1 cursor-grab active:cursor-grabbing"><GripVertical className="w-3.5 h-3.5" /></span>
      <button onClick={onMoveUp} disabled={disableUp} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 p-1"><ChevronUp className="w-3.5 h-3.5" /></button>
      <button onClick={onMoveDown} disabled={disableDown} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 p-1"><ChevronDown className="w-3.5 h-3.5" /></button>
      <button onClick={onRemove} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function LivePreviewEditor({ sections, theme, onUpdateField, onUpdateItem, onAddItem, onRemoveItem, onMoveSection, onRemoveSection, onReorderSections }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div style={{ backgroundColor: theme.bg }} className="rounded-xl overflow-hidden border border-slate-200">
      {sections.map((section, i) => (
        <div
          key={i}
          className={`relative group ${dragIndex === i ? "opacity-40" : ""} ${overIndex === i && dragIndex !== null && dragIndex !== i ? "border-t-2 border-purple-500" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null) setOverIndex(i); }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null && dragIndex !== i) onReorderSections(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
        >
          <SectionToolbar
            onMoveUp={() => onMoveSection(i, -1)}
            onMoveDown={() => onMoveSection(i, 1)}
            onRemove={() => onRemoveSection(i)}
            disableUp={i === 0}
            disableDown={i === sections.length - 1}
            dragHandleProps={{
              draggable: true,
              onDragStart: () => setDragIndex(i),
              onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
            }}
          />
          <SectionBlock
            section={section}
            theme={theme}
            sectionIndex={i}
            onUpdateField={onUpdateField}
            onUpdateItem={onUpdateItem}
            onAddItem={onAddItem}
            onRemoveItem={onRemoveItem}
          />
        </div>
      ))}
    </div>
  );
}

function SectionBlock({ section, theme, sectionIndex, onUpdateField, onUpdateItem, onAddItem, onRemoveItem }: {
  section: any; theme: LandingTheme; sectionIndex: number;
  onUpdateField: Props["onUpdateField"]; onUpdateItem: Props["onUpdateItem"]; onAddItem: Props["onAddItem"]; onRemoveItem: Props["onRemoveItem"];
}) {
  const update = (field: string, value: string) => onUpdateField(sectionIndex, field, value);
  const updateItem = (itemIndex: number, field: string, value: string) => onUpdateItem(sectionIndex, itemIndex, field, value);

  switch (section.type) {
    case "hero":
      return (
        <section className="px-6 py-16 sm:py-24 text-center" style={{ backgroundColor: theme.dark }}>
          <EditableText value={section.headline ?? ""} onChange={(v) => update("headline", v)} placeholder="Headline" className="text-3xl sm:text-5xl font-bold mb-4 text-center" style={{ color: theme.bg }} />
          <EditableText value={section.subheadline ?? ""} onChange={(v) => update("subheadline", v)} placeholder="Subheadline" multiline className="text-base sm:text-lg max-w-xl mx-auto mb-6 opacity-80 text-center" style={{ color: theme.bg }} />
          <div className="inline-block px-6 py-3 rounded-full font-semibold" style={{ backgroundColor: theme.accent, color: theme.accentText }}>
            <EditableText value={section.ctaText ?? ""} onChange={(v) => update("ctaText", v)} placeholder="Button text" className="text-center font-semibold" style={{ color: theme.accentText, minWidth: "80px" }} />
          </div>
        </section>
      );
    case "text":
      return (
        <section className="px-6 py-12 max-w-2xl mx-auto text-center">
          <EditableText value={section.heading ?? ""} onChange={(v) => update("heading", v)} placeholder="Heading" className="text-2xl font-bold mb-3 text-center" style={{ color: theme.dark }} />
          <EditableText value={section.body ?? ""} onChange={(v) => update("body", v)} placeholder="Body text" multiline className="text-neutral-600 leading-relaxed text-center" />
        </section>
      );
    case "image_text":
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          <div className={`flex flex-col ${section.imagePosition === "right" ? "sm:flex-row-reverse" : "sm:flex-row"} gap-8 items-center`}>
            <div className="flex-1 aspect-video bg-neutral-100 rounded-xl overflow-hidden relative group/img">
              {section.imageUrl && <img src={section.imageUrl} alt="" className="w-full h-full object-cover" />}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 bg-black/30 transition-opacity">
                <ImageUploader kind="section" currentUrl={undefined} onUploaded={(url) => update("imageUrl", url)} compact className="[&>button]:w-10 [&>button]:h-10" />
              </div>
            </div>
            <div className="flex-1">
              <EditableText value={section.heading ?? ""} onChange={(v) => update("heading", v)} placeholder="Heading" className="text-2xl font-bold mb-2" style={{ color: theme.dark }} />
              <EditableText value={section.body ?? ""} onChange={(v) => update("body", v)} placeholder="Body text" multiline className="text-neutral-600 leading-relaxed" />
            </div>
          </div>
        </section>
      );
    case "features_grid":
    case "testimonials":
    case "team_grid":
    case "pricing":
    case "faq": {
      const fields = ITEM_FIELDS[section.type] ?? [];
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          <EditableText value={section.heading ?? ""} onChange={(v) => update("heading", v)} placeholder="Heading" className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }} />
          <div className={`grid gap-5 ${section.type === "faq" || section.type === "testimonials" ? "sm:grid-cols-2" : "sm:grid-cols-2 md:grid-cols-3"}`}>
            {(section.items ?? []).map((item: any, ii: number) => (
              <div key={ii} className="p-5 rounded-xl border border-neutral-200 relative group/item">
                <button onClick={() => onRemoveItem(sectionIndex, ii)} className="absolute top-2 right-2 text-neutral-300 hover:text-red-400 opacity-0 group-hover/item:opacity-100"><X className="w-3.5 h-3.5" /></button>
                {fields.map((f) => (
                  <EditableText
                    key={f.key}
                    value={item[f.key] ?? ""}
                    onChange={(v) => updateItem(ii, f.key, v)}
                    placeholder={f.label}
                    multiline={f.multiline}
                    className={`text-sm mb-1 ${f.key === "title" || f.key === "name" || f.key === "question" ? "font-semibold" : "text-neutral-500"}`}
                    style={{ color: f.key === "title" || f.key === "name" || f.key === "question" ? theme.dark : undefined }}
                  />
                ))}
              </div>
            ))}
          </div>
          <button onClick={() => onAddItem(sectionIndex)} className="text-xs text-neutral-400 hover:text-neutral-700 flex items-center gap-1 mt-3 mx-auto"><Plus className="w-3.5 h-3.5" /> Add item</button>
        </section>
      );
    }
    case "cta_banner":
      return (
        <section className="px-6 py-14 text-center" style={{ backgroundColor: theme.accent }}>
          <EditableText value={section.headline ?? ""} onChange={(v) => update("headline", v)} placeholder="Headline" className="text-2xl font-bold mb-4 text-center" style={{ color: theme.accentText }} />
          <div className="inline-block px-6 py-3 rounded-full font-semibold bg-white">
            <EditableText value={section.ctaText ?? ""} onChange={(v) => update("ctaText", v)} placeholder="Button text" className="text-center font-semibold" style={{ color: theme.dark, minWidth: "80px" }} />
          </div>
        </section>
      );
    case "contact_form":
      return (
        <section className="px-6 py-14 max-w-md mx-auto">
          <EditableText value={section.heading ?? ""} onChange={(v) => update("heading", v)} placeholder="Heading" className="text-2xl font-bold mb-5 text-center" style={{ color: theme.dark }} />
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
            <div className="h-10 rounded-lg bg-neutral-100" />
            <div className="h-10 rounded-lg bg-neutral-100" />
            <div className="h-10 rounded-lg" style={{ backgroundColor: theme.accent }} />
          </div>
          <p className="text-xs text-neutral-400 text-center mt-2">Real lead form — visitors see this live</p>
        </section>
      );
    case "product_catalog":
      return (
        <section className="px-6 py-12 max-w-5xl mx-auto text-center">
          <EditableText value={section.heading ?? ""} onChange={(v) => update("heading", v)} placeholder="Heading" className="text-2xl font-bold mb-4 text-center" style={{ color: theme.dark }} />
          <div className="grid sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-dashed border-neutral-300 aspect-square flex items-center justify-center text-xs text-neutral-400">
                Live product
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-3">Real products from your Products tab appear here automatically</p>
        </section>
      );
    default:
      return null;
  }
}
