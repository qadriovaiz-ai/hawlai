// One positioning run, in two requests that each fit Vercel's 60 seconds
// (Advanced Strategy step 3, approved 2026-09-19):
//   collectPositioning — who the competitors are and what they say (web
//     search + ads the owner pasted in), saved as a row;
//   analysePositioning — sorting, counting and writing, saved onto it.
// Every read and write is filtered by the business (dealership_id).

import { businessDisplayName } from "@/lib/business/displayName";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { aiFailureNote, isPlatformOutage, type AiFailure, type AiFailureNote } from "@/lib/ai/claude";
import { collectClaims, discoverCompetitors, mergeCompetitors, ownerAdClaim, type Claim, type Competitor } from "./collect";
import { buildPositioning, classifyThemes, ownFactsFrom, writePositioning, type Positioning, type PositioningAdvice } from "./analysis";
import { themesFor } from "./themes";

export const MAX_COMPETITORS = 5;

type Ctx = { supabase: any; dealershipId: string };

export type CollectOutcome =
  | { ok: true; id: string; competitors: (Competitor & { claimCount: number })[]; nothingFound: string[]; couldntCheck: string[] }
  | { ok: false; error: string; aiFailure?: AiFailureNote };

/** The worst failure among several: an outage outranks being busy. */
function worst(failures: AiFailure[]): AiFailure | null {
  return failures.find((f) => isPlatformOutage(f.kind)) ?? failures[0] ?? null;
}

export async function collectPositioning(service: any, dealershipId: string): Promise<CollectOutcome> {
  const log: Ctx = { supabase: service, dealershipId };
  const [{ data: dealership }, { data: watches }, { data: dismissed }, { data: ownerAds }] = await Promise.all([
    service.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    service.from("competitor_watches").select("competitor_name").eq("dealership_id", dealershipId),
    service.from("competitor_dismissed").select("competitor_name").eq("dealership_id", dealershipId),
    service.from("competitor_owner_ads").select("competitor_name, ad_text").eq("dealership_id", dealershipId),
  ]);
  const businessName = businessDisplayName(dealership?.dealership_name);
  const category = dealership?.business_category || "business";
  const city = dealership?.city ?? null;

  const watchedNames: string[] = (watches ?? []).map((w: any) => String(w.competitor_name)).filter(Boolean);
  const adNames: string[] = [...new Set<string>((ownerAds ?? []).map((a: any) => String(a.competitor_name)).filter(Boolean))];
  const known = mergeCompetitors(watchedNames, adNames, [], MAX_COMPETITORS);
  const dismissedNames: string[] = (dismissed ?? []).map((d: any) => String(d.competitor_name));

  // Finding more and reading the known ones run side by side.
  const [discovery, ...knownClaims] = await Promise.all([
    discoverCompetitors({ businessName, category, city, exclude: [...known.map((k) => k.name), ...dismissedNames], want: MAX_COMPETITORS - known.length }, log),
    ...known.map((c) => collectClaims(c, { category, city }, log)),
  ]);
  const competitors = mergeCompetitors(watchedNames, adNames, discovery.found, MAX_COMPETITORS);
  const newOnes = competitors.filter((c) => !known.some((k) => k.name === c.name));
  const foundClaims = await Promise.all(newOnes.map((c) => collectClaims(c, { category, city }, log)));

  const results = [...known.map((c, i) => ({ c, r: knownClaims[i] })), ...newOnes.map((c, i) => ({ c, r: foundClaims[i] }))];
  const failures = [discovery.failure, ...results.map((x) => x.r.failure)].filter(Boolean) as AiFailure[];
  const outage = failures.find((f) => isPlatformOutage(f.kind));
  const claims: Claim[] = [...results.flatMap((x) => x.r.claims), ...(ownerAds ?? []).map(ownerAdClaim)];

  // Nothing to compare against, because the AI couldn't search: say why.
  if (outage || (claims.length === 0 && failures.length > 0)) {
    const f = outage ?? worst(failures)!;
    const note = aiFailureNote(f);
    return { ok: false, error: note.message, aiFailure: note };
  }
  if (competitors.length === 0) {
    return { ok: false, error: `Hawlai couldn't find competitors for a ${category} business${city ? ` in ${city}` : ""} with pages it could quote. Add one you know on the Competitor Intelligence page (New Product Alerts → Watch), or paste an ad you've seen, and run this again.` };
  }

  const rows = competitors.map((c) => ({ ...c, claimCount: claims.filter((cl) => cl.competitor === c.name).length }));
  const { data: saved, error } = await service
    .from("competitor_positioning")
    .insert({ dealership_id: dealershipId, status: "collected", competitors: rows, claims })
    .select("id")
    .single();
  if (error || !saved) return { ok: false, error: `Couldn't save what was found: ${error?.message ?? "no row"}` };

  return {
    ok: true,
    id: saved.id,
    competitors: rows,
    nothingFound: rows.filter((r) => r.claimCount === 0).map((r) => r.name),
    couldntCheck: results.filter((x) => x.r.failure).map((x) => x.c.name),
  };
}

export type AnalyseOutcome =
  | { ok: true; positioning: Positioning; advice: PositioningAdvice | null; adviceError?: string }
  | { ok: false; error: string; aiFailure?: AiFailureNote };

export async function analysePositioning(service: any, dealershipId: string, id: string): Promise<AnalyseOutcome> {
  const log: Ctx = { supabase: service, dealershipId };
  const { data: row } = await service.from("competitor_positioning").select("id, competitors, claims").eq("id", id).eq("dealership_id", dealershipId).maybeSingle();
  if (!row) return { ok: false, error: "That run wasn't found — start a new one." };

  const facts = await gatherBusinessFactsSafely(service, dealershipId);
  const { data: dealership } = await service.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
  const themes = themesFor(facts?.businessModels.models ?? null);
  const ownFacts = facts ? ownFactsFrom(facts) : [];
  const claims: Claim[] = Array.isArray(row.claims) ? row.claims : [];
  const competitorNames: string[] = (Array.isArray(row.competitors) ? row.competitors : []).map((c: any) => String(c.name));

  const sorted = await classifyThemes(claims, ownFacts, themes, log);
  if (!sorted.ok) {
    const note = aiFailureNote(sorted.failure);
    return { ok: false, error: note.message, aiFailure: note };
  }
  const positioning = buildPositioning(competitorNames, claims, sorted.claimThemes, ownFacts, sorted.factThemes, themes);

  // The counted table stands on its own; the written advice is extra.
  const written = await writePositioning(positioning, ownFacts, facts, businessDisplayName(dealership?.dealership_name), log);
  const advice = written.ok ? written.advice : null;
  const adviceError = written.ok ? undefined : aiFailureNote(written.failure).message;

  await service
    .from("competitor_positioning")
    .update({ status: "analysed", analysis: { positioning, advice, adviceError: adviceError ?? null, models: facts?.businessModels ?? null } })
    .eq("id", id)
    .eq("dealership_id", dealershipId);
  return { ok: true, positioning, advice, ...(adviceError ? { adviceError } : {}) };
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
