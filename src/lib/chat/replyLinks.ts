// Links in what the chat AI writes itself (2026-09-21).
//
// THE BUG, and it cost bookings: a workshop caption written straight into
// the chat reply carried "Book here" pointing at https://calendly.com —
// Calendly's own marketing homepage, where a customer sees "All the work
// around meetings, handled" and a sign-up form, not this workshop. The
// real link, https://calendly.com/candlebyqaaf/workshop, was sitting in
// the verified facts the model was given.
//
// Why nothing caught it: every guard sits on what the TOOLS produce. A
// generated caption has its links checked (claims guard) or replaced with
// "link in bio" (platform rules). The model's own prose had none of that —
// it went back to the owner exactly as written.
//
// So: a link in a reply must be one of this business's real links. Not the
// right host — the right LINK. "calendly.com" and
// "calendly.com/candlebyqaaf/workshop" share a host, and one of them is a
// dead end. Anything else is replaced with the business's real booking
// link where the link is clearly about booking, and otherwise unlinked,
// leaving the words.

import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { bookingLinkFor } from "@/lib/claims/businessFacts";

export type LinkFix = { reply: string; corrected: number; removed: number; bookingLink: string | null };

/** Same link, written differently: case, trailing slash, a trailing full stop. */
function normalise(url: string): string {
  return String(url ?? "")
    .trim()
    .replace(/[.,;:!?)]+$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Every address this business actually has, and the hosts whose paths are all theirs. */
export function knownLinks(facts: BusinessFacts | null | undefined): { exact: Set<string>; hosts: Set<string> } {
  const exact = new Set<string>();
  const hosts = new Set<string>();
  const add = (url: string | null | undefined) => {
    if (!url) return;
    exact.add(normalise(url));
  };
  add(facts?.links?.store);
  add(facts?.links?.booking);
  for (const p of facts?.links?.products ?? []) add(p.url);
  for (const p of facts?.products ?? []) add(p.bookingUrl);
  // The store's own pages: any path under it is this business's. The
  // booking provider's host is deliberately NOT here — calendly.com is
  // Calendly's, and only one page on it belongs to this business.
  if (facts?.links?.store) hosts.add(hostOf(facts.links.store));
  for (const p of facts?.links?.products ?? []) hosts.add(hostOf(p.url));
  // Where Hawlai puts the pictures it makes — a generated image in a reply
  // is not a customer-facing link and must survive untouched.
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (storage) hosts.add(hostOf(storage));
  return { exact, hosts };
}

/** The address a customer should be sent to for a booking, if there is one. */
export function bookingLinkOf(facts: BusinessFacts | null | undefined): string | null {
  if (!facts) return null;
  for (const p of facts.products ?? []) {
    if (p.kind === "service" && p.bookingUrl) return p.bookingUrl;
  }
  const first = (facts.products ?? []).find((p) => p.kind === "service");
  return (first ? bookingLinkFor(first, facts) : null) ?? facts.links?.booking ?? null;
}

const MARKDOWN = /(!?)\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/g;
const BARE = /(?<![@\w.-])(?:https?:\/\/[^\s<>"'()\]]+|www\.[^\s<>"'()\]]+)/gi;
/**
 * Words that mean "this is where my customer goes", in English and
 * Hinglish. Anchored at a word start, because "facebook.com" is not an
 * invitation to book anything.
 */
const A_CTA = /\b(book|slot|appointment|schedule|calendly|register|sign\s*up|join|buy|order|shop|checkout|purchase|karo|karein|yahan|yahaan)/i;

/**
 * Every link in a reply, checked against what the business really has.
 *
 * Only links being handed to a CUSTOMER are touched. A reply may well
 * carry links that aren't this business's and shouldn't be — a
 * competitor's page being quoted, Meta's own documentation — and those
 * are left exactly as written. What gets fixed is a link presented as
 * where to book or buy: it must be one of the owner's real addresses.
 */
export function fixReplyLinks(reply: string, facts: BusinessFacts | null | undefined): LinkFix {
  const { exact, hosts } = knownLinks(facts);
  const booking = bookingLinkOf(facts);
  const bookingHost = booking ? hostOf(booking) : "";
  let corrected = 0;
  let removed = 0;
  // Nothing known about this business's addresses: every link here is
  // equally unverifiable, and silently emptying the reply would be worse
  // than leaving it as written.
  if (exact.size === 0 && !booking) return { reply, corrected, removed, bookingLink: null };

  const allowed = (url: string): boolean => {
    const n = normalise(url);
    if (exact.has(n)) return true;
    // A page inside one the owner published is still theirs.
    for (const k of exact) if (n.startsWith(`${k}/`) || n.startsWith(`${k}?`)) return true;
    const host = hostOf(url);
    return host !== "" && hosts.has(host);
  };

  /** null = leave it alone; a string = send it here; "" = it shouldn't be a link. */
  const verdict = (url: string, label: string): string | null | "" => {
    if (allowed(url)) return null;
    // Calendly's front door instead of this workshop's page: the live bug.
    if (bookingHost && hostOf(url) === bookingHost && booking) return booking;
    if (!A_CTA.test(label) && !A_CTA.test(url)) return null; // informational, not a CTA
    return booking ?? "";
  };

  let out = reply.replace(MARKDOWN, (whole, bang: string, label: string, url: string) => {
    // An image Hawlai just made, shown inline — not a customer link.
    if (bang === "!") return whole;
    const v = verdict(url, label);
    if (v === null) return whole;
    if (v) {
      corrected += 1;
      return `[${label}](${v})`;
    }
    removed += 1;
    return label;
  });

  // A bare URL carries no label, and the words around it aren't in reach
  // here — so only the case that is wrong on its own face is touched: the
  // booking provider's host, pointing somewhere other than the booking.
  out = out.replace(BARE, (url: string) => {
    const trail = url.match(/[.,;:!?]+$/)?.[0] ?? "";
    const bare = trail ? url.slice(0, -trail.length) : url;
    if (!booking || !bookingHost || allowed(bare)) return url;
    if (hostOf(bare) !== bookingHost) return url;
    corrected += 1;
    return booking + trail;
  });

  // Two spaces where a link used to be, or a dangling separator.
  if (removed) out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?])/g, "$1");
  return { reply: out, corrected, removed, bookingLink: booking };
}

/** Said to the owner when a link was put right — never changed silently. */
export function linkFixNote(fix: LinkFix): string | null {
  if (fix.corrected > 0 && fix.bookingLink) return `\n\n(One link in this message wasn't yours — I've pointed it at your real booking page: ${fix.bookingLink})`;
  if (fix.removed > 0) return `\n\n(I removed a link from this message: it wasn't one of yours, and I won't send your customers somewhere you haven't set up.)`;
  return null;
}
