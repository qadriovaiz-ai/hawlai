// How fast the page actually is, measured rather than advised.
//
// G4 of docs/AUDIT-GROWTH-LOOP.md. Page speed was the one item in the
// founder's vision that nothing in this product measured — and the thing
// that stood where a measurement should be was `site_speed` in the SEO
// department, which writes "6 concrete site speed suggestions relevant
// to a small business site" **without having looked at the site**. That
// is the audit's central finding in one place: advice shaped like
// measurement.
//
// THE DISTINCTION THAT DECIDES EVERYTHING BELOW: PageSpeed Insights
// returns two different kinds of number, and treating them as one is how
// a tool like this starts lying.
//
//   FIELD DATA (CrUX) is what real visitors experienced, over 28 days.
//   It is the truth, and a new site with little traffic DOES NOT HAVE
//   IT — Google only reports it once there is enough.
//
//   LAB DATA (Lighthouse) is a simulation: one load, on Google's
//   hardware, on a throttled connection it chose. It is useful for
//   "what is heavy on this page" and it is NOT what your customers
//   experienced.
//
// So a reading says which one it came from, every time, and a lab number
// is never reported as what visitors saw. Where field data is missing
// this says so rather than quietly substituting the lab figure — the
// same rule as `could_not_check` in the output monitor and `null` in the
// sitemap reader: the absence is a fact, not a gap to fill.
//
// BEHIND A FLAG, DEFAULT OFF (the founder's decision, 7 November 2026),
// for the same reason A5 is: there is no real business on the platform,
// and a monthly run against test data spends quota and attention on
// nothing. MONTHLY WHEN ON — a page's weight does not change daily, and
// a number that moves only when somebody edits the site does not need
// watching every morning.
//
// The parsing below is pure. The one network call is in `fetchPsi`, kept
// separate so every rule about what a number means is testable without
// the internet.

import { recordSignal } from "@/lib/signals/signals";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

/** Off unless somebody turns it on, on purpose. */
export function pageSpeedPaused(): boolean {
  return process.env.PAGESPEED_ENABLED !== "true";
}

export const PAUSED_MESSAGE =
  "Page speed checks are off. Nothing is measured and nothing is claimed about how fast your pages are.";

/** Where a number came from. Never mixed, never guessed. */
export type Measured = "field" | "lab";

export type SpeedReading = {
  /** The page this is about. */
  url: string;
  /** Largest Contentful Paint, in milliseconds. */
  lcpMs: number | null;
  /** Cumulative Layout Shift, unitless. */
  cls: number | null;
  /** Interaction to Next Paint, in milliseconds. Field only — there is no lab INP. */
  inpMs: number | null;
  /** Lighthouse's 0-100 performance score. Lab only, by definition. */
  labScore: number | null;
  /** Which kind of number lcp/cls came from. */
  from: Measured | null;
  /** True when Google has no field data for this URL yet. */
  noFieldData: boolean;
};

/**
 * Google's own thresholds, not ours.
 *
 * Quoted rather than chosen: these are the numbers Google publishes for
 * "good", and a product inventing its own would be scoring the owner
 * against a standard nobody else uses.
 */
export const GOOD = { lcpMs: 2500, cls: 0.1, inpMs: 200 };
export const POOR = { lcpMs: 4000, cls: 0.25, inpMs: 500 };

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The reading, from whatever PageSpeed Insights returned.
 *
 * FIELD FIRST, AND SAID. When `loadingExperience` carries real metrics
 * they are used and `from` is "field". When it does not, the lab numbers
 * are used and `from` is "lab" — and `noFieldData` is true, so a caller
 * cannot report a simulation as what visitors experienced without
 * ignoring a flag that says otherwise.
 */
