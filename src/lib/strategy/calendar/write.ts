// An idea for each week of the 90-day plan — the one part a model writes
// (Advanced Strategy step 4). The weeks themselves are decided in code
// (weeks.ts); here every idea is checked before it's kept:
//   - its format must be one the Content Marketing page makes;
//   - it may name only the festival(s) whose window that week is in, or a
//     devotional or national day that falls in it — never another;
//   - the claims guard (lib/claims): no offer, price, number or promise
//     the business's facts don't back.
// A week whose idea fails keeps its code-chosen focus, and says why the
// idea was dropped.

import { callClaude, aiFailureMessage, type AiFailure } from "@/lib/ai/claude";
import { getModel } from "@/lib/models";
import { formatFactsForCopy, type BusinessFacts } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims } from "@/lib/claims/claimCheck";
import { festivalMentions } from "@/lib/expertise/seasonalCalendar";
import { CALENDAR_FORMATS, type CalendarFormat, type WeekPlan } from "./weeks";

/** Two attempts of at most 50s each, inside the route's time. */
export const WRITE_TIMEOUT_MS = 50_000;

const FORMAT_WORDS: Record<CalendarFormat, string> = {
  instagram_post: "Instagram post",
  carousel: "carousel",
  shorts_script: "Reel / Short",
  facebook_post: "Facebook post",
  linkedin_post: "LinkedIn post",
  email_newsletter: "email newsletter",
  blog_post: "blog post",
};

function prettyDate(s: string): string {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function weekLine(w: WeekPlan): string {
  const parts = [`Week ${w.week} (${prettyDate(w.starts)}–${prettyDate(w.ends)}): focus — ${w.focus.label} (${w.focus.detail}).`];
  if (w.festival) parts.push(`Festival: ${w.festival.name} — angle for this business: ${w.festival.angle}.`);
  if (w.alsoFestivals.length) parts.push(`Also in its window: ${w.alsoFestivals.join(", ")}.`);
  if (w.greetings.length) parts.push(`Greetings only (no selling): ${w.greetings.join(", ")}.`);
  if (!w.festival) parts.push("No festival this week — don't mention any festival other than the greetings listed.");
  return parts.join(" ");
}

/** Keeps each week's idea only if it passes every check; says why when it doesn't. */
export function verifyIdeas(weeks: WeekPlan[], raw: unknown, facts: BusinessFacts): { weeks: WeekPlan[]; removed: string[] } {
  const given = new Map<number, any>();
  for (const item of Array.isArray((raw as any)?.weeks) ? (raw as any).weeks : []) {
    const n = Number(item?.week);
    if (Number.isInteger(n) && !given.has(n)) given.set(n, item);
  }
  const removed: string[] = [];
  const out = weeks.map((w) => {
    const item = given.get(w.week);
    const drop = (why: string): WeekPlan => {
      removed.push(`week ${w.week}: ${why}`);
      return { ...w, idea: null, ideaNote: `No idea kept for this week — ${why}. The focus above still stands.` };
    };
    if (!item) return { ...w, idea: null, ideaNote: "No idea was written for this week. The focus above still stands." };
    const title = String(item.title ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    const idea = String(item.idea ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    const format = String(item.format ?? "") as CalendarFormat;
    if (!title || !idea) return drop("it came back empty");
    if (!CALENDAR_FORMATS.includes(format)) return drop(`"${format || "no format"}" isn't a format Hawlai makes`);
    const text = `${title}. ${idea}`;
    // Only the festivals this week is actually for.
    const allowed = new Set([...(w.festival ? [w.festival.name] : []), ...w.alsoFestivals, ...w.greetings]);
    const outside = festivalMentions(text).filter((could) => !could.some((n) => allowed.has(n)));
    if (outside.length) return drop(`it talks about ${outside[0][0]}, which isn't this week`);
    const unsupported = findUnsupportedClaims(text, facts);
    if (unsupported.length) return drop(`it said something your facts don't back (${unsupported[0]})`);
    return { ...w, idea: { title, format, idea }, ideaNote: null };
  });
  return { weeks: out, removed };
}

function parseJson(text: string): unknown {
  const t = text.replace(/```json|```/g, "");
  const at = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (at < 0 || end <= at) return null;
  try {
    return JSON.parse(t.slice(at, end + 1));
  } catch {
    return null;
  }
}

export async function writeWeekIdeas(
  weeks: WeekPlan[],
  facts: BusinessFacts,
  logContext: { supabase: any; dealershipId: string }
): Promise<{ ok: true; weeks: WeekPlan[]; removed: string[]; costInr: number } | { ok: false; failure: AiFailure; message: string }> {
  const r = await callClaude(
    {
      model: getModel("standard"),
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `You are planning the next 13 weeks of marketing for a small business owner. The weeks and what each one is for are already decided — write ONE concrete content idea per week that serves that week's focus.

${formatFactsForCopy(facts)}

THE WEEKS:
${weeks.map(weekLine).join("\n")}

RULES:
- One idea per week, for that week's focus. For a festival week, use the angle given for this business.
- Mention a festival only in a week that lists it. A week without a festival mentions none, except its greetings-only days.
- Use only what's in the facts: no discount, offer, price, number, award, result or promise that isn't there. No active offer means no offer.
- "format" is exactly one of: ${CALENDAR_FORMATS.map((f) => `${f} (${FORMAT_WORDS[f]})`).join(", ")}. Vary them across the weeks.
- "title" is under 12 words. "idea" is one or two sentences saying what the piece shows or says, specific to this business.

Return JSON only: {"weeks":[{"week":1,"title":"...","format":"instagram_post","idea":"..."}]}`,
      }],
    },
    { operation: "strategy_calendar", logContext, timeoutMs: WRITE_TIMEOUT_MS }
  );
  if (!r.ok) return { ok: false, failure: r.failure, message: aiFailureMessage(r.failure.kind) };
  const raw = parseJson(r.text);
  if (!raw) return { ok: false, failure: { kind: "bad_request", status: null, message: "unreadable plan", retryable: false }, message: aiFailureMessage("bad_request") };
  const checked = verifyIdeas(weeks, raw, facts);
  return { ok: true, ...checked, costInr: r.costInr };
}
