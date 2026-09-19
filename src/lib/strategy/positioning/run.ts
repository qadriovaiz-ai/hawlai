// A positioning run, in the background, one step at a time.
//
// THE BUG (2026-09-19): "Compare with competitors" answered 504 every time.
// Collecting ran discovery and then a second wave of competitor web
// searches inside one request; each web-search call takes 15–40 seconds,
// so it ran past Vercel's 60-second limit.
//
// Now the button starts a run and gets an answer at once; the work is
// done in steps, each claimed, done and saved on its own, so a run that's
// interrupted carries on from its step (continue.ts: how the steps are
// driven — never by the server calling itself, which Vercel stops with 508).
//
//   step 0        find competitors (watched → pasted-ad → found, five at most)
//   steps 1..N    read one competitor's public pages each
//   step N+1      sort every quote and fact into themes
//   step N+2      count, and write the positioning → analysed
//
// A step is claimed with a conditional update, so two invocations can't
// run it twice. A step that dies with its invocation is run again at most
// twice, then the run is shown as stopped — never left spinning.
// Every read and write is filtered by id and, where it matters, business.

import { businessDisplayName } from "@/lib/business/displayName";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { aiFailureMessage, aiFailureNote, isPlatformOutage, type AiFailure } from "@/lib/ai/claude";
import { collectClaims, discoverCompetitors, mergeCompetitors, ownerAdClaim, type Claim, type Competitor } from "./collect";
import { buildPositioning, classifyThemes, ownFactsFrom, writePositioning, type OwnFact } from "./analysis";
import { themesFor } from "./themes";
import { planRun, RUN_CEILING_INR, type RunPlan } from "./budget";
import type { BusinessModel } from "@/lib/business/businessModel";

export { MAX_COMPETITORS } from "./budget";
import { MAX_COMPETITORS } from "./budget";
/** Each step finishes well inside 60s and hands over in seconds; longer than this without moving means it stopped. */
export const STALE_AFTER_MS = 150_000;

type Ctx = { supabase: any; dealershipId: string };
type CompetitorRow = Competitor & { claimCount: number };

export const STOPPED_MESSAGE = "The comparison stopped partway — run it again.";

/**
 * EMERGENCY STOP (2026-09-19): credits fell $3 → $1 in about ten minutes
 * after the background run went live. Until that's explained, no run
 * starts and no running run takes another step. Re-enabled only by setting
 * POSITIONING_ENABLED=true in the environment, on purpose.
 */
export const PAUSED_MESSAGE = "Competitor comparison is paused while Hawlai checks its cost. Nothing is running.";
export function positioningPaused(): boolean {
  return process.env.POSITIONING_ENABLED !== "true";
}

export type StartOutcome =
  | { ok: true; id: string; reused: boolean; plan?: RunPlan }
  | { ok: false; error: string; needsConfirm?: boolean; plan?: RunPlan };

/**
 * Starts a run for this business, or returns the one already moving (a
 * second press doesn't start a second set of searches). Checks the plan
 * first: one searching run a day, and the owner's yes for anything over
 * the confirm line.
 */