export function readPsi(payload: unknown): SpeedReading | null {
  const body = (payload && typeof payload === "object" ? payload : null) as Record<string, any> | null;
  if (!body) return null;
  const url = String(body.id ?? body.lighthouseResult?.finalUrl ?? "").trim();
  if (!url) return null;

  const field = body.loadingExperience?.metrics ?? null;
  const fieldLcp = num(field?.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
  const fieldCls = num(field?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
  const fieldInp = num(field?.INTERACTION_TO_NEXT_PAINT?.percentile);

  const audits = body.lighthouseResult?.audits ?? null;
  const labLcp = num(audits?.["largest-contentful-paint"]?.numericValue);
  const labCls = num(audits?.["cumulative-layout-shift"]?.numericValue);
  const labScore = (() => {
    const raw = num(body.lighthouseResult?.categories?.performance?.score);
    // Lighthouse reports 0-1. Scaled here, once, rather than at each
    // caller — and null stays null rather than becoming 0, which would
    // read as the worst possible score.
    return raw === null ? null : Math.round(raw * 100);
  })();

  const hasField = fieldLcp !== null || fieldCls !== null;

  return {
    url,
    // CLS IS A FRACTION IN THE FIELD AND A FRACTION IN THE LAB, but
    // CrUX reports it multiplied by 100. Divided here so the two are
    // comparable against one threshold — the kind of unit mismatch that
    // silently turns 0.05 into a failure.
    lcpMs: hasField ? fieldLcp : labLcp,
    cls: hasField ? (fieldCls === null ? null : fieldCls / 100) : labCls,
    // NO LAB INP EXISTS. A lab run cannot measure how long a real
    // interaction took, so this is null outside field data rather than
    // approximated from something else.
    inpMs: hasField ? fieldInp : null,
    labScore,
    from: hasField ? "field" : labLcp !== null || labCls !== null ? "lab" : null,
    noFieldData: !hasField,
  };
}

export type SpeedFinding = { code: string; says: string; from: Measured };

/**
 * What is worth telling the owner, and nothing else.
 *
 * ONLY WHAT IS POOR BY GOOGLE'S OWN THRESHOLD. A page that is merely
 * "needs improvement" produces nothing: a finding on every page of every
 * site is the same as a finding on none, which is the rule G1's
 * thresholds were chosen by too.
 *
 * AND EVERY SENTENCE SAYS WHERE THE NUMBER CAME FROM. "Your visitors
 * waited 5.1 seconds" and "a test load took 5.1 seconds" are different
 * claims, and only one of them is true when there is no field data.
 */
export function speedFindings(reading: SpeedReading | null): SpeedFinding[] {
  if (!reading || !reading.from) return [];
  const from = reading.from;
  const who = from === "field" ? "Visitors to this page" : "A single test load of this page";
  const out: SpeedFinding[] = [];

  if (reading.lcpMs !== null && reading.lcpMs > POOR.lcpMs) {
    out.push({
      code: "slow_largest_paint",
      says: `${who} waited ${(reading.lcpMs / 1000).toFixed(1)} seconds for the main content to appear. Google calls anything over ${POOR.lcpMs / 1000} seconds poor.`,
      from,
    });
  }
  if (reading.cls !== null && reading.cls > POOR.cls) {
    out.push({
      code: "page_jumps_while_loading",
      says: `Things move around on this page while it loads (${reading.cls.toFixed(2)}, and Google calls anything over ${POOR.cls} poor). It is usually an image or an advert with no size set.`,
      from,
    });
  }
  // FIELD ONLY, and the type makes that impossible to get wrong: there
  // is no lab INP to report.
  if (reading.inpMs !== null && reading.inpMs > POOR.inpMs) {
    out.push({
      code: "slow_to_respond",
      says: `When visitors tapped something on this page it took ${reading.inpMs} ms to respond. Google calls anything over ${POOR.inpMs} ms poor.`,
      from: "field",
    });
  }
  return out;
}

/** The one sentence a reading with no field data has to carry. */
export function noFieldDataNote(reading: SpeedReading | null): string | null {
  if (!reading?.noFieldData || !reading.from) return null;
  return "Google has no data from real visitors to this page yet, so these are numbers from a single test load on its hardware — useful for finding what is heavy, not a measurement of what your customers experienced.";
}

/**
 * Ask Google. The only network call in this file.
 *
 * NO KEY IS NOT AN ERROR, it is a lower quota: PageSpeed Insights
 * answers without one and rate-limits harder. So a missing key is said
 * and the call is still made, rather than the check silently never
 * running because an env var was never set.
 */
export async function fetchPsi(url: string, opts: { key?: string | null; fetcher?: typeof fetch } = {}) {
  const key = opts.key ?? process.env.PAGESPEED_API_KEY ?? null;
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "MOBILE");
  endpoint.searchParams.set("category", "PERFORMANCE");
  if (key) endpoint.searchParams.set("key", key);

  const doFetch = opts.fetcher ?? fetch;
  const res = await doFetch(endpoint.toString());
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: `PageSpeed Insights answered ${res.status}`, hadKey: Boolean(key) };
  }
  return { ok: true as const, payload: await res.json(), hadKey: Boolean(key) };
}

