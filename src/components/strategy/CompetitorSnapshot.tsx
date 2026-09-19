"use client";

// What competitors say most, and the open ground this business can own —
// read from the latest positioning run, for places that need a glance while
// writing (the ad launcher). Runs nothing itself: a new comparison is web
// searches and Research Credits, so it's only ever started on purpose.

import { useState } from "react";
import Link from "next/link";
import { Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui";

type Row = { key: string; label: string; claimedBy: string[]; yourFacts: string[]; standing: "crowded" | "contested" | "open" };

/** The two lines worth reading while writing an ad: what everyone says, and what only this business can back up. */
export function snapshotLines(rows: Row[], total: number): { everyone: string | null; yours: string | null } {
  const crowded = rows.filter((r) => r.standing === "crowded");
  const yours = rows.filter((r) => r.standing === "open" && r.yourFacts.length > 0);
  return {
    everyone: crowded.length ? `${crowded.map((r) => `${r.label} (${r.claimedBy.length} of ${total})`).join(", ")} — say it too and you blend in.` : null,
    yours: yours.length ? `${yours.map((r) => r.label).join(", ")}.` : null,
  };
}

export default function CompetitorSnapshot() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [ranOn, setRanOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/strategy/positioning");
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) throw new Error(d?.error ?? "Couldn't load your competitor comparison.");
      const p = d.run?.analysis?.positioning;
      setRows(p?.rows ?? []);
      setTotal(p?.competitorCount ?? 0);
      setRanOn(d.run?.created_at ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setState("done");
    }
  }

  if (state === "idle") {
    return (
      <Button onClick={load} variant="secondary" size="sm" className="w-full justify-center">
        <Swords className="w-3.5 h-3.5" /> What do competitors say?
      </Button>
    );
  }
  if (state === "loading") return <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your comparison...</p>;
  if (error) return <p className="text-xs text-red-500">{error}</p>;

  if (!ranOn) {
    return (
      <p className="text-xs text-slate-500">
        No competitor comparison yet.{" "}
        <Link href="/dashboard/strategy" className="text-brand-400 hover:text-brand-300">Run one on the Strategy page</Link> — it reads what your competitors say about themselves, in the background (a few minutes).
      </p>
    );
  }

  const lines = snapshotLines(rows, total);
  return (
    <div className="space-y-1.5 text-xs">
      {lines.everyone && <p className="text-slate-600"><span className="font-semibold">Everyone says:</span> {lines.everyone}</p>}
      {lines.yours && <p className="text-slate-600"><span className="font-semibold">Open ground you can back up:</span> {lines.yours}</p>}
      {!lines.everyone && !lines.yours && <p className="text-slate-500">No clear crowding or open ground in your last comparison.</p>}
      <p className="text-slate-400">
        From your comparison on {new Date(ranOn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
        <Link href="/dashboard/strategy" className="text-brand-400 hover:text-brand-300">details and sources</Link>
      </p>
    </div>
  );
}
