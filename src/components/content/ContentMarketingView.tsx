"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { CONTENT_TYPES } from "@/lib/agents/contentMarketingAgent";
import { Button, Card, Input } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

const GROUPS = ["Social Posts", "Long-form", "Email & Sales Copy", "Video", "Quick Wins"] as const;

export default function ContentMarketingView() {
  const [selectedType, setSelectedType] = useState(CONTENT_TYPES[0].key);
  const [topic, setTopic] = useState("");
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/content-marketing/generate" });

  const currentMeta = CONTENT_TYPES.find((t) => t.key === selectedType);

  return (
    <div className="space-y-5">
      {/* Type picker */}
      <Card className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="text-xs font-semibold text-slate-400 mb-1.5">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.filter((t) => t.group === group).map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setSelectedType(t.key); reset(); }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    selectedType === t.key
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-slate-200 border-slate-300 text-slate-600 hover:border-brand-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>

      {/* Generator */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Generate: {currentMeta?.label}</p>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, product, or offer (optional — leave blank for a general idea)"
        />
        <Button onClick={() => generate({ contentType: selectedType, topic })} loading={loading}>
          {!loading && <Sparkles className="w-4 h-4" />}
          Generate
        </Button>
      </Card>

      <GeneratedOutputPanel
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
        label={(h) => CONTENT_TYPES.find((t) => t.key === h.content_type)?.label ?? h.content_type}
        note={(h) => h.topic}
      />
    </div>
  );
}
