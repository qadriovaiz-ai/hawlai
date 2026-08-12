"use client";

import { useState } from "react";
import { Sparkles, Wrench } from "lucide-react";
import { SEO_TASKS } from "@/lib/agents/seoToolkitAgent";
import { Button, Card } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

export default function SeoToolkit() {
  const [selectedTask, setSelectedTask] = useState(SEO_TASKS[0].key);
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/seo/toolkit" });

  const currentMeta = SEO_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Wrench className="w-4 h-4" /> SEO Toolkit
      </p>

      <Card className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {SEO_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTask(t.key); reset(); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                selectedTask === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-brand-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button onClick={() => generate({ taskType: selectedTask })} loading={loading} className="mt-2">
          {!loading && <Sparkles className="w-4 h-4" />}
          Generate {currentMeta?.label}
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
        label={(h) => SEO_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
      />
    </div>
  );
}