export async function startPositioning(service: any, dealershipId: string, opts: { confirm?: boolean; now?: number } = {}): Promise<StartOutcome> {
  if (positioningPaused()) return { ok: false, error: PAUSED_MESSAGE };
  const now = opts.now ?? Date.now();
  const { data: current } = await service
    .from("competitor_positioning")
    .select("id, status, updated_at")
    .eq("dealership_id", dealershipId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (current && now - Date.parse(current.updated_at) < STALE_AFTER_MS) return { ok: true, id: current.id, reused: true };

  const plan = await planRun(service, dealershipId, now);
  if (plan.blocked) return { ok: false, error: plan.blocked, plan };
  if (plan.needsConfirm && !opts.confirm) {
    return { ok: false, needsConfirm: true, plan, error: `This comparison will cost about ₹${plan.estimateInr} of AI credits. Confirm to start it.` };
  }

  const { data: row, error } = await service
    .from("competitor_positioning")
    .insert({
      dealership_id: dealershipId,
      status: "running",
      step: 0,
      step_running: false,
      competitors: [],
      claims: [],
      analysis: {
        plan: { discover: plan.discover, reusedFound: plan.reusedFound, searchCalls: plan.searchCalls, estimateInr: plan.estimateInr },
        cachedClaims: plan.cachedClaims,
        spentInr: 0,
      },
      updated_at: new Date(now).toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: `Couldn't start the comparison: ${error?.message ?? "no row"}` };
  return { ok: true, id: row.id, reused: false, plan };
}

async function fail(service: any, id: string, error: string) {
  await service.from("competitor_positioning").update({ status: "failed", step_running: false, error, updated_at: new Date().toISOString() }).eq("id", id);
}

async function save(service: any, id: string, fields: Record<string, unknown>) {
  await service.from("competitor_positioning").update({ ...fields, step_running: false, updated_at: new Date().toISOString() }).eq("id", id);
}

/** The approved words for an AI failure — an outage stops the run; being busy is said too. */
function failureWords(f: AiFailure): string {
  return aiFailureNote(f).message;
}

/**
 * Claims the run's next step, does it and saves it. `more` says whether
 * another step is waiting (the caller hands over to a fresh invocation).
 */
export async function advancePositioning(service: any, id: string): Promise<{ more: boolean }> {
  if (positioningPaused()) {
    // Stops a run already moving: no further step, no further model call.
    await service.from("competitor_positioning").update({ status: "failed", error: PAUSED_MESSAGE, step_running: false, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "running");
    return { more: false };
  }
  // The claim: only a running run whose step nobody else is doing.
  const { data: run } = await service
    .from("competitor_positioning")
    .update({ step_running: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "running")
    .eq("step_running", false)
    .select("id, dealership_id, step, competitors, claims, analysis")
    .maybeSingle();
  if (!run) return { more: false };

  const dealershipId: string = run.dealership_id;
  const log: Ctx = { supabase: service, dealershipId };
  const competitors: CompetitorRow[] = Array.isArray(run.competitors) ? run.competitors : [];
  const claims: Claim[] = Array.isArray(run.claims) ? run.claims : [];
  const analysis: any = run.analysis ?? {};
  const notes = { couldntCheck: [] as string[], skippedAtCeiling: [] as string[], ...(analysis.notes ?? {}) };
  // What this run has spent so far, in rupees — tokens and searches.
  const spent = (): number => Number(analysis.spentInr ?? 0);
  const plan = analysis.plan ?? { discover: true, reusedFound: [], searchCalls: 1, estimateInr: 0 };
  const cachedClaims: Record<string, Claim[]> = analysis.cachedClaims ?? {};
  const step: number = run.step ?? 0;
  const n = competitors.length;

  try {
    const { data: dealership } = await service.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single();
    const category = dealership?.business_category || "business";
    const city = dealership?.city ?? null;

    // ---- step 0: who to compare with -----------------------------------
    if (step === 0) {
      const [{ data: watches }, { data: dismissed }, { data: ownerAds }] = await Promise.all([
        service.from("competitor_watches").select("competitor_name").eq("dealership_id", dealershipId),
        service.from("competitor_dismissed").select("competitor_name").eq("dealership_id", dealershipId),
        service.from("competitor_owner_ads").select("competitor_name, ad_text").eq("dealership_id", dealershipId),
      ]);
      const watched: string[] = (watches ?? []).map((w: any) => String(w.competitor_name)).filter(Boolean);
      const adNames: string[] = [...new Set<string>((ownerAds ?? []).map((a: any) => String(a.competitor_name)).filter(Boolean))];
      const reusedFound: Competitor[] = Array.isArray(plan.reusedFound) ? plan.reusedFound : [];
      const known = mergeCompetitors(watched, adNames, reusedFound, MAX_COMPETITORS);
      // Only when nobody looked in the last 14 days (budget.ts).
      const discovery = plan.discover
        ? await discoverCompetitors(
            { businessName: businessDisplayName(dealership?.dealership_name), category, city, exclude: [...known.map((k) => k.name), ...(dismissed ?? []).map((d: any) => String(d.competitor_name))], want: MAX_COMPETITORS - known.length },
            log
          )
        : { found: [] as Competitor[], costInr: 0, failure: undefined };
      if (discovery.failure && isPlatformOutage(discovery.failure.kind)) {
        await fail(service, id, failureWords(discovery.failure));
        return { more: false };
      }
      const list = mergeCompetitors(watched, adNames, [...reusedFound, ...discovery.found], MAX_COMPETITORS);
      if (list.length === 0) {
        await fail(
          service,
          id,
          discovery.failure
            ? failureWords(discovery.failure)
            : `Hawlai couldn't find competitors for a ${category} business${city ? ` in ${city}` : ""} with pages it could quote. Add one you know on the Competitor Intelligence page (New Product Alerts → Watch), or paste an ad you've seen, and run this again.`
        );
        return { more: false };
      }
      // Ads the owner pasted are their own record — in from the start. So are
      // quotes read in the last 14 days: those competitors aren't searched.
      const adClaims = (ownerAds ?? []).map(ownerAdClaim);
      const reused = list.filter((c) => cachedClaims[c.name]?.length).map((c) => c.name);
      const startClaims: Claim[] = [...adClaims, ...reused.flatMap((name) => cachedClaims[name])];
      const rows: CompetitorRow[] = list.map((c) => ({ ...c, claimCount: startClaims.filter((a: Claim) => a.competitor === c.name).length }));
      await save(service, id, {
        step: 1,
        competitors: rows,
        claims: startClaims,
        analysis: { plan, reused, resumes: analysis.resumes ?? 0, spentInr: spent() + discovery.costInr, notes: { ...notes, couldntCheck: discovery.failure ? ["finding more competitors"] : [] } },
      });
      return { more: true };
    }

    // ---- steps 1..N: one competitor's own pages -------------------------
    if (step >= 1 && step <= n) {
      const c = competitors[step - 1];
      const isLast = step === n;
      const reused: string[] = Array.isArray(analysis.reused) ? analysis.reused : [];
      // Quotes from the last 14 days, or the ceiling reached: no search.
      const skip = reused.includes(c.name) ? "reused" : spent() >= RUN_CEILING_INR ? "ceiling" : null;
      if (skip) {
        if (skip === "ceiling") notes.skippedAtCeiling = [...notes.skippedAtCeiling, c.name];
        if (isLast && claims.length === 0) {
          await fail(service, id, `The comparison reached its ₹${RUN_CEILING_INR} limit before finding anything it could quote. Paste an ad you've seen and run it again tomorrow.`);
          return { more: false };
        }
        await save(service, id, { step: step + 1, analysis: { ...analysis, notes } });
        return { more: true };
      }
      const r = await collectClaims(c, { category, city }, log);
      if (r.failure && isPlatformOutage(r.failure.kind)) {
        await fail(service, id, failureWords(r.failure));
        return { more: false };
      }
      if (r.failure) notes.couldntCheck = [...notes.couldntCheck, c.name];
      const all = [...claims, ...r.claims];
      const rows = competitors.map((x, i) => (i === step - 1 ? { ...x, claimCount: x.claimCount + r.claims.length } : x));
      if (isLast && all.length === 0) {
        await fail(service, id, r.failure ? failureWords(r.failure) : "Hawlai couldn't find anything these competitors say about themselves that it could quote. Paste an ad you've seen, or watch a competitor with a website, and run this again.");
        return { more: false };
      }
      await save(service, id, { step: step + 1, competitors: rows, claims: all, analysis: { ...analysis, notes, spentInr: spent() + r.costInr } });
      return { more: true };
    }

    // ---- step N+1: sort into themes ---------------------------------------
    if (step === n + 1) {
      const facts = await gatherBusinessFactsSafely(service, dealershipId);
      const models: BusinessModel[] | null = facts?.businessModels.models ?? null;
      const ownFacts: OwnFact[] = facts ? ownFactsFrom(facts) : [];
      const sorted = await classifyThemes(claims, ownFacts, themesFor(models), log);
      if (!sorted.ok) {
        await fail(service, id, failureWords(sorted.failure));
        return { more: false };
      }
      await save(service, id, { step: step + 1, analysis: { ...analysis, notes, models, ownFacts, claimThemes: sorted.claimThemes, factThemes: sorted.factThemes, spentInr: spent() + sorted.costInr } });
      return { more: true };
    }

    // ---- step N+2: count, and write -----------------------------------------
    const ownFacts: OwnFact[] = analysis.ownFacts ?? [];
    const positioning = buildPositioning(competitors.map((c) => c.name), claims, analysis.claimThemes ?? [], ownFacts, analysis.factThemes ?? [], themesFor(analysis.models ?? null));
    const facts = await gatherBusinessFactsSafely(service, dealershipId);
    // The counted table stands on its own; the written advice is extra.
    const written = await writePositioning(positioning, ownFacts, facts, businessDisplayName(dealership?.dealership_name), log);
    await save(service, id, {
      status: "analysed",
      step: step + 1,
      error: null,
      analysis: {
        notes,
        plan,
        // How often it had to be picked up again (continue.ts) — kept, so the limit holds and it can be looked at.
        resumes: analysis.resumes ?? 0,
        // What this comparison really cost — shown to the owner, and the check on the estimate.
        spentInr: Math.round((spent() + (written.ok ? written.costInr : 0)) * 100) / 100,
        models: analysis.models ?? null,
        positioning,
        advice: written.ok ? written.advice : null,
        adviceError: written.ok ? null : aiFailureNote(written.failure).message,
      },
    });
    return { more: false };
  } catch (err: any) {
    console.error(`[positioning] run ${id} step ${step} failed:`, err?.message);
    await fail(service, id, aiFailureMessage("bad_request"));
    return { more: false };
  }
}

export type RunView = {
  id: string;
  state: "running" | "failed" | "analysed";
  /** What's happening now, in words — for the page while it waits. */
  label: string | null;
  error: string | null;
  createdAt: string;
};

/** Where a run stands, in words. A running row that stopped moving is a stopped run. */
export function describeRun(row: any, now = Date.now()): RunView {
  const competitors: CompetitorRow[] = Array.isArray(row?.competitors) ? row.competitors : [];
  const n = competitors.length;
  const step: number = row?.step ?? 0;
  const base = { id: row.id, createdAt: row.created_at };
  if (row.status === "analysed") return { ...base, state: "analysed", label: null, error: null };
  if (row.status === "failed") return { ...base, state: "failed", label: null, error: row.error ?? STOPPED_MESSAGE };
  if (row.status === "running" && now - Date.parse(row.updated_at) > STALE_AFTER_MS) return { ...base, state: "failed", label: null, error: STOPPED_MESSAGE };
  const label =
    step === 0
      ? "Finding your competitors..."
      : step <= n
        ? `Reading what ${competitors[step - 1].name} says about itself (${step} of ${n})...`
        : step === n + 1
          ? "Sorting what they say, theme by theme..."
          : "Writing your positioning...";
  return { ...base, state: "running", label, error: null };
}

/** This business's newest run of any state — what the page is waiting on. */
export async function newestRun(supabase: any, dealershipId: string) {
  const { data } = await supabase
    .from("competitor_positioning")
    .select("id, dealership_id, status, step, step_running, competitors, analysis, error, created_at, updated_at")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** The latest finished run, for the page, the chat and deep strategy. */
export async function latestPositioning(supabase: any, dealershipId: string) {
  const { data } = await supabase
    .from("competitor_positioning")
    .select("id, status, competitors, claims, analysis, created_at")
    .eq("dealership_id", dealershipId)
    .eq("status", "analysed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** What competitors say, as a line of context for other prompts (deep strategy). */
export function competitorContextFrom(run: any): string | null {
  const rows: any[] = run?.analysis?.positioning?.rows ?? [];
  const total = run?.analysis?.positioning?.competitorCount ?? 0;
  const said = rows.filter((r) => r.claimedBy?.length).map((r) => `${r.label}: ${r.claimedBy.length} of ${total} (${r.claimedBy.join(", ")})`);
  return said.length ? `From competitors' own public pages, counted by Hawlai — ${said.join("; ")}.` : null;
}
