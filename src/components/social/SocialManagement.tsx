"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Users, ArrowRight, BarChart3 } from "lucide-react";
import { SOCIAL_TASKS } from "@/lib/agents/socialManagementAgent";
import { Button, Card, Input } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

export default function SocialManagement() {
  const [selectedTask, setSelectedTask] = useState(SOCIAL_TASKS[0].key);
  const [inputText, setInputText] = useState("");
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/social/management" });

  const currentMeta = SOCIAL_TASKS.find((t) => t.key === selectedTask);

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4" /> Social Media Management</p>

      <Link href="/dashboard/insights" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><BarChart3 className="w-4 h-4 text-brand-400" /> Analytics & Engagement Numbers</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      <AutopilotStatsCard />

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {SOCIAL_TASKS.map((t) => (
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

        {currentMeta?.needsInput && (
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste the DM or comment text here"
          />
        )}

        <Button onClick={() => generate({ taskType: selectedTask, inputText })} loading={loading}>
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
        label={(h) => SOCIAL_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
      />
    </div>
  );
}

function AutopilotStatsCard() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    fetch("/api/social/stats").then((r) => r.json()).then(setStats);
  }, []);

  if (!stats || stats.totalAttempted === 0) return null;

  return (
    <Card padding="sm">
      <p className="text-xs text-slate-400 mb-2">Auto-posting (last 30 days) — real numbers, not estimates</p>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-700"><span className="font-semibold">{stats.succeeded}</span> posted</span>
        {stats.failed > 0 && <span className="text-red-400"><span className="font-semibold">{stats.failed}</span> failed</span>}
      </div>
    </Card>
  );
}
