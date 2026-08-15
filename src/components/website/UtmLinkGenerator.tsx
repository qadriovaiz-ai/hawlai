"use client";

import { useState } from "react";
import { Check, Copy, Tag } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";

// Standard GA-style source/medium pairs — not invented per-app, so
// numbers here read the same way in any analytics tool later.
const SOURCES = [
  { key: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { key: "whatsapp", label: "WhatsApp", source: "whatsapp", medium: "social" },
  { key: "email", label: "Email", source: "email", medium: "email" },
  { key: "other", label: "Other", source: "other", medium: "referral" },
];

function slugifyCampaign(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function UtmLinkGenerator({ slug, externalUrl }: { slug: string; externalUrl: string }) {
  const [sourceKey, setSourceKey] = useState(SOURCES[0].key);
  const [campaignName, setCampaignName] = useState("");
  const [copied, setCopied] = useState(false);

  const baseUrl = externalUrl.trim() || (slug ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.vercel.app"}/p/${slug}` : "");
  if (!baseUrl) return null;

  const picked = SOURCES.find((s) => s.key === sourceKey) ?? SOURCES[0];
  const campaignSlug = slugifyCampaign(campaignName);
  const params = new URLSearchParams({ utm_source: picked.source, utm_medium: picked.medium });
  if (campaignSlug) params.set("utm_campaign", campaignSlug);
  const taggedLink = `${baseUrl}?${params.toString()}`;

  function copyLink() {
    navigator.clipboard.writeText(taggedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card p-5 space-y-3">
      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Tag className="w-4 h-4 text-slate-400" /> Tagged Link Generator
      </label>
      <p className="text-xs text-slate-400">
        Get a link that tells you exactly where your visitors and leads came from — share the right one for each place you post.
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </Select>
        </div>
        <Input
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="Campaign name (optional)"
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
        <p className="text-xs text-slate-600 truncate flex-1">{taggedLink}</p>
        <button onClick={copyLink} className="text-slate-400 hover:text-purple-600 shrink-0">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
