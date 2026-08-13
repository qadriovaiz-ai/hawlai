"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Video, Mic2, ArrowRight } from "lucide-react";
import { VIDEO_TASKS } from "@/lib/agents/videoMarketingAgent";
import { Button, Card, Input } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

export default function VideoMarketingView() {
  const [selectedTask, setSelectedTask] = useState(VIDEO_TASKS[0].key);
  const [topic, setTopic] = useState("");
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/video-marketing/generate" });

  const currentMeta = VIDEO_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-5">
      {/* Link to existing AI video generation + voiceover in Creative Studio */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/dashboard/creative-studio" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Video className="w-4 h-4 text-brand-400" /> AI Video Generation</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
        <Link href="/dashboard/creative-studio" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Mic2 className="w-4 h-4 text-brand-400" /> Voiceover</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
      </div>

      {/* Task picker */}
      <Card className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_TASKS.map((t) => (
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
      </Card>

      {/* Generator */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Generate: {currentMeta?.label}</p>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic or video subject (optional)"
        />
        <Button onClick={() => generate({ taskType: selectedTask, topic })} loading={loading}>
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
        label={(h) => VIDEO_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
        note={(h) => h.topic}
      />
    </div>
  );
}
