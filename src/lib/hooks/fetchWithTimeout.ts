// A fetch that is guaranteed to settle.
//
// WHY. The blank-dashboard incident had two halves. The redirect loop
// caused it; this is why it was INVISIBLE. Both dashboard-layout
// fetches were written as:
//
//   fetch(url).then(...).catch(() => {})            // TopBar
//   fetch(url).then(...).finally(() => setLoading(false))  // Switcher
//
// A request that never settles never reaches `.catch` OR `.finally`.
// The spinner stayed up forever, the error handler never ran, and the
// only symptom was a blank screen — no console error, nothing to
// search for. 126 requests sat pending and the UI reported nothing.
//
// A bounded wait converts that into a visible failure. It does not
// prevent the underlying hang; it makes the hang observable, which is
// the difference between a bug someone can report and one they
// describe as "it just doesn't load".

export interface TimeoutFetchResult<T> {
  data: T | null;
  /** Set when the request failed or timed out. Null on success. */
  error: string | null;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 12_000;

// ---- Request coalescing -------------------------------------------
//
// The other half of the blank-dashboard incident. Whatever remounts
// the dashboard layout, each remount refired both of its fetches, and
// 126 requests to two endpoints landed in ~70 seconds. A browser opens
// six connections per host, so the surplus queued — and queued
// requests show in DevTools as "(pending)" with 0 bytes, which is
// indistinguishable from a server that has hung. The storm made
// healthy endpoints look broken and hid the real cause.
//
// Coalescing caps that at one real request per key per window,
// regardless of how many times a component mounts. It does not fix a
// remount loop; it stops one from being able to saturate the
// connection pool, so the next such bug shows up as a slow page
// instead of a dead one.
//
// OPT-IN, and GET-only by intent. Deduplicating a PATCH would silently
// drop a second genuine write — callers pass a key only where a
// repeated read is definitionally redundant.
const inflight = new Map<string, Promise<TimeoutFetchResult<any>>>();
const recent = new Map<string, { at: number; result: TimeoutFetchResult<any> }>();
const DEDUPE_WINDOW_MS = 10_000;

/**
 * Always resolves — never rejects, never hangs.
 *
 * Callers get a result object rather than a thrown error, so the
 * "forgot to handle rejection" shape that hid this bug cannot recur:
 * there is no rejection to forget.
 */
export async function fetchWithTimeout<T>(
  url: string,
  opts: RequestInit & { timeoutMs?: number; dedupeKey?: string } = {}
): Promise<TimeoutFetchResult<T>> {
  const { dedupeKey } = opts;

  if (dedupeKey) {
    // A result from moments ago answers a remount just as well as a
    // fresh round-trip, and costs nothing.
    const cached = recent.get(dedupeKey);
    if (cached && Date.now() - cached.at < DEDUPE_WINDOW_MS) return cached.result as TimeoutFetchResult<T>;

    // Mid-flight already: join it rather than opening a second
    // connection. This is what actually caps the storm — remounts
    // arrive faster than a request completes.
    const existing = inflight.get(dedupeKey);
    if (existing) return existing as Promise<TimeoutFetchResult<T>>;
  }

  const promise = runFetch<T>(url, opts);

  if (dedupeKey) {
    inflight.set(dedupeKey, promise);
    promise.then((result) => {
      // Failures are cached too, deliberately. A failing endpoint
      // being retried on every remount is precisely the storm; the
      // window expires on its own, so recovery still happens.
      recent.set(dedupeKey, { at: Date.now(), result });
      inflight.delete(dedupeKey);
    });
  }

  return promise;
}

async function runFetch<T>(
  url: string,
  opts: RequestInit & { timeoutMs?: number; dedupeKey?: string }
): Promise<TimeoutFetchResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, dedupeKey: _ignored, ...init } = opts;

  // AbortSignal.timeout would be tidier but is not available in every
  // browser this product targets; a manual controller works everywhere.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      return { data: null, error: `Request failed (${res.status})`, timedOut: false };
    }
    return { data: (await res.json()) as T, error: null, timedOut: false };
  } catch (err: any) {
    const timedOut = err?.name === "AbortError";
    return {
      data: null,
      error: timedOut ? "This took too long to load." : "Couldn't reach the server.",
      timedOut,
    };
  } finally {
    clearTimeout(timer);
  }
}
