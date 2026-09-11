// The date-range slider's rules, kept pure so they can be tested.

import { shortDate } from "@/lib/ads/campaignDeliveryDisplay";

/**
 * Handles are indices into the list of history dates. Rounded, kept in
 * bounds, and never allowed to cross: the handle being moved stops at
 * the other one rather than pushing it.
 */
export function clampRange(start: number, end: number, count: number, moved: "start" | "end"): [number, number] {
  const max = Math.max(0, count - 1);
  let s = Math.min(Math.max(0, Math.round(start)), max);
  let e = Math.min(Math.max(0, Math.round(end)), max);
  if (s > e) {
    if (moved === "start") s = e;
    else e = s;
  }
  return [s, e];
}

/** "9 Sep – 11 Sep", or "9 Sep" for a single day. */
export function rangeLabel(dates: string[], start: number, end: number): string {
  if (dates.length === 0) return "";
  const a = shortDate(dates[Math.min(start, dates.length - 1)]);
  const b = shortDate(dates[Math.min(end, dates.length - 1)]);
  return a === b ? a : `${a} – ${b}`;
}

/**
 * Where a native range thumb's centre sits, as a CSS length. A thumb's
 * centre travels from half a thumb in from the left to half a thumb in
 * from the right, not 0%–100%, so the filled segment must use the same
 * offset or it drifts off the thumbs at the ends.
 */
export function thumbCentre(index: number, count: number, thumbPx: number): string {
  const pct = count <= 1 ? 0 : (index / (count - 1)) * 100;
  return `calc(${pct}% + ${(thumbPx / 2 - (pct / 100) * thumbPx).toFixed(2)}px)`;
}
