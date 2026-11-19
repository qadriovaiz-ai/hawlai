// Is this address safe for our servers to fetch?
//
// EXTRACTED FROM wooAuth (19 November 2026), unchanged, because a
// second caller arrived: D5 reads the business's own external website.
// Both fetch a host a person typed into a form, and both would
// otherwise be an SSRF primitive — "localhost:6379" and
// "169.254.169.254" are the examples wooAuth's own comment names.
//
// ONE LIST, NOT TWO. A blocked-range list that exists in two files is
// one that will be corrected in one of them.

/**
 * Loopback, link-local, private ranges and mDNS names.
 *
 * A business website on any of these is not reachable from our servers
 * anyway, so this rejects nothing legitimate.
 *
 * NOT A SUBSTITUTE FOR WHAT DNS DOES. A public name can still resolve
 * to a private address, and nothing here can see that — this is the
 * cheap half, and it is the half that catches a typed address.
 */
export function isPublicHost(hostname: string | null | undefined): boolean {
  const host = String(hostname ?? "").trim().toLowerCase();
  if (!host) return false;

  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host);
  if (blocked) return false;

  // A dot is the cheapest way to reject a bare hostname without
  // resolving anything.
  return host.includes(".");
}

export type PublicUrl = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * A typed web address turned into something safe to fetch server-side.
 *
 * http IS ALLOWED HERE, and that is the one difference from the store
 * version. A shop's checkout must be https before we hand it
 * credentials; a corner shop's brochure site on plain http is simply a
 * website, and refusing to read it would cost the owner a feature to
 * protect nothing — we send no secret and read only what the page
 * shows the public.
 */
export function publicHttpUrl(input: string | null | undefined): PublicUrl {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, reason: "No website address on record." };

  // People type "mystore.com", not "https://mystore.com".
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "That isn't a web address we can read." };
  }
  if (!isPublicHost(url.hostname)) return { ok: false, reason: "That address isn't a public website." };

  return { ok: true, url };
}
