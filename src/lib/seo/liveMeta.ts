// Reads what the live page actually says, by fetching it.
//
// WHY NOT JUST READ THE DATABASE BACK: because the database is not what
// Google reads. A row can be written and the page still show something
// else — the site unpublished, the page renamed, a title resolved from a
// different field, a cached response. On 2026-09-28 chat told an owner
// their meta description was set when nothing outside a suggestions list
// had changed, so "we wrote the row" is precisely the claim that is no
// longer allowed to count as proof.
//
// One outbound request to a public page of the product's own site. Not a
// chain: the storefront page calls nothing back (see the 2026-09-20 note
// about self-calling route chains hitting Vercel's 508 after ~4 hops).
// It is time-boxed, and a failure to read is reported as a failure to
// VERIFY — never as a failure to write, and never as success.

/** What the page is serving right now. */
export type LiveMeta = {
  ok: true;
  url: string;
  title: string | null;
  description: string | null;
  /** The og:image a link preview would actually show. */
  image: string | null;
};

export type LiveMetaFailure = {
  ok: false;
  url: string;
  /** Said in words an owner can act on, not an HTTP code. */
  reason: string;
};

const TIMEOUT_MS = 8000;

/** The public address of a storefront page. */
export function storefrontUrl(slug: string, pageSlug: string, baseUrl?: string | null): string {
  const base = String(baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")).replace(/\/+$/, "");
  const path = pageSlug === "home" ? `/site/${slug}` : `/site/${slug}/${pageSlug}`;
  return `${base}${path}`;
}

/**
 * Browsers and Google read entities, not markup. `&#x27;` in the source
 * is an apostrophe on the page, and comparing the raw markup against
 * what the owner typed would report a mismatch for text that matches.
 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos|#39|nbsp);/g, (whole, code: string) => {
      if (code === "amp") return "&";
      if (code === "lt") return "<";
      if (code === "gt") return ">";
      if (code === "quot") return '"';
      if (code === "apos" || code === "#39") return "'";
      if (code === "nbsp") return " ";
      if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return whole;
    });
  // Decoded ONCE, which is what a browser does. A second pass looks like
  // extra safety and is a bug: an owner who literally typed "&amp;" has
  // it served as "&amp;amp;", and one decode already gives back exactly
  // what they typed. Decoding again would turn their text into "&" and
  // report a mismatch against the page that is serving it correctly.
}

/** The <title> the page serves. */
export function parseTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).trim() || null : null;
}

/**
 * The description meta tag, whichever order its attributes are in.
 *
 * Deliberately not `name="description"` anchored to a position: Next
 * emits `<meta name="description" content="…"/>` today, but the same tag
 * with the attributes reversed is equally valid HTML and a regex that
 * missed it would report "no description on the page" about a page that
 * has one.
 */
export function parseDescription(html: string): string | null {
  return metaContent(html, /\bname\s*=\s*["']description["']/i);
}

/**
 * The og:image a link preview would show.
 *
 * On `property=` rather than `name=`, because that is what Open Graph
 * uses and what WhatsApp and Facebook read.
 */
export function parseImage(html: string): string | null {
  return metaContent(html, /\bproperty\s*=\s*["']og:image["']/i);
}

function metaContent(html: string, matcher: RegExp): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!matcher.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([\s\S]*?)["']/i);
    if (content) return decodeEntities(content[1]).trim() || null;
  }
  return null;
}

/**
 * Fetch a live storefront page and read its title and description.
 *
 * Never throws: every failure comes back as { ok: false } with a reason
 * the caller can repeat to the owner.
 */
export async function readLiveMeta(
  slug: string,
  pageSlug: string,
  deps: { fetchImpl?: typeof fetch; baseUrl?: string | null } = {}
): Promise<LiveMeta | LiveMetaFailure> {
  const url = storefrontUrl(slug, pageSlug, deps.baseUrl);
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, url, reason: "I don't know this site's public address in this environment, so I couldn't check the live page." };
  }

  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const response = await doFetch(url, {
      cache: "no-store",
      headers: { "user-agent": "Hawlai-meta-verify" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) {
      return { ok: false, url, reason: "The live page returned 404 — the site isn't published yet, so there is nothing public to check." };
    }
    if (!response.ok) {
      return { ok: false, url, reason: `The live page answered ${response.status}, so I couldn't read what it's serving.` };
    }
    const html = await response.text();
    return { ok: true, url, title: parseTitle(html), description: parseDescription(html), image: parseImage(html) };
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      url,
      reason: timedOut ? "The live page didn't answer in time, so I couldn't confirm what it's serving." : "I couldn't reach the live page to confirm what it's serving.",
    };
  }
}

export type MetaVerification = {
  /** True only when every field asked for is the text now on the page. */
  verified: boolean;
  url: string;
  /** One sentence, written to be said to the owner as-is. */
  message: string;
  live?: { title: string | null; description: string | null; image?: string | null };
};

/**
 * Compare what was approved with what the page now serves.
 *
 * The three outcomes are kept apart on purpose: matched, did not match
 * (with both texts, so the owner can see what is actually there), and
 * could not be checked. Only the first may be called live.
 */
export function verifyAgainst(
  expected: { title?: string | null; description?: string | null; image?: string | null },
  live: LiveMeta | LiveMetaFailure
): MetaVerification {
  if (!live.ok) {
    return { verified: false, url: live.url, message: `Saved. ${live.reason} Nothing is confirmed live yet — open ${live.url} to see for yourself.` };
  }

  const same = (a: string | null | undefined, b: string | null) => String(a ?? "").trim() === String(b ?? "").trim();
  const mismatched: string[] = [];
  if (expected.title != null && !same(expected.title, live.title)) {
    mismatched.push(`the title still reads ${live.title ? `"${live.title}"` : "(nothing)"}`);
  }
  if (expected.description != null && !same(expected.description, live.description)) {
    mismatched.push(`the description still reads ${live.description ? `"${live.description}"` : "(nothing)"}`);
  }
  // A share image is only real once the page is serving og:image —
  // saving the URL to the row proves nothing about a link preview.
  if (expected.image != null && !same(expected.image, live.image)) {
    mismatched.push(`the share image is still ${live.image ? live.image : "not set"}`);
  }

  if (mismatched.length === 0) {
    const what = [expected.title != null ? "title" : null, expected.description != null ? "description" : null, expected.image != null ? "share image" : null].filter(Boolean).join(" and ");
    return { verified: true, url: live.url, message: `Live — I read the page back and the ${what} is exactly what you approved.`, live: { title: live.title, description: live.description, image: live.image } };
  }

  return {
    verified: false,
    url: live.url,
    message: `Saved, but not live yet: I read the page back and ${mismatched.join(", and ")}. That usually means the site hasn't been published since the change.`,
    live: { title: live.title, description: live.description, image: live.image },
  };
}
