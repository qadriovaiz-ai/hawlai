// Collecting what competitors say about themselves in public (Advanced
// Strategy step 3, approved 2026-09-19).
//
// WHY THIS SHAPE: Meta's Ad Library API returns only political/issue ads
// outside the EU — the live check answered "Application does not have
// permission for this action". So competitor messaging is read from their
// public pages by web search, and from ads the owner pastes in.
//
// THE RULE: a competitor claim is never the model's paraphrase. Web search
// returns, with every citation, up to 150 characters quoted verbatim from
// the page (`cited_text`) and its link. Only those quotes are kept — and
// only from pages that are about that competitor. A competitor the model
// names without a cited page that mentions it is dropped. Nothing here can
// invent a competitor or put words in one's mouth.

import { callClaude, type AiFailure, type AiFailureNote, type ClaudeResult } from "@/lib/ai/claude";
import { getModel } from "@/lib/models";
import { recordResearchCredits } from "@/lib/usage/researchCredits";

export type Citation = { url: string; title: string; quote: string };

export type CompetitorSource = "watched" | "owner_ad" | "found";
export type Competitor = { name: string; source: CompetitorSource; url?: string | null };

export type Claim = {
  competitor: string;
  quote: string;
  /** null for an ad the owner pasted in. */
  url: string | null;
  title: string | null;
  origin: "web" | "owner";
};

type LogContext = { supabase: any; dealershipId: string };

// COST (2026-09-19): a run as first built cost about ₹60 — discovery alone
// read ~39,000 tokens of search results per call on the standard model.
// Searching and quoting is simple work: it runs on the fast model, with
// fewer searches. The quote rule doesn't depend on the model — only a real
// citation's words are kept — so a weaker model finds fewer quotes, never
// invented ones. Sorting and writing stay on the standard model.
export const SEARCH_MODEL = getModel("fast");
export const DISCOVERY_SEARCHES = 2;
export const CLAIM_SEARCHES = 1;

// TIME (2026-09-20): every step runs inside one serverless invocation. A
// search call with no limit could outlive it — the invocation is killed,
// the step is left claimed with nothing recorded, and the run stalls
// ("stopped partway"). So a search gets one attempt of at most 45s (a
// retry would double the time for a ₹3 search), and the standard-model
// fallback another 45s: a step is always over well inside its time.
export const SEARCH_TIMEOUT_MS = 45_000;

/**
 * A web-search call on the fast model. If the API refuses that model for
 * the tool (a bad request, not an outage), the same call runs once on the
 * standard model — the run never fails because of the cheaper choice.
 */
async function searchCall(body: Record<string, any>, operation: string, logContext?: LogContext): Promise<ClaudeResult> {
  const opts = { operation, logContext: logContext ?? null, attempts: 1, timeoutMs: SEARCH_TIMEOUT_MS };
  const first = await callClaude({ ...body, model: SEARCH_MODEL }, opts);
  if (first.ok || first.failure.kind !== "bad_request") return first;
  console.warn(`[positioning] ${operation}: fast model refused (${first.failure.message.slice(0, 120)}) — using the standard model`);
  return callClaude({ ...body, model: getModel("standard") }, opts);
}

