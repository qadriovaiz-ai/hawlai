// Loading a settings form — and refusing to save one that never loaded.
//
// THE BUG: the Shipping and Payments tabs did fetch(...).then(r =>
// r.json()) and never looked at r.ok. A failed load (a 500, an expired
// session) left the form on its defaults — Shipping showed "Always
// Free" — with Save enabled, and saving wrote those defaults over the
// business's real settings. A form may only save what it has shown to
// be the stored state.

export type LoadResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadSettings<T>(
  url: string,
  pick: (body: any) => T | null,
  missing: string,
  fetchImpl: typeof fetch = fetch
): Promise<LoadResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { cache: "no-store" });
  } catch {
    return { ok: false, error: "Couldn't reach Hawlai. Check your connection and try again." };
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // an empty or non-JSON body — treated as not loaded below
  }
  if (!res.ok) {
    return { ok: false, error: (typeof body?.error === "string" && body.error) || `Couldn't load these settings (error ${res.status}).` };
  }
  const data = body ? pick(body) : null;
  if (data === null || data === undefined) return { ok: false, error: missing };
  return { ok: true, data };
}

export type ShippingMode = "free" | "flat" | "free_above";
export type ShippingSettings = { mode: ShippingMode; rate: string; freeThreshold: string };

const MODES: ShippingMode[] = ["free", "flat", "free_above"];

/** The shipping settings in GET /api/website-builder/generate — null when there's no website to hold them. */
export function shippingFromWebsite(body: any): ShippingSettings | null {
  const w = body?.website;
  if (!w) return null;
  return {
    mode: MODES.includes(w.shipping_mode) ? w.shipping_mode : "free",
    rate: w.shipping_rate != null ? String(w.shipping_rate) : "",
    freeThreshold: w.shipping_free_threshold != null ? String(w.shipping_free_threshold) : "",
  };
}

/** The PATCH body for saving shipping — or null when the settings never loaded, so nothing is saved. */
export function shippingSaveBody(load: LoadResult<unknown> | null, form: ShippingSettings) {
  if (!load?.ok) return null;
  return {
    shippingMode: form.mode,
    shippingRate: form.mode === "free" ? 0 : form.rate || 0,
    shippingFreeThreshold: form.mode === "free_above" ? form.freeThreshold || 0 : null,
  };
}
