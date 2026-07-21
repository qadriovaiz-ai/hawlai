"use client";

import { useRef } from "react";
import { Bold, Italic, Link2 } from "lucide-react";

function wrapSelection(value: string, start: number, end: number, marker: string) {
  const selected = value.slice(start, end) || "text";
  const newValue = value.slice(0, start) + marker + selected + marker + value.slice(end);
  return { value: newValue, start: start + marker.length, end: start + marker.length + selected.length };
}

function insertLink(value: string, start: number, end: number, url: string) {
  const selected = value.slice(start, end) || "link text";
  const newValue = value.slice(0, start) + `[${selected}](${url})` + value.slice(end);
  return { value: newValue, start: start + 1, end: start + 1 + selected.length };
}

export default function RichTextArea({
  value,
  onChange,
  placeholder,
  className,
  style,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(kind: "bold" | "italic" | "link") {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    let result: { value: string; start: number; end: number };
    if (kind === "link") {
      const url = window.prompt("Link URL", "https://");
      if (!url) return;
      result = insertLink(value, start, end, url);
    } else {
      result = wrapSelection(value, start, end, kind === "bold" ? "**" : "*");
    }
    onChange(result.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  }

  return (
    <div className="relative group/rt">
      <div className="absolute top-full left-0 mt-1 flex items-center gap-0.5 bg-white border border-slate-200 rounded-md shadow-sm px-1 py-0.5 opacity-0 group-focus-within/rt:opacity-100 group-hover/rt:opacity-100 transition-opacity z-20">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("bold")} className="p-1 text-slate-400 hover:text-slate-700" title="Bold">
          <Bold className="w-3 h-3" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("italic")} className="p-1 text-slate-400 hover:text-slate-700" title="Italic">
          <Italic className="w-3 h-3" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("link")} className="p-1 text-slate-400 hover:text-slate-700" title="Link">
          <Link2 className="w-3 h-3" />
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={className}
        style={style}
      />
    </div>
  );
}
