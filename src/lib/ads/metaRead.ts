// Reading from Meta's Graph API — and repeating a write that is safe to
// repeat — with retry.
//
// WHY: in one evening chat said "Meta abhi status confirm nahi kar pa
// raha" about a campaign that was running, and "Meta ne pause confirm
// nahi kiya" about a pause that had worked. Both times Meta had done
// exactly what was asked. Only OUR read failed, and every read went
// through a single fetch: one transient Graph error — a 5xx, "An
// unexpected error has occurred. Please retry your request later."
// (code 2), a rate limit on the ad account — reached the merchant as
// a failure.
//
// Worse, the old helper threw Meta's error away and returned null, so
// the logs could only say "unreadable". Whether it was a 500, a rate
// limit or an expired token was unrecoverable. Every failure now logs
// Meta's http status, code and subcode.
//
// metaPost (adEngine.ts) has retried writes once since launch; the read
// path never used it, and setCampaignStatus had its own POST without
// retry too.
//
// NEVER LOGGED: the token, or any URL (the URL carries it).

import { metaLog, metaError } from "@/lib/ads/metaLog";

const GRAPH_VERSION = "v23.0";

/**
 * Meta's documented transient codes: 1 unknown error, 2 service
 * temporarily unavailable, 4 app rate limit, 17 user rate limit, 32 page
 * rate limit, 341 app limit, 613 too many calls within an hour, and the
 * ads-management limits 80000 / 80003 / 80004 / 80014 (per ad account or
 * business). Anything Meta itself marks is_transient, any 5xx, 429, and
 * a network failure count as well.
 *
 * NOT retried: 190 (token expired or revoked), 100 (bad request), 10 and
 * 200 (permissions). Asking again cannot fix those, and a retry would
 * only delay an answer the merchant has to act on.
 */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

/** Three attempts in all, and how long verification waits for Meta to catch up after a write. */
export const DEFAULT_META_RETRY_TIMING = { delaysMs: [300, 900], settleMs: [800, 1600] } as const;

/**
 * The live timing. Mutable only so the test setup can zero the waits:
 * the number of attempts and every outcome stay the same, tests just
 * don't sleep. Production never changes it.
 */
export const metaRetryTiming: { delaysMs: number[]; settleMs: number[] } = {
  delaysMs: [...DEFAULT_META_RETRY_TIMING.delaysMs],
  settleMs: [...DEFAULT_META_RETRY_TIMING.settleMs],
};

export function waitMs(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export type GraphFailure = {
  /** null when the request never got a response. */
  http: number | null;
  code: number | null;
  subcode: number | null;
  message: string;
  userMessage: string | null;
  transient: boolean;
};

export type GraphResult = { ok: true; data: Record<string, any> } | { ok: false; error: GraphFailure };

export function classifyGraphError(http: number | null, body: any): GraphFailure {
  const e = body?.error ?? {};
  const code = typeof e.code === "number" ? e.code : null;
  const transient =
    http === null || http >= 500 || http === 429 || e.is_transient === true || (code !== null && TRANSIENT_CODES.has(code));
  return {
    http,
    code,
    subcode: typeof e.error_subcode === "number" ? e.error_subcode : null,
    message: e.message ?? (http === null ? "no response from Meta" : `HTTP ${http}`),
    userMessage: e.error_user_msg ?? null,
    transient,
  };
}

/** Meta's own words, the way setCampaignStatus has always reported them. */
export function describeGraphFailure(e: GraphFailure): string {
  return `${e.message}${e.userMessage ? ` — ${e.userMessage}` : ""}${e.subcode ? ` (subcode ${e.subcode})` : ""}`;
}

async function once(url: string, init?: RequestInit): Promise<GraphResult> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    return { ok: false, error: { http: null, code: null, subcode: null, message: err?.message ?? "no response from Meta", userMessage: null, transient: true } };
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // An unreadable body on a 200 is a hiccup, not an answer.
    if (res.ok) return { ok: false, error: { http: res.status, code: null, subcode: null, message: "unreadable response from Meta", userMessage: null, transient: true } };
  }
  if (!res.ok || !data || data.error) return { ok: false, error: classifyGraphError(res.status, data) };
  return { ok: true, data };
}

async function withRetry(stage: string, node: string, dealershipId: string | undefined, run: () => Promise<GraphResult>): Promise<GraphResult> {
  const delays = metaRetryTiming.delaysMs;
  for (let attempt = 0; ; attempt++) {
    const result = await run();
    if (result.ok) {
      if (attempt > 0) metaLog("graph.recovered", { stage, node, dealership: dealershipId, attempts: attempt + 1 });
      return result;
    }
    const e = result.error;
    const fields = { stage, node, dealership: dealershipId, attempt: attempt + 1, http: e.http, code: e.code, subcode: e.subcode, transient: e.transient, detail: e.message };
    if (!e.transient || attempt >= delays.length) {
      metaError("graph.failed", fields);
      return result;
    }
    metaLog("graph.retry", fields);
    await waitMs(delays[attempt]);
  }
}

/** One Graph read, retried on transient errors. */
export function metaRead(
  node: string,
  fields: string,
  token: string,
  ctx: { stage: string; dealershipId?: string; params?: Record<string, string> }
): Promise<GraphResult> {
  const extra = ctx.params ? `&${new URLSearchParams(ctx.params).toString()}` : "";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${node}?fields=${fields}${extra}&access_token=${encodeURIComponent(token)}`;
  return withRetry(ctx.stage, node, ctx.dealershipId, () => once(url));
}

/**
 * A POST that is safe to send twice — setting a status to a value it
 * may already have. NEVER for creates: retrying a create after a
 * timeout can make two campaigns, which is why metaPost keeps its
 * single, narrower retry.
 */
export function metaWriteIdempotent(
  node: string,
  body: Record<string, unknown>,
  token: string,
  ctx: { stage: string; dealershipId?: string }
): Promise<GraphResult> {
  return withRetry(ctx.stage, node, ctx.dealershipId, () =>
    once(`https://graph.facebook.com/${GRAPH_VERSION}/${node}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, access_token: token }),
    })
  );
}
