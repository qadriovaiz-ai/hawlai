// A catalogue item is a PRODUCT (bought, maybe shipped) or a SERVICE
// (booked). Both live in the products table (migration 188).
//
// WHY (approved 2026-09-17, industry-agnostic overhaul Phase 2): the
// catalogue only knew products, so a salon's haircut or a consultant's
// session could only be listed as something to add to a cart, with stock
// and shipping — and business facts told every AI "Products: none listed"
// for a business that sells only services.

export type CatalogKind = "product" | "service";

export const SERVICE_DURATION_MAX_MINUTES = 1440;

/** Anything without a kind is a product — every item from before migration 188. */
export function isService(item: { kind?: string | null }): boolean {
  return item.kind === "service";
}

export function cleanKind(input: unknown): CatalogKind | null {
  return input === "product" || input === "service" ? input : null;
}

/** A booking link a customer can open: http(s) only. Empty means none. */
export function cleanBookingUrl(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === null || input === undefined) return { ok: true, value: null };
  const s = String(input).trim();
  if (!s) return { ok: true, value: null };
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? { ok: true, value: u.toString() } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function cleanDuration(input: unknown): { ok: true; value: number | null } | { ok: false } {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  const n = Number(input);
  return Number.isInteger(n) && n > 0 && n <= SERVICE_DURATION_MAX_MINUTES ? { ok: true, value: n } : { ok: false };
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** The business's own booking page (/book/[slug]), when it has turned one on. */
export function bookingPageUrl(bookingSlug: string | null | undefined, base = ""): string | null {
  return bookingSlug ? `${base}/book/${bookingSlug}` : null;
}

/** Where "Book" goes for a service: its own booking link, else the business's booking page, else nowhere. */
export function serviceBookingHref(item: { booking_url?: string | null; bookingUrl?: string | null }, bookingPage: string | null): string | null {
  return item.booking_url || item.bookingUrl || bookingPage || null;
}

/**
 * Validates the service fields of a create/update body. Returns the
 * columns to write, or an error the owner can act on.
 */
export function serviceFieldsFromBody(
  body: Record<string, any>,
  current: { kind?: string | null } = {}
): { ok: true; update: Record<string, unknown> } | { ok: false; error: string } {
  const update: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    const kind = cleanKind(body.kind);
    if (!kind) return { ok: false, error: "An item is either a product or a service" };
    update.kind = kind;
  }
  const kind = (update.kind as string | undefined) ?? current.kind ?? "product";
  if (body.durationMinutes !== undefined) {
    const d = cleanDuration(body.durationMinutes);
    if (!d.ok) return { ok: false, error: "Duration must be a whole number of minutes, up to 24 hours" };
    update.duration_minutes = d.value;
  }
  if (body.bookingUrl !== undefined) {
    const b = cleanBookingUrl(body.bookingUrl);
    if (!b.ok) return { ok: false, error: "The booking link must be a full web address starting with https://" };
    update.booking_url = b.value;
  }
  // A service isn't stocked or shipped; a product isn't booked.
  if (kind === "service") update.inventory_count = null;
  else if (update.kind === "product") {
    update.duration_minutes = null;
    update.booking_url = null;
  }
  return { ok: true, update };
}
