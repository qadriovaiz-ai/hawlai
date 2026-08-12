"use client";

import { Pencil, Save, X, Copy, Check } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { OutputRenderer, EditableOutput } from "@/components/shared/GeneratedOutputEditor";

// The "Result" card every generate/edit/save/copy department page
// renders — paired with useGeneratedOutput. Edit/Copy are deliberately
// left as accent-colored text links rather than <Button variant="ghost">
// — ghost's neutral gray would lose the branded-link treatment these
// were designed with, and forcing them into a variant that doesn't fit
// would be the "bad fit" the rollout was told to flag rather than force.
export interface GeneratedOutputPanelProps {
  output: any;
  editing: boolean;
  draft: any;
  saving: boolean;
  copied: boolean;
  outputId: string | null;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveEdits: () => void;
  onCopy: () => void;
  onDraftChange: (next: any) => void;
  title?: string;
}

export function GeneratedOutputPanel({
  output,
  editing,
  draft,
  saving,
  copied,
  outputId,
  onStartEditing,
  onCancelEditing,
  onSaveEdits,
  onCopy,
  onDraftChange,
  title = "Result",
}: GeneratedOutputPanelProps) {
  if (!output) return null;
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={onCancelEditing}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={onSaveEdits} loading={saving} disabled={!outputId}>
                {!saving && <Save className="w-3.5 h-3.5" />} Save
              </Button>
            </>
          ) : (
            <>
              {outputId && (
                <button onClick={onStartEditing} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              <button onClick={onCopy} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? <EditableOutput output={draft} onChange={onDraftChange} /> : <OutputRenderer output={output} />}
    </Card>
  );
}
