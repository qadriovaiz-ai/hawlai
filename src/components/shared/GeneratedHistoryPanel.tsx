"use client";

import { Clock } from "lucide-react";
import { Card } from "@/components/ui";
import type { HistoryItem } from "@/lib/hooks/useGeneratedOutput";

export interface GeneratedHistoryPanelProps {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  label: (item: HistoryItem) => string;
  note?: (item: HistoryItem) => string | null | undefined;
  title?: string;
}

export function GeneratedHistoryPanel({ items, onSelect, label, note, title = "Recent" }: GeneratedHistoryPanelProps) {
  if (items.length === 0) return null;
  return (
    <Card className="space-y-2">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Clock className="w-4 h-4" /> {title}
      </p>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {items.map((h) => (
          <button key={h.id} onClick={() => onSelect(h)} className="w-full text-left text-xs bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5">
            <span className="font-medium text-slate-700">{label(h)}</span>
            {note?.(h) && <span className="text-slate-400"> — {note(h)}</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}
