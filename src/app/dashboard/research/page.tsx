"use client";

// Competitor research: what competitors say about themselves in public,
// and the ground this business can own — the same comparison as the
// Strategy page (components/strategy/PositioningPanel).
//
// WHY (2026-09-19): this page searched Meta's Ad Library API, which returns
// only political/issue ads outside the EU. For an Indian business every
// search answered "Application does not have permission for this action".

import Link from "next/link";
import { Swords, ArrowRight } from "lucide-react";
import PositioningPanel from "@/components/strategy/PositioningPanel";

export default function ResearchPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Swords className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Competitor research</h1>
          <p className="text-sm text-slate-500">What your competitors say about themselves, and where you can say something they don't</p>
        </div>
      </div>

      <PositioningPanel />

      <Link href="/dashboard/competitor-intel" className="card p-4 flex items-center justify-between hover:border-brand-400 transition-colors">
        <span className="text-sm text-slate-700">Watch a competitor, or dig into one — pricing, social, SEO, content gaps</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </Link>
    </div>
  );
}
