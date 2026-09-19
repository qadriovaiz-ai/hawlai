// What a comparison will cost, before it runs — and what it may reuse.
//
// WHY (2026-09-19): the first runs cost about ₹60 each, and three presses in
// ten minutes spent ~₹87 of logged tokens plus unlogged search fees. Before
// POSITIONING_ENABLED goes back on:
//   - competitors found in the last 14 days are reused — no discovery;
//   - a competitor's quotes from the last 14 days are reused — no search;
//   - one comparison that spends, per business per day — a run that
//     failed doesn't use the day up (2026-09-20: a run that stalled did,
//     and the retry had to wait a day), but three that spent and failed
//     do: after that, no more spending today;
//   - every run stops searching at a ₹40 ceiling and finishes with what
//     it has;
//   - the owner sees the estimate first, and confirms anything over ₹20.
// Every read is filtered by the business.

import { mergeCompetitors, type Claim, type Competitor } from "./collect";

export const MAX_COMPETITORS = 5;
export const REUSE_DAYS = 14;
export const RUN_CEILING_INR = 40;
export const CONFIRM_ABOVE_INR = 20;
/** Runs that spent, finished or not, one business may start in a day. */
export const MAX_ATTEMPTS_A_DAY = 3;

export const ALREADY_RAN_TODAY =
  "You've already run a full comparison today — one a day keeps the cost down. Run it again tomorrow; it will reuse what today's run found.";
export const TOO_MANY_TRIES_TODAY =
  "Three comparisons were started today and none finished, so Hawlai won't spend more on it today. Run it again tomorrow — it will reuse what they found.";

/**
 * Rupees per piece, rounded UP from the expected cost on the models now in
 * use (search on the fast model, sorting and writing on the standard one),
 * search fees included. The real spend is recorded on every run.
 */
export const EST_INR = { discovery: 6, competitor: 3, sortAndWrite: 6 } as const;

export type RunPlan = {
  /** Look for new competitors at step 0. */
  discover: boolean;
  /** Competitors found by a run in the last 14 days, used again. */
  reusedFound: Competitor[];
  /** A competitor's web quotes from the last 14 days, by name — no search needed. */
  cachedClaims: Record<string, Claim[]>;
  /** Web-search calls this run expects to make (discovery counts as one). */
  searchCalls: number;
  estimateInr: number;
  needsConfirm: boolean;
  /** Why a run can't start now, in words for the owner; null when it can. */
  blocked: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function indiaDate(at: string | number): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Whether a run spent credits — the kind limited to one a day. A run that
 * failed or stalled before spending anything doesn't use up the day.
 */
export function searchedTheWeb(run: any): boolean {
  return Number(run?.analysis?.spentInr ?? 0) > 0;
}

export async function planRun(service: any, dealershipId: string, now = Date.now()): Promise<RunPlan> {
  const since = new Date(now - REUSE_DAYS * DAY_MS).toISOString();
  const [{ data: watches }, { data: ownerAds }, { data: dismissed }, { data: recent }] = await Promise.all([
    service.from("competitor_watches").select("competitor_name").eq("dealership_id", dealershipId),
    service.from("competitor_owner_ads").select("competitor_name").eq("dealership_id", dealershipId),
    service.from("competitor_dismissed").select("competitor_name").eq("dealership_id", dealershipId),
    service
      .from("competitor_positioning")
      .select("id, status, competitors, claims, analysis, created_at")
      .eq("dealership_id", dealershipId)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  ]);
  const runs: any[] = (recent ?? []).filter((r: any) => Date.parse(r.created_at) >= now - REUSE_DAYS * DAY_MS);
  const gone = new Set((dismissed ?? []).map((d: any) => String(d.competitor_name).toLowerCase()));
  const watched: string[] = (watches ?? []).map((w: any) => String(w.competitor_name)).filter(Boolean);
  const adNames: string[] = [...new Set<string>((ownerAds ?? []).map((a: any) => String(a.competitor_name)).filter(Boolean))];
  const known = mergeCompetitors(watched, adNames, [], MAX_COMPETITORS);

  // The most recent run that got as far as naming competitors.
  const lastWithCompetitors = runs.find((r) => Array.isArray(r.competitors) && r.competitors.length > 0);
  const reusedFound: Competitor[] = (lastWithCompetitors?.competitors ?? [])
    .filter((c: any) => c?.source === "found" && !gone.has(String(c.name).toLowerCase()))
    .map((c: any) => ({ name: String(c.name), source: "found" as const, url: c.url ?? null }));
  const list = mergeCompetitors(watched, adNames, reusedFound, MAX_COMPETITORS);
  // Discovery only fills free places, and only if nobody looked recently.
  const discover = !lastWithCompetitors && known.length < MAX_COMPETITORS;

  // Newest quotes first: a competitor's web quotes from its latest run.
  const cachedClaims: Record<string, Claim[]> = {};
  for (const run of runs) {
    for (const c of list) {
      if (cachedClaims[c.name]) continue;
      const quotes = (Array.isArray(run.claims) ? run.claims : []).filter((q: Claim) => q?.origin === "web" && q.competitor === c.name);
      if (quotes.length) cachedClaims[c.name] = quotes;
    }
  }

  const freshCompetitors = list.filter((c) => !cachedClaims[c.name]).length + (discover ? MAX_COMPETITORS - list.length : 0);
  const searchCalls = (discover ? 1 : 0) + freshCompetitors;
  const estimateInr = (discover ? EST_INR.discovery : 0) + freshCompetitors * EST_INR.competitor + EST_INR.sortAndWrite;

  const today = indiaDate(now);
  const spentToday = runs.filter((r) => indiaDate(r.created_at) === today && searchedTheWeb(r));
  // Finished (or still going): the day's comparison is done. Failed: another try is allowed.
  const ranToday = spentToday.some((r) => r.status !== "failed");
  const blocked =
    searchCalls === 0 ? null : ranToday ? ALREADY_RAN_TODAY : spentToday.length >= MAX_ATTEMPTS_A_DAY ? TOO_MANY_TRIES_TODAY : null;

  return { discover, reusedFound, cachedClaims, searchCalls, estimateInr, needsConfirm: estimateInr > CONFIRM_ABOVE_INR, blocked };
}

/** What the page shows before the button is pressed. */
export function estimateView(plan: RunPlan) {
  const cached = Object.keys(plan.cachedClaims).length;
  return {
    estimateInr: plan.estimateInr,
    needsConfirm: plan.needsConfirm,
    blocked: plan.blocked,
    searchCalls: plan.searchCalls,
    reusing: { competitors: plan.reusedFound.length, withQuotes: cached },
  };
}
