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

/**
 * Always resolves — never rejects, never hangs.
 *
 * Callers get a result object rather than a thrown error, so the
 * "forgot to handle rejection" shape that hid this bug cannot recur:
 * there is no rejection to forget.
 */
export async function fetchWithTimeout<T>(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {}
): Promise<TimeoutFetchResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = opts;

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
