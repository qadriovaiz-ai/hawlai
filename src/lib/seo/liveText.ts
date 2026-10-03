// Reads whether the live page is actually SERVING a piece of copy.
//
// The sibling of liveMeta.ts, for body text rather than meta tags, and it
// exists for the same reason: writing the row is not evidence the page
// changed. On the meta flow that lesson is already learnt — chat told an
// owner their description was set when nothing had changed, so "live" now
// means "I fetched the page and read it back".
//
// The homepage copy flow still asserted "✅ Updated your live homepage"
// from a 200 on the PATCH alone. Everything that can go wrong between a
// written row and a changed page is still true here, and one of them is
// specific to this path: /site/{slug} renders what website_pages holds,
// so an unpublished site, a renamed page or a cached response all give a
// successful write and an unchanged page.
//
// One outbound request to a public page of the product's own site. Not a
// chain — the storefront page calls nothing back.

import { decodeEntities, storefrontUrl } from "./liveMeta";

const TIMEOUT_MS = 8000;

export type LiveText = { ok: true; url: string; text: string };
export type LiveTextFailure = { ok: false; url: string; reason: string };

/**
 * The words a reader sees, out of the markup.
 *
 * `<script>` CONTENT IS DROPPED FIRST, and that is the whole correctness
 * of this function. Next.js embeds the React payload for the page in
 * `<script>self.__next_f.push(...)` — the props of every block, as JSON,
 * including the new headline. Searching the raw HTML would therefore find
 * the text in a page that never displays it, and the check would confirm
 * "live" for exactly the case it was written to catch.
 *
 * Comments are removed with nothing between, because React separates two
 * adjacent text nodes with `<!-- -->`: "₹" and "999" arrive as
 * `₹<!-- -->999` and are one word to a reader. Tags become a space, so
 * `</p><p>` doesn't run two sentences together.
 */
export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One string, in the form it will have on the page.
 *
 * Text blocks store a markdown subset (`**bold**`, `*italic*`,
 * `[text](url)`) which lib/richText turns into elements — so the stored
 * asterisks are never on the page and comparing them literally would
 * report a mismatch for copy that is being served correctly.
 */
export function forMatching(value: string): string {
  return value
    .replace(/\[([^\[\]]+)\]\((?:[^\s()]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Fetch a live storefront page and return the words on it. Never throws. */
export async function readLiveText(
  slug: string,
  pageSlug: string,
  deps: { fetchImpl?: typeof fetch; baseUrl?: string | null } = {}
): Promise<LiveText | LiveTextFailure> {
  const url = storefrontUrl(slug, pageSlug, deps.baseUrl);
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, url, reason: "I don't know this site's public address in this environment, so I couldn't check the live page." };
  }

  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const response = await doFetch(url, {
      cache: "no-store",
      headers: { "user-agent": "Hawlai-copy-verify" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) {
      return { ok: false, url, reason: "The live page returned 404, so there is nothing public to check yet." };
    }
    if (!response.ok) {
      return { ok: false, url, reason: `The live page answered ${response.status}, so I couldn't read what it's serving.` };
    }
    return { ok: true, url, text: visibleText(await response.text()) };
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      url,
      reason: timedOut ? "The live page didn't answer in time, so I couldn't confirm what it's serving." : "I couldn't reach the live page to confirm what it's serving.",
    };
  }
}

export type TextVerification = {
  /** True only when every approved line is on the page right now. */
  verified: boolean;
  url: string;
  /** One sentence, written to be shown to the owner as-is. */
  message: string;
  /** The lines that were not found, for a card that wants to list them. */
  missing: string[];
};

/**
 * Compare what was approved against what the page is serving.
 *
 * Three outcomes, kept apart: every line found, some line missing, and
 * could not be checked. Only the first may be called live — a read that
 * failed is reported as a failure to VERIFY, never as a failure to write
 * and never as success.
 */
export function verifyTextLive(expected: string[], live: LiveText | LiveTextFailure): TextVerification {
  const wanted = expected.map((value) => String(value ?? "")).filter((value) => value.trim().length > 0);

  if (!live.ok) {
    return {
      verified: false,
      url: live.url,
      message: `Saved. ${live.reason} Nothing is confirmed live yet — open ${live.url} to see for yourself.`,
      missing: wanted,
    };
  }
  if (wanted.length === 0) {
    return { verified: false, url: live.url, message: `Saved. There was no new wording to check on ${live.url}.`, missing: [] };
  }

  const haystack = forMatching(live.text);
  const missing = wanted.filter((value) => !haystack.includes(forMatching(value)));

  if (missing.length === 0) {
    return {
      verified: true,
      url: live.url,
      message: `Live — I read ${live.url} back and the new wording is on the page.`,
      missing: [],
    };
  }

  const quoted = missing.map((value) => `"${value.length > 60 ? `${value.slice(0, 57)}…` : value}"`).join(", and ");
  return {
    verified: false,
    url: live.url,
    message: `Saved, but not live yet: I read ${live.url} back and ${quoted} isn't on the page. That usually means the site hasn't been published since the change, or the page is being served from a cache.`,
    missing,
  };
}
