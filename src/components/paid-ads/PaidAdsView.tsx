"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Megaphone } from "lucide-react";
import { AD_PLATFORMS, AD_TASKS } from "@/lib/agents/paidAdsAgent";
import { Button, Card } from "@/components/ui";
import { useGeneratedOutput } from "@/lib/hooks/useGeneratedOutput";
import { GeneratedOutputPanel } from "@/components/shared/GeneratedOutputPanel";
import { GeneratedHistoryPanel } from "@/components/shared/GeneratedHistoryPanel";

export default function PaidAdsView() {
  const [platform, setPlatform] = useState(AD_PLATFORMS[0].key);
  const [taskType, setTaskType] = useState(AD_TASKS[0].key);
  const {
    loading, output, outputId, editing, draft, saving, copied, history,
    generate, startEditing, cancelEditing, saveEdits, copyOutput, selectFromHistory, reset, setDraft,
  } = useGeneratedOutput({ endpoint: "/api/paid-ads/generate", query: `?platform=${platform}` });

  const currentTaskMeta = AD_TASKS.find((t) => t.key === taskType);
  const currentPlatformMeta = AD_PLATFORMS.find((p) => p.key === platform);

  function changePlatform(key: string) {
    setPlatform(key);
    reset();
  }

  return (
    <div className="space-y-5">
      {/* Meta Ads — real, connected */}
      <Link href="/dashboard/ads/campaigns" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Megaphone className="w-4 h-4 text-brand-400" /> Meta Ads — connected, launch real campaigns in Ads Manager
        </span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>

      <Card className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 mb-1">Platform (planning — not yet connected)</p>
        <div className="flex flex-wrap gap-1.5">
          {AD_PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => changePlatform(p.key)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                platform === p.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-brand-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{currentPlatformMeta?.label} isn't connected to a real ad account yet — this generates planning content for {currentPlatformMeta?.label} campaigns until it is.</p>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-semibold text-slate-400 mb-1">Task</p>
        <div className="flex flex-wrap gap-1.5">
          {AD_TASKS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTaskType(t.key); reset(); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                taskType === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-200 border-slate-300 text-slate-600 hover:border-brand-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">Need creative images/banners? Use <Link href="/dashboard/graphic-design" className="text-brand-400 hover:underline">Graphic Design</Link> — Ad Creative type.</p>
        <Button onClick={() => generate({ platform, taskType })} loading={loading}>
          {!loading && <Sparkles className="w-4 h-4" />}
          Generate {currentTaskMeta?.label} for {currentPlatformMeta?.label}
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
        label={(h) => AD_TASKS.find((t) => t.key === h.task_type)?.label ?? h.task_type}
        title={`Recent for ${currentPlatformMeta?.label}`}
      />
    </div>
  );
}
