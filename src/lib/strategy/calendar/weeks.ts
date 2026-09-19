// The next 90 days, week by week (Advanced Strategy step 4, approved
// 2026-09-20). CODE decides every week: its dates, the festival whose
// campaign window it falls in, and — for the rest — what to work on,
// from the business's own diagnosis and its positioning against real
// competitors. The model only writes an idea for each week afterwards
// (write.ts), and every idea is checked.
//
//   festival weeks  a celebration's campaign window (launchFrom → the
//                   day) overlaps the week; its angle is the one for how
//                   this business makes money (seasonalCalendar angleFor).
//                   Devotional and national days are greetings only.
//   other weeks     in turn: the weakest funnel step, open ground the
//                   business has facts for, crowded ground it can say
//                   sharper, customers going quiet — every number in a
//                   week's detail is counted here, never written by a model.
//   past the dates  movable festival dates are loaded to a known date;
//   we know         weeks after it say so instead of pretending.

import { seasonEvents, angleFor, type AngleContext, type SeasonalEventRow, type SeasonEvent } from "@/lib/expertise/seasonalCalendar";
import type { Diagnosis } from "@/lib/strategy/diagnosis";
import type { Positioning } from "@/lib/strategy/positioning/analysis";

export const WEEKS = 13;
/** Plans one business may make in a day — each is a model call. */
export const PLANS_A_DAY = 3;

/** The content formats a week's idea may be — each one a type on the Content Marketing page. */
export const CALENDAR_FORMATS = ["instagram_post", "carousel", "shorts_script", "facebook_post", "linkedin_post", "email_newsletter", "blog_post"] as const;
export type CalendarFormat = (typeof CALENDAR_FORMATS)[number];

export type FocusKind = "festival" | "weakest_step" | "open_ground" | "sharper" | "win_back" | "story";
export type Focus = { kind: FocusKind; label: string; detail: string };

export type WeekIdea = { title: string; format: CalendarFormat; idea: string };

export type WeekPlan = {
  week: number;
  /** YYYY-MM-DD, Monday. */
  starts: string;
  /** YYYY-MM-DD, Sunday. */
  ends: string;
  focus: Focus;
  festival: { name: string; date: string; phase: "launch" | "day"; angle: string } | null;
  /** Other celebrations whose window also touches this week. */
  alsoFestivals: string[];
  /** Devotional and national days this week — greetings only. */
  greetings: string[];
  /** Past the last loaded festival date: movable festivals here aren't known yet. */
  datesUnknown: boolean;
  idea: WeekIdea | null;
  /** Why there's no idea, when there isn't one. */
  ideaNote: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(parse(s).getTime() + n * DAY));

/** The Monday on or after today — a quarter starts on a whole week. */
export function firstMonday(today: string): string {
  const dow = parse(today).getUTCDay(); // 0 Sunday … 6 Saturday
  return addDays(today, (8 - dow) % 7);
}

