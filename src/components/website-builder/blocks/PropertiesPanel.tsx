"use client";

import { X } from "lucide-react";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import type { Block } from "@/lib/blocks/types";
import RichTextArea from "../RichTextArea";
import ImageUploader from "../ImageUploader";

// Registry-driven — every block type declares its own `propFields`
// schema (see registry.ts), so this form never needs a per-type branch;
// adding a new block type or a new editable prop to an existing one
// never touches this file.
export default function PropertiesPanel({
  block,
  onChange,
  onDeselect,
}: {
  block: Block | null;
  onChange: (props: Record<string, any>) => void;
  onDeselect: () => void;
}) {
  if (!block) {
    return <div className="w-56 shrink-0 text-xs text-slate-400 p-3 sticky top-0">Select a block to edit its properties.</div>;
  }

  const def = BLOCK_REGISTRY[block.type];
  const fields = def?.propFields ?? [];

  function set(key: string, value: any) {
    onChange({ [key]: value });
  }

  return (
    <div className="w-56 shrink-0 space-y-3 sticky top-0">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">{def?.label ?? block.type}</p>
        <button onClick={onDeselect} className="text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
      </div>

      {fields.length === 0 && <p className="text-xs text-slate-400">No editable properties.</p>}

      {fields.map((f) => (
        <div key={f.key}>
          <p className="text-[10px] text-slate-400 mb-1">{f.label}</p>
          {f.type === "select" ? (
            <select
              value={block.props[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="w-full text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5"
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : f.type === "boolean" ? (
            <input type="checkbox" checked={!!block.props[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="w-4 h-4 accent-purple-600" />
          ) : f.type === "richtext" ? (
            <RichTextArea
              value={block.props[f.key] ?? ""}
              onChange={(v) => set(f.key, v)}
              rows={3}
              className="w-full text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5"
            />
          ) : f.type === "textarea" ? (
            <textarea
              value={block.props[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              rows={3}
              className="w-full text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5"
            />
          ) : f.type === "image" ? (
            <ImageUploader kind="section" currentUrl={block.props[f.key] || undefined} onUploaded={(url) => set(f.key, url)} />
          ) : f.type === "number" ? (
            <input
              type="number"
              value={block.props[f.key] ?? ""}
              onChange={(e) => set(f.key, Number(e.target.value))}
              className="w-full text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5"
            />
          ) : (
            <input
              type="text"
              value={block.props[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.type === "url" ? "https://..." : undefined}
              className="w-full text-xs bg-white text-slate-50 border border-slate-300 rounded px-2 py-1.5"
            />
          )}
        </div>
      ))}
    </div>
  );
}
