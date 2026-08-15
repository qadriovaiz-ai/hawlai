"use client";

import { useState, useEffect } from "react";
import { Layers, Plus, ChevronDown, ChevronUp, Archive, ArchiveRestore, Trash2, IndianRupee, MousePointerClick, Users, Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";

interface Asset {
  id: string;
  campaign_group_id: string;
  asset_type: "ad_creative" | "workflow" | "social_post";
  asset_id: string;
}
interface Group {
  id: string;
  name: string;
  status: "active" | "archived";
  assets: Asset[];
  performance: {
    spend: number;
    clicks: number;
    leads: number;
    workflowSends: number;
    postedSocialCount: number;
    adCreativeCount: number;
    workflowCount: number;
    socialPostCount: number;
  };
}
interface AvailableAssets {
  adCreatives: { id: string; headline: string | null }[];
  workflows: { id: string; name: string }[];
  socialPosts: { id: string; caption: string }[];
}

export default function CampaignGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [available, setAvailable] = useState<AvailableAssets>({ adCreatives: [], workflows: [], socialPosts: [] });
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      fetch("/api/campaign-groups").then((r) => r.json()),
      fetch("/api/campaign-groups/available-assets").then((r) => r.json()),
    ])
      .then(([groupsData, assetsData]) => {
        setGroups(groupsData.groups ?? []);
        setAvailable(assetsData);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function createGroup() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/campaign-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: "active" | "archived") {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, status } : g)));
    await fetch(`/api/campaign-groups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  async function removeGroup(id: string) {
    if (!confirm("Delete this campaign group? Assets themselves won't be touched.")) return;
    await fetch(`/api/campaign-groups/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleAsset(groupId: string, assetType: Asset["asset_type"], assetId: string, attached: boolean) {
    await fetch(`/api/campaign-groups/${groupId}/assets`, {
      method: attached ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetType, assetId }),
    });
    load();
  }

  if (loading) return <LoadingState className="justify-center py-20" />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Layers className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Campaign Groups</h1>
          <p className="text-sm text-slate-500">Group ads, workflows, and social posts from the same initiative to see combined performance</p>
        </div>
      </div>

      <div className="card p-4 flex items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Diwali Sale 2026" className="flex-1" />
        <Button onClick={createGroup} loading={creating} disabled={!newName.trim()}>
          {!creating && <Plus className="w-4 h-4" />} New Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No campaign groups yet"
          description="Create one above, then attach an ad, a workflow, or queued social posts to see their combined performance in one place."
        />
      ) : (
        groups.map((g) => (
          <div key={g.id} className={`card p-4 space-y-3 ${g.status === "archived" ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">{g.name}</p>
                {g.status === "archived" && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Archived</span>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-0.5 px-2 py-1">
                  Manage assets {expanded === g.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setStatus(g.id, g.status === "active" ? "archived" : "active")} className="text-slate-400 hover:text-slate-700 p-1.5" title={g.status === "active" ? "Archive" : "Restore"}>
                  {g.status === "active" ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                </button>
                <button onClick={() => removeGroup(g.id)} className="text-slate-400 hover:text-red-500 p-1.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
              <span className="flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" /> {formatCurrency(g.performance.spend)} spend</span>
              <span className="flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" /> {g.performance.clicks} clicks</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {g.performance.leads} leads</span>
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {g.performance.workflowSends} emails sent</span>
              <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5" /> {g.performance.postedSocialCount} posts published</span>
            </div>

            {expanded === g.id && (
              <div className="border-t border-slate-100 pt-3 space-y-4">
                <AssetSection
                  label="Ad Creatives"
                  items={available.adCreatives.map((a) => ({ id: a.id, label: a.headline ?? "Untitled ad" }))}
                  attachedIds={g.assets.filter((a) => a.asset_type === "ad_creative").map((a) => a.asset_id)}
                  onToggle={(id, attached) => toggleAsset(g.id, "ad_creative", id, attached)}
                />
                <AssetSection
                  label="Workflows"
                  items={available.workflows.map((w) => ({ id: w.id, label: w.name }))}
                  attachedIds={g.assets.filter((a) => a.asset_type === "workflow").map((a) => a.asset_id)}
                  onToggle={(id, attached) => toggleAsset(g.id, "workflow", id, attached)}
                />
                <AssetSection
                  label="Social Posts"
                  items={available.socialPosts.map((p) => ({ id: p.id, label: p.caption.slice(0, 60) }))}
                  attachedIds={g.assets.filter((a) => a.asset_type === "social_post").map((a) => a.asset_id)}
                  onToggle={(id, attached) => toggleAsset(g.id, "social_post", id, attached)}
                />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function AssetSection({
  label,
  items,
  attachedIds,
  onToggle,
}: {
  label: string;
  items: { id: string; label: string }[];
  attachedIds: string[];
  onToggle: (id: string, attached: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const attached = attachedIds.includes(item.id);
          return (
            <label key={item.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={attached} onChange={() => onToggle(item.id, attached)} className="w-3.5 h-3.5 accent-brand-600" />
              <span className="truncate">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
