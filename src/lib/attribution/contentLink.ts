// The mark Hawlai puts on its own links so a visit can be traced back to
// the piece of content that sent it (Hawlai Brain, Phase 0).
//
// One short parameter, `hw`, carrying the content piece's id. It sits
// beside utm_* rather than replacing it: utm answers "which channel",
// this answers "which post". Both are needed to say something as
// ordinary as "the case-study post on WhatsApp brought four enquiries".
//
// Deliberately not a redirect service: a link the owner can read, paste
// and check themselves, that still works if every part of Hawlai is
// down, beats a tracked short link that breaks the moment it isn't.

export const PIECE_PARAM = "hw";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id shaped like one of ours. Anything else is ignored rather than stored. */
export function isPieceId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value.trim());
}

/**
 * `url` with this piece's mark on it.
 *
 * Returns the url untouched when there's no piece, when the url isn't
 * one (a relative path is fine, anything unparseable is not), or when
 * the mark is already there — putting a link in front of a customer
 * matters more than tracking it, so nothing here can mangle one.
 */
export function attributionUrl(url: string, pieceId: string | null | undefined): string {
  const raw = String(url ?? "").trim();
  if (!raw || !isPieceId(pieceId)) return raw;
  // Relative paths have no origin to parse against; a placeholder base
  // gives URL something to work with and is stripped off afterwards.
  const relative = !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  try {
    const u = new URL(relative ? `https://x.invalid${raw.startsWith("/") ? "" : "/"}${raw}` : raw);
    if (u.searchParams.has(PIECE_PARAM)) return raw;
    u.searchParams.set(PIECE_PARAM, pieceId.trim().toLowerCase());
    const out = u.toString();
    if (!relative) return out;
    const base = "https://x.invalid";
    const tail = out.slice(base.length);
    return raw.startsWith("/") ? tail : tail.replace(/^\//, "");
  } catch {
    return raw;
  }
}

/** The piece id on an incoming URL's query string, if it carries a real one. */
export function pieceIdFrom(search: string | null | undefined): string | null {
  const s = String(search ?? "");
  if (!s) return null;
  try {
    const value = new URLSearchParams(s.startsWith("?") ? s.slice(1) : s).get(PIECE_PARAM);
    return isPieceId(value) ? value!.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
