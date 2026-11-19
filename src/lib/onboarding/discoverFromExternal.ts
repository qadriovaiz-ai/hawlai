// What the business's own external website already says — D5.
//
// D2 reads the site Hawlai built. Most businesses that sign up already
// have a website somewhere else, and it answers the same questions: the
// phone number, the opening hours, the address. Asking a shopkeeper to
// type them into a form when he has already published them is the
// product not reading what it was given.
//
// ─────────────────────────────────────────────────────────────────────
// THE SAME JUDGEMENT, A DIFFERENT SOURCE
// ─────────────────────────────────────────────────────────────────────
//
// Everything decided here is decided by `suggestFromLines`, which is
// D2's rules — exactly one line or say nothing, the line itself as the
// suggestion, a suggestion never a record. This file's whole job is to
// turn a URL into the lines those rules read.
//
// A phone number on a brochure site deserves neither more nor less
// trust than one on a page we built, so there is no second set of
// rules. Only `sourceKind` differs, and that is what the owner sees
// when he is asked to confirm it.
//
// ─────────────────────────────────────────────────────────────────────
// WHY NOT stripHtmlToText
// ─────────────────────────────────────────────────────────────────────
//
// businessIntelligenceAgent already turns HTML into text, and it would
// have been the obvious thing to reuse. It collapses ALL whitespace
// into single spaces, which is right for feeding a model a paragraph
// and WRONG here: it produces ONE line, and D2's discipline is "exactly
// one line matches". With a single line, every pattern matches the same
// line, "exactly one" is always true, and the safety rail that makes
// this showable to a non-technical owner silently stops existing.
//
// So block boundaries are preserved before the tags are stripped. That
// difference is the whole reason this is a separate function.
//
// ─────────────────────────────────────────────────────────────────────
// THE URL IS THE OWNER'S OWN, AND IS STILL GUARDED
// ─────────────────────────────────────────────────────────────────────
//
// It comes from `dealerships.external_website_url`, which the owner
// typed. It is NEVER taken from a page's own content — a discovered
// link is an address a stranger chose, and following one would let a
// page decide what our servers fetch next.
//
// Even the owner's own is checked: a typed address is still an SSRF
// primitive if it says "169.254.169.254", which is wooAuth's own
// example and why that guard now lives in lib/net/publicUrl.

import { publicHttpUrl } from "@/lib/net/publicUrl";
import { suggestFromLines } from "@/lib/onboarding/discoverFromSite";
import type { Suggestion } from "./suggestions";

/** Where a suggestion from this module came from. D1 named this kind. */
export const EXTERNAL_SOURCE = "external_site";

/** Long enough for a contact page, short enough to bound a bad one. */
export const MAX_HTML_BYTES = 500_000;
/** A slow site must not hold a signup open. */
export const FETCH_TIMEOUT_MS = 10_000;
/** More lines than this and it is a sitemap, not a shop's page. */
export const MAX_LINES = 400;

/** Block-level tags whose end means a new line of text. */
const BLOCK_END =
  /<\/(?:p|div|section|article|header|footer|li|ul|ol|tr|td|th|h[1-6]|blockquote|address|nav|main|span|a)\s*>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;

/**
 * HTML to the lines a person would see as separate.
 *
 * NOT A PARSER, and it does not need to be. It needs block boundaries
 * to survive, because that is what D2's "exactly one line" rests on.
 */
export function htmlToLines(html: string | null | undefined): string[] {
  const text = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(LINE_BREAK, "\n")
    .replace(BLOCK_END, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/gi, " ");

  const out: string[] = [];
  for (const raw of text.split("\n")) {
    // Spaces and tabs collapse INSIDE a line; newlines do not, which is
    // the entire difference from stripHtmlToText.
    //
    // CORRECTED 19 November 2026. That claim was false. `raw` has
    // already been split on newlines, so there are none left to
    // protect and `[^\S\n]+` could not differ from `\s+` — a mutation
    // between them survived, which is what exposed it. The real
    // difference from stripHtmlToText is the split above, where the
    // block boundaries are kept; this line is ordinary tidying.
    const line = raw.replace(/\s+/g, " ").trim();
    if (line) out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

export type ExternalRead =
  | { ok: true; url: string; lines: string[] }
  | { ok: false; reason: string };

/**
 * Read the business's own website, once.
 *
 * NEVER THROWS. A site that is down, slow, or returns something that is
 * not a page is a reason to ask the owner the questions blank — which
 * is exactly what happened before discovery existed. It is not a reason
 * to fail a signup.
 */
export async function readExternalSite(
  input: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<ExternalRead> {
  const checked = publicHttpUrl(input);
  if (!checked.ok) return { ok: false, reason: checked.reason };

  try {
    const res = await fetchImpl(checked.url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HawlaiBot/1.0)" },
    });
    if (!res.ok) return { ok: false, reason: `That website returned ${res.status}.` };

    const type = String(res.headers?.get?.("content-type") ?? "").toLowerCase();
    // A PDF or an image is not a page to read. Checked rather than
    // assumed, because the bytes below are about to be treated as HTML.
    if (type && !type.includes("html") && !type.includes("text/plain")) {
      return { ok: false, reason: "That address isn't a web page we can read." };
    }

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const lines = htmlToLines(html);
    if (!lines.length) return { ok: false, reason: "There was nothing readable on that page." };
    return { ok: true, url: checked.url.toString(), lines };
  } catch (err: any) {
    return { ok: false, reason: `Couldn't read that website: ${err?.message ?? "no answer"}` };
  }
}

/**
 * Everything the business's external website can suggest.
 *
 * An empty list is a normal answer and means "nothing here is
 * unambiguous" — not that the site is empty.
 */
export async function discoverFromExternalSite(
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<Suggestion[]> {
  const read = await readExternalSite(url, fetchImpl);
  if (!read.ok) return [];
  return suggestFromLines(read.lines, EXTERNAL_SOURCE, read.url);
}