export type SpeedRun = {
  day: string;
  /** Null when the flag is off or it is not the first of the month. */
  url: string | null;
  findings: SpeedFinding[];
  noFieldData: boolean;
  skipped: string | null;
};

/**
 * The monthly check for one business.
 *
 * MONTHLY, ON THE FIRST, the same gate `runMonthlyReview` uses — a
 * page's weight does not change daily and a number that moves only when
 * somebody edits the site does not need watching every morning.
 *
 * ONE PAGE: the storefront's home. Measuring every page of every
 * business every month is a quota bill for very little; the home page is
 * where almost all of a small business's traffic lands, and what is
 * heavy there is usually heavy everywhere.
 */
export async function runPageSpeed(
  supabase: any,
  dealershipId: string,
  opts: { now?: Date; fetcher?: typeof fetch; siteBase?: string } = {}
): Promise<SpeedRun> {
  const day = indiaToday(opts.now ?? new Date());
  const empty: SpeedRun = { day, url: null, findings: [], noFieldData: false, skipped: null };

  if (pageSpeedPaused()) return { ...empty, skipped: "page speed checks are off" };
  if (!day.endsWith("-01")) return { ...empty, skipped: "not the first of the month" };

  const { data: website, error } = await supabase
    .from("websites")
    .select("slug, published")
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (error) return { ...empty, skipped: `could not read the site: ${error.message}` };
  // AN UNPUBLISHED SITE HAS NOTHING TO MEASURE, and asking Google about
  // a URL that 404s would record a bad number for a site that is simply
  // not up yet.
  if (!website?.slug || website.published !== true) return { ...empty, skipped: "no published site" };

  const base = (opts.siteBase ?? "").replace(/\/+$/, "");
  if (!base) return { ...empty, skipped: "no site address to measure" };
  const url = `${base}/site/${website.slug}`;

  const result = await fetchPsi(url, { fetcher: opts.fetcher });
  if (!result.ok) {
    console.error(`[page-speed] ${url}: ${result.error}`);
    return { ...empty, url, skipped: result.error };
  }

  const reading = readPsi(result.payload);
  const findings = speedFindings(reading);
  if (findings.length === 0) {
    return { day, url, findings: [], noFieldData: Boolean(reading?.noFieldData), skipped: null };
  }

  // OBSERVED, NOT COUNTED. The confidence taxonomy in lib/signals calls
  // `counted` "our own rows" — this is Google's measurement of a public
  // page, quoted, which is exactly what `observed` is for.
  for (const finding of findings) {
    await recordSignal(supabase, dealershipId, {
      source: "seo",
      topic: `page speed: ${finding.code}`,
      summary: finding.says,
      evidence: {
        url,
        from: finding.from,
        lcpMs: reading?.lcpMs ?? null,
        cls: reading?.cls ?? null,
        inpMs: reading?.inpMs ?? null,
        labScore: reading?.labScore ?? null,
        noFieldData: Boolean(reading?.noFieldData),
      },
      confidence: "observed",
      sourceUrl: url,
    });
  }

  return { day, url, findings, noFieldData: Boolean(reading?.noFieldData), skipped: null };
}
