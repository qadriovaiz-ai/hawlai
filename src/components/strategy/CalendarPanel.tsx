"use client";

// The next 90 days, week by week (Advanced Strategy step 4). What each week
// is for is decided in code — festival windows with the angle for how this
// business makes money, then its weakest funnel step, open ground and
// customers going quiet; the idea in each week is written by a model and
// checked (lib/strategy/calendar). "Create this" opens Content Marketing
// with the format and topic filled in.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2, Sparkles, Info, PartyPopper, Target, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

type Week = {
  week: number;
  starts: string;
  ends: string;
  focus: { kind: string; label: string; detail: string };
  festival: { name: string; date: string; phase: "launch" | "day"; angle: string } | null;
  alsoFestivals: string[];
  greetings: string[];
  datesUnknown: boolean;
  idea: { title: string; format: string; idea: string } | null;
  ideaNote: string | null;
};
type Review = {
  weeksTotal: number;
  weeksWithSomethingMade: number;
  made: { week: number; made: number }[];
  broughtBack: { orders: number; revenueInr: number; bookings: number } | null;
  funnel: { name: string; steps: { label: string; then: number; now: number; change: number }[] }[];
  notes: string[];
};
type Quarter = { id: string; starts_on: string; ends_on: string; weeks: Week[]; notes: { removed?: string[]; aiFailure?: string; diagnosis?: string; festivals?: string; positioningFrom?: string | null }; cost_inr: number; created_at: string };

const FORMAT_LABEL: Record<string, string> = {
  instagram_post: "Instagram post",
  carousel: "Carousel",
  shorts_script: "Reel / Short",
  facebook_post: "Facebook post",
  linkedin_post: "LinkedIn post",
  email_newsletter: "Email newsletter",
  blog_post: "Blog post",
};

const day = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Where "Create this" goes: Content Marketing, with the format and the idea
 * as its topic — and which week it came from, so the quarter can later say
 * what was actually done (step 5).
 */
export function createHref(w: Week, quarterId?: string | null): string | null {
  if (!w.idea) return null;
  const q = new URLSearchParams({ type: w.idea.format, topic: `${w.idea.title} — ${w.idea.idea}` });
  if (quarterId) {
    q.set("quarter", quarterId);
    q.set("week", String(w.week));
  }
  return `/dashboard/content-marketing?${q.toString()}`;
}