/** The site to keep a competitor's search on, when we know it — its own pages, not articles about it. */
export function searchDomainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Every web-search citation in a reply, once each. */
export function citationsOf(data: any): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const block of data?.content ?? []) {
    if (block?.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const c of block.citations) {
      if (c?.type !== "web_search_result_location") continue;
      const quote = String(c.cited_text ?? "").replace(/\s+/g, " ").trim();
      const url = String(c.url ?? "").trim();
      if (!quote || !url) continue;
      const key = `${url}|${quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url, title: String(c.title ?? "").trim(), quote });
    }
  }
  return out;
}

const GENERIC = new Set(["the", "and", "by", "co", "of", "store", "shop", "official", "india", "indian", "pvt", "ltd", "private", "limited", "online", "company", "brand", "brands", "studio", "house", "world", "co.", "llp", "inc"]);

function compact(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

/**
 * Whether `text` is about the business called `name`: every distinctive
 * word of the name appears in it (spaces and punctuation ignored, so
 * "Candle by Qaaf" matches candlebyqaaf.com). Words of the category itself
 * ("candles" for a candle business) aren't distinctive.
 */
export function mentions(name: string, text: string, categoryWords: string[] = []): boolean {
  const hay = compact(text);
  if (!hay) return false;
  const skip = new Set([...GENERIC, ...categoryWords.map((w) => w.toLowerCase())]);
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !skip.has(w) && !skip.has(w.replace(/s$/, "")));
  if (words.length === 0) {
    const whole = compact(name);
    return whole.length >= 4 && hay.includes(whole);
  }
  return words.every((w) => hay.includes(w));
}

function categoryWordsOf(category: string): string[] {
  const words = category.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
  return [...words, ...words.map((w) => (w.endsWith("s") ? w.slice(0, -1) : `${w}s`))];
}

/** Research Credits at what the call really cost — the model that ran, and its searches. */
async function chargeResearch(logContext: LogContext | undefined, costInr: number) {
  if (logContext && costInr > 0) await recordResearchCredits(logContext.dealershipId, costInr);
}

/** The JSON object holding `key`, after any cited prose that precedes it. */
function jsonIn(data: any, key: string): any | null {
  const text = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").replace(/```json|```/g, "");
  const at = text.search(new RegExp(`\\{\\s*"${key}"`));
  const end = text.lastIndexOf("}");
  if (at < 0 || end <= at) return null;
  try {
    return JSON.parse(text.slice(at, end + 1));
  } catch {
    return null;
  }
}

/**
 * Businesses competing for the same customers, found by web search — each
 * kept only if a cited page mentions it by name. Never the business itself,
 * never one the owner removed, never one already on the list.
 */
export async function discoverCompetitors(
  input: { businessName: string; category: string; city: string | null; exclude: string[]; want: number },
  logContext?: LogContext
): Promise<{ found: Competitor[]; failure?: AiFailure; costInr: number }> {
  if (input.want <= 0) return { found: [], costInr: 0 };
  const where = input.city ? `in or near ${input.city}, India, or selling online across India` : "in India, including online sellers";
  const r = await searchCall(
    {
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: DISCOVERY_SEARCHES }],
      messages: [{
        role: "user",
        content: `Find up to ${input.want + 2} real businesses that compete with "${input.businessName}", a ${input.category} business, for the same customers — ${where}. Prefer small and mid-sized sellers a customer would realistically compare it with, not giant marketplaces themselves.
Do not include: ${[input.businessName, ...input.exclude].map((n) => `"${n}"`).join(", ")}.
Only name a business you found on a page you can cite. For each one, first write one sentence naming it, citing the page you found it on. Then end with this JSON and nothing after it: {"competitors":[{"name":"their business name as they write it","url":"their own site or profile, if you found one"}]}`,
      }],
    },
    "positioning_discovery",
    logContext
  );
  if (!r.ok) return { found: [], failure: r.failure, costInr: 0 };
  await chargeResearch(logContext, r.costInr);

  const cites = citationsOf(r.data);
  const parsed = jsonIn(r.data, "competitors");
  const cat = categoryWordsOf(input.category);
  const taken = [input.businessName, ...input.exclude].map(compact);
  const found: Competitor[] = [];
  for (const c of Array.isArray(parsed?.competitors) ? parsed.competitors : []) {
    const name = String(c?.name ?? "").trim().slice(0, 80);
    if (name.length < 2) continue;
    if (taken.includes(compact(name)) || found.some((f) => compact(f.name) === compact(name))) continue;
    // It exists only if a page the search actually returned names it.
    if (!cites.some((x) => mentions(name, `${x.title} ${x.url} ${x.quote}`, cat))) continue;
    const url = typeof c?.url === "string" && /^https?:\/\//.test(c.url) ? c.url.slice(0, 300) : null;
    found.push({ name, source: "found", url });
    if (found.length >= input.want) break;
  }
  return { found, costInr: r.costInr };
}

/**
 * What one competitor says about itself in public — its site, social bios,
 * listings — as verbatim quotes with links, and only from pages about it.
 */
export async function collectClaims(
  competitor: Competitor,
  context: { category: string; city: string | null },
  logContext?: LogContext
): Promise<{ claims: Claim[]; failure?: AiFailure; costInr: number }> {
  const domain = searchDomainOf(competitor.url);
  const r = await searchCall(
    {
      max_tokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: CLAIM_SEARCHES, ...(domain ? { allowed_domains: [domain] } : {}) }],
      messages: [{
        role: "user",
        content: `Search for how "${competitor.name}" (a ${context.category} business${context.city ? ` near ${context.city}` : ""}, India)${competitor.url ? ` — ${competitor.url} —` : ""} describes itself to customers: its website, Instagram or Facebook bio, Google listing, and marketplace listings.
Quote what it says in its OWN words about its products or services, prices, quality or materials, delivery, offers, gifting, guarantees or experience — citing each quote. Skip reviews written by customers and articles written about it by others. If you can't find it, say so.`,
      }],
    },
    "positioning_claims",
    logContext
  );
  if (!r.ok) return { claims: [], failure: r.failure, costInr: 0 };
  await chargeResearch(logContext, r.costInr);

  const cat = categoryWordsOf(context.category);
  const claims: Claim[] = citationsOf(r.data)
    // A quote from a page that isn't about this competitor isn't its claim.
    .filter((c) => mentions(competitor.name, `${c.title} ${c.url} ${c.quote}`, cat) || (competitor.url ? sameSite(c.url, competitor.url) : false))
    .slice(0, 8)
    .map((c) => ({ competitor: competitor.name, quote: c.quote, url: c.url, title: c.title || null, origin: "web" as const }));
  return { claims, costInr: r.costInr };
}

function sameSite(a: string, b: string): boolean {
  try {
    const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
    return host(a) === host(b);
  } catch {
    return false;
  }
}

/** An ad the owner pasted in: their own record of what a competitor ran. */
export function ownerAdClaim(ad: { competitor_name: string; ad_text: string }): Claim {
  return { competitor: ad.competitor_name, quote: String(ad.ad_text).replace(/\s+/g, " ").trim().slice(0, 500), url: null, title: "Ad you saw", origin: "owner" };
}

/**
 * The run's competitor list: the ones the owner watches first, then ones
 * they pasted an ad for, then found ones to fill up to `limit`.
 */
export function mergeCompetitors(watched: string[], ownerAdNames: string[], found: Competitor[], limit = 5): Competitor[] {
  const out: Competitor[] = [];
  const add = (c: Competitor) => {
    if (out.length >= limit) return;
    if (out.some((o) => compact(o.name) === compact(c.name))) return;
    out.push(c);
  };
  for (const name of watched) add({ name, source: "watched" });
  for (const name of ownerAdNames) add({ name, source: "owner_ad" });
  for (const c of found) add(c);
  return out;
}

export type CollectResult = {
  competitors: Competitor[];
  claims: Claim[];
  /** Competitors the search couldn't find anything for — said, not hidden. */
  nothingFound: string[];
  aiFailure?: AiFailureNote;
};
