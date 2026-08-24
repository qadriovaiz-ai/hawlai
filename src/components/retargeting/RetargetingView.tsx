"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Download, ShoppingCart, UserX, RotateCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import CustomAudiencesPanel from "@/components/retargeting/CustomAudiencesPanel";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

const SEGMENTS = [
  { key: "abandoned_cart", label: "Abandoned Cart", icon: ShoppingCart, desc: "Added to cart, didn't check out" },
  { key: "cold_lead", label: "Cold Leads", icon: UserX, desc: "Interested once, went quiet" },
  { key: "lapsed_buyer", label: "Lapsed Buyers", icon: RotateCcw, desc: "Bought once, haven't returned" },
] as const;

export default function RetargetingView() {
  const [segments, setSegments] = useState<any>(null);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [selected, setSelected] = useState<typeof SEGMENTS[number]["key"]>("abandoned_cart");
  const {
    loading: generating, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/retargeting/generate" });

  useEffect(() => {
    fetch("/api/retargeting/segments").then((r) => r.json()).then((d) => setSegments(d.segments)).finally(() => setLoadingSegments(false));
  }, []);

  const currentSegment = segments?.[selected];
  const currentCount = currentSegment?.count ?? 0;

  return (
    <div className="space-y-5">
      {/* Segment picker with real counts */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Real audience segments</p>
        {loadingSegments ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your real numbers...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SEGMENTS.map((s) => {
              const Icon = s.icon;
              const count = segments?.[s.key]?.count ?? 0;
              return (
                <button
                  key={s.key}
                  onClick={() => { setSelected(s.key); reset(); }}
                  className={`text-left p-3 rounded-lg border transition-colors ${selected === s.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-brand-400"}`}
                >
                  <Icon className="w-4 h-4 mb-1.5" />
                  <p className="text-sm font-semibold">{count} people</p>
                  <p className={`text-xs ${selected === s.key ? "text-white/70" : "text-slate-400"}`}>{s.label}</p>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400">{SEGMENTS.find((s) => s.key === selected)?.desc} — real data from your leads, carts, and orders.</p>
      </Card>

      {/* Generate */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Ad copy for this segment</p>
          <button
            onClick={() => window.open(`/api/retargeting/export?segment=${selected}`, "_blank")}
            disabled={currentCount === 0}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Download audience CSV
          </button>
        </div>
        <Button onClick={() => generate({ segmentType: selected })} loading={generating} disabled={currentCount === 0}>
          {!generating && <Sparkles className="w-4 h-4" />}
          Generate ad copy
        </Button>
        {currentCount === 0 && !loadingSegments && <p className="text-xs text-slate-400">No one in this segment yet — nothing to generate copy for.</p>}
      </Card>

      <GeneratedOutputPanel
        title="Ad copy"
        output={output}
        editing={editing}
        draft={draft}
        saving={saving}
        copied={copied}
        outputId={outputId}
        onStartEditing={startEditing}
        onCancelEditing={cancelEditing}
        onSaveEdits={saveEdits}
        onCopy={copyOutput}
        onDraftChange={setDraft}
      />

      <GeneratedHistoryPanel
        items={history}
        onSelect={selectFromHistory}
        label={(h) => SEGMENTS.find((s) => s.key === h.segment_type)?.label ?? h.segment_type}
      />

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">How to actually run this</p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal pl-4">
          <li>Download the audience CSV above for this segment.</li>
          <li>In Meta Ads Manager: Audiences → Create Audience → Custom Audience → Customer List → upload the CSV.</li>
          <li>Use the generated ad copy for a new campaign targeted at that Custom Audience.</li>
        </ol>
        <p className="text-xs text-slate-400">
          Phone numbers and emails in this file are hashed (SHA-256), which is the format Meta requires — Meta matches the hashes against its own, so nothing readable leaves your account. Anyone who opted out of contact is automatically excluded, so the file may contain fewer people than the count shown above.
        </p>
        <p className="text-xs text-slate-400">
          Uploading a CSV is the manual route. If your Meta ad account is connected, the panel below builds these audiences directly in Meta instead — no download needed.
        </p>
      </Card>

      <CustomAudiencesPanel />
    </div>
  );
}