export default function CalendarPanel() {
  const [quarter, setQuarter] = useState<Quarter | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategy/calendar")
      .then((r) => r.json())
      .then((d) => setQuarter(d.quarter ?? null))
      .catch(() => setError("Couldn't load your plan right now."))
      .finally(() => setLoading(false));
  }, []);

  /** What actually happened this quarter — only when asked (step 5). */
  async function howItsGoing() {
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/calendar?review=1");
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.review) return setError(d?.error ?? "Couldn't read how it's going — try again.");
      setReview(d.review);
    } catch {
      setError("Couldn't reach Hawlai — check your connection and try again.");
    } finally {
      setReviewing(false);
    }
  }

  async function plan() {
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/calendar", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.quarter) return setError(d?.error ?? `Couldn't plan right now (${res.status}) — try again.`);
      setQuarter(d.quarter);
    } catch {
      setError("Couldn't reach Hawlai — check your connection and try again.");
    } finally {
      setPlanning(false);
    }
  }

  if (loading) {
    return <div className="card p-5 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading your plan...</div>;
  }

  const notes = quarter?.notes ?? {};
  /** How many pieces were made from a week — 0 until "How is it going?" is pressed. */
  const made = (week: number) => review?.made.find((m) => m.week === week)?.made ?? 0;
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-slate-400" /> Your next 90 days</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Week by week: festivals when their campaign window is open, and in between, what your own numbers and competitors say to work on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quarter && (
            <Button size="sm" variant="secondary" onClick={howItsGoing} loading={reviewing} disabled={reviewing || planning}>
              How is it going?
            </Button>
          )}
          <Button size="sm" onClick={plan} loading={planning} disabled={planning}>
            {!planning && <Sparkles className="w-3.5 h-3.5" />} {quarter ? "Plan again" : "Plan the next 90 days"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {planning && <p className="text-xs text-slate-400">Planning 13 weeks — this takes about a minute.</p>}

      {quarter && (
        <>
          <p className="text-[11px] text-slate-400">
            {day(quarter.starts_on)} – {day(quarter.ends_on)} · planned {new Date(quarter.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            {notes.positioningFrom ? " · uses your competitor comparison" : " · no competitor comparison yet — run one above to sharpen the in-between weeks"}
          </p>
          {notes.aiFailure && <p className="text-xs text-amber-700 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> The weeks are planned, but no ideas were written: {notes.aiFailure}</p>}
          {notes.diagnosis && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> {notes.diagnosis}</p>}
          {notes.festivals && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> {notes.festivals}</p>}

          {/* What was actually made, brought back, and where the funnel
              moved since this quarter was planned (step 5). */}
          {review && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">How it's going</p>
              <p className="text-xs text-slate-700">
                Something was made from {review.weeksWithSomethingMade} of {review.weeksTotal} weeks.
              </p>
              {review.broughtBack && (review.broughtBack.orders > 0 || review.broughtBack.bookings > 0) && (
                <p className="text-xs text-slate-700">
                  Your retargeting ads brought back {review.broughtBack.orders > 0 ? `${review.broughtBack.orders} order${review.broughtBack.orders === 1 ? "" : "s"}${review.broughtBack.revenueInr > 0 ? ` · ₹${review.broughtBack.revenueInr.toLocaleString("en-IN")}` : ""}` : ""}
                  {review.broughtBack.orders > 0 && review.broughtBack.bookings > 0 ? " and " : ""}
                  {review.broughtBack.bookings > 0 ? `${review.broughtBack.bookings} booking${review.broughtBack.bookings === 1 ? "" : "s"}` : ""}.
                </p>
              )}
              {review.funnel.map((f) => (
                <p key={f.name} className="text-[11px] text-slate-500">
                  {f.name}: {f.steps.map((s) => `${s.label} ${s.then} → ${s.now}${s.change === 0 ? "" : ` (${s.change > 0 ? "+" : ""}${s.change})`}`).join(" · ")}
                </p>
              ))}
              {review.notes.map((n, i) => (
                <p key={i} className="text-[10.5px] text-slate-400">{n}</p>
              ))}
            </div>
          )}

          <ol className="space-y-2">
            {quarter.weeks.map((w) => {
              const href = createHref(w, quarter.id);
              return (
                <li key={w.week} className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[11px] font-semibold text-slate-500 tabular-nums">
                      Week {w.week} · {day(w.starts)} – {day(w.ends)}
                      {made(w.week) > 0 && <span className="ml-1.5 text-green-600">· made {made(w.week)}</span>}
                    </p>
                    {w.focus.kind === "festival" ? (
                      <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 inline-flex items-center gap-1"><PartyPopper className="w-3 h-3" /> {w.focus.label}{w.festival?.phase === "day" ? " — this week" : ""}</span>
                    ) : (
                      <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 inline-flex items-center gap-1"><Target className="w-3 h-3" /> {w.focus.label}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">{w.focus.detail}{w.festival ? ` — ${w.festival.angle}` : ""}</p>
                  {w.alsoFestivals.length > 0 && <p className="text-[10.5px] text-slate-400">Also in its window: {w.alsoFestivals.join(", ")}</p>}
                  {w.greetings.length > 0 && <p className="text-[10.5px] text-slate-400">Greetings only: {w.greetings.join(", ")}</p>}
                  {w.datesUnknown && <p className="text-[10.5px] text-slate-400">Festival dates for this week aren't loaded yet, so none are planned here.</p>}
                  {w.idea ? (
                    <div className="flex items-start justify-between gap-3 flex-wrap pt-0.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{w.idea.title} <span className="text-[10.5px] font-normal text-slate-400">· {FORMAT_LABEL[w.idea.format] ?? w.idea.format}</span></p>
                        <p className="text-xs text-slate-600 mt-0.5">{w.idea.idea}</p>
                      </div>
                      {href && (
                        <Link href={href} className="text-xs text-brand-500 hover:text-brand-400 inline-flex items-center gap-1 shrink-0">
                          Create this <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  ) : (
                    w.ideaNote && <p className="text-[11px] text-slate-400">{w.ideaNote}</p>
                  )}
                </li>
              );
            })}
          </ol>
          {(notes.removed ?? []).length > 0 && (
            <p className="text-[10.5px] text-slate-400">Ideas Hawlai didn't keep because they didn't check out: {notes.removed!.join("; ")}.</p>
          )}
        </>
      )}
    </div>
  );
}