function prettyDate(s: string): string {
  return parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The focuses for weeks without a festival, from what's been counted — in turn. */
export function focusQueue(diagnosis: Diagnosis | null, positioning: Positioning | null): Focus[] {
  const queue: Focus[] = [];
  for (const f of diagnosis?.funnels ?? []) {
    if (!f.weakest) continue;
    queue.push({
      kind: "weakest_step",
      label: `${f.weakest.from} → ${f.weakest.to}`,
      detail: `your weakest step: ${f.weakest.rate}% of ${f.weakest.entered} got from ${f.weakest.from.toLowerCase()} to ${f.weakest.to.toLowerCase()} in the last 90 days`,
    });
  }
  const rows = positioning?.rows ?? [];
  const of = (n: number) => `${n} of ${positioning!.competitorCount}`;
  for (const key of positioning?.whiteSpace ?? []) {
    const r = rows.find((x) => x.key === key);
    if (r) queue.push({ kind: "open_ground", label: r.label, detail: `open ground: ${of(r.claimedBy.length)} competitors talk about it, and you have something real to say` });
  }
  for (const key of positioning?.crowdedYouHave ?? []) {
    const r = rows.find((x) => x.key === key);
    if (r) queue.push({ kind: "sharper", label: r.label, detail: `crowded: ${of(r.claimedBy.length)} competitors say it — say it with your own specifics` });
  }
  if (diagnosis && diagnosis.atRisk.count > 0) {
    queue.push({ kind: "win_back", label: "Customers going quiet", detail: `${diagnosis.atRisk.count} of ${diagnosis.atRisk.total} customers haven't been back in a while` });
  }
  if (queue.length === 0) queue.push({ kind: "story", label: "What makes you different", detail: "from your own story — the details no competitor can copy" });
  return queue;
}

/**
 * How much a festival should own a week: its size — campaign lead plus the
 * days it stays in season — in full on the week of its day, at 80% in a
 * launch week.
 */
export function weight(e: SeasonEvent, starts: string, ends: string): number {
  const size = (parse(e.date).getTime() - parse(e.launchFrom).getTime()) / DAY + (parse(e.seasonEnds).getTime() - parse(e.date).getTime()) / DAY;
  return e.date >= starts && e.date <= ends ? size : size * 0.8;
}

export function buildWeeks(input: {
  today: string;
  festivals: SeasonalEventRow[];
  angle: AngleContext;
  diagnosis: Diagnosis | null;
  positioning: Positioning | null;
}): WeekPlan[] {
  const start = firstMonday(input.today);
  const events = seasonEvents(input.festivals, input.today);
  const movable = input.festivals.map((r) => String(r.event_date ?? "").slice(0, 10)).filter(Boolean).sort();
  const knownUntil = movable.length ? movable[movable.length - 1] : null;
  const queue = focusQueue(input.diagnosis, input.positioning);
  let next = 0;

  const weeks: WeekPlan[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const starts = addDays(start, i * 7);
    const ends = addDays(starts, 6);
    // Celebrations whose campaign window (launchFrom → the day) touches this week.
    const open = events.filter((e) => e.kind === "celebration" && e.launchFrom <= ends && e.date >= starts);
    // The bigger occasion wins the week (weight): Diwali over Dhanteras in
    // the same week, Diwali's run-up over Karwa Chauth's day — but Dussehra
    // on its day over Diwali's early run-up. Ties: the sooner one.
    const primary: SeasonEvent | undefined = [...open].sort((a, b) => weight(b, starts, ends) - weight(a, starts, ends) || a.date.localeCompare(b.date))[0];
    const greetings = events.filter((e) => e.kind !== "celebration" && e.date >= starts && e.date <= ends).map((e) => e.name);
    const datesUnknown = knownUntil === null || starts > knownUntil;

    let focus: Focus;
    let festival: WeekPlan["festival"] = null;
    if (primary) {
      const phase = primary.date >= starts && primary.date <= ends ? "day" : "launch";
      festival = { name: primary.name, date: primary.date, phase, angle: angleFor(primary, input.angle) };
      focus = {
        kind: "festival",
        label: primary.name,
        detail: phase === "day" ? `${primary.name} is on ${prettyDate(primary.date)} this week` : `${primary.name} is on ${prettyDate(primary.date)} — its campaign window is open`,
      };
    } else {
      focus = queue[next++ % queue.length];
    }
    weeks.push({
      week: i + 1,
      starts,
      ends,
      focus,
      festival,
      alsoFestivals: primary ? [...new Set(open.filter((e) => e.name !== primary.name).map((e) => e.name))] : [],
      greetings,
      datesUnknown,
      idea: null,
      ideaNote: null,
    });
  }
  return weeks;
}

/** What the business looked like when the quarter was planned — what Step 5 measures the quarter against. */
export function baselineFrom(diagnosis: Diagnosis | null) {
  if (!diagnosis) return null;
  return {
    window: diagnosis.window,
    funnels: diagnosis.funnels.map((f) => ({ name: f.name, steps: f.steps.map((s) => ({ key: s.key, label: s.label, count: s.count })) })),
    sources: diagnosis.sources.map((s) => ({ source: s.source, leads: s.leads, won: s.won })),
    atRisk: { count: diagnosis.atRisk.count, total: diagnosis.atRisk.total },
  };
}
