// Talking to a WordPress site's REST API.
//
// THE TRANSPORT ONLY. No business rules, no action keys — the same
// separation shopifyGraphQL.ts keeps, and for the same reason: the
// adapter is already long enough without HTTP and error-shape handling
// folded into every branch.
//
// AUTHENTICATION IS HTTP BASIC with an application password, built into
// WordPress core since 5.6. There is no OAuth, no token refresh and no
// expiry, so none of shopifyToken.ts's 197 lines of rotation machinery
// has an equivalent here.
//
// AND NO SCOPES, WHICH IS WHY THE CREDENTIAL IS ENCRYPTED. An
// application password carries exactly the capabilities of the user it
// belongs to; an administrator's is administrator access to the whole
// site. Migration 238 moved it to ciphertext at rest for that reason.
//
// ───────────────────────────────────────────────────────────────────
// WHAT A LIVE SITE TAUGHT US, 22 November 2026, BEFORE A LINE OF THE
// ADAPTER WAS WRITTEN. Probed against a real WordPress + Yoast install
// rather than read from documentation — which is how the four Shopify
// corrections happened, each found only after a live run.
//
// READ WITH `context=edit`, ALWAYS, OR THE ADAPTER IS PERMANENTLY
// STALE. Without it a post comes back as:
//
//   title:   {"rendered":"Hello world!"}          — no `raw` at all
//   content: {"rendered":"\n<p class=\"wp-block-paragraph\">Welcome…"}
//
// `rendered` is NOT what was written: WordPress transforms block markup
// on the way out. An adapter that captured `rendered` as the preview's
// before-value would compare it against what it wrote on execute, never
// match, and report every single change as stale. A test against a fake
// fetch cannot see that — the fake returns whatever it is given.
//
// `context=edit` requires authentication (an unauthenticated request
// gets 401), which this transport always sends, and it adds `raw` to
// both fields.
// ───────────────────────────────────────────────────────────────────

export type WordPressCreds = { siteUrl: string; username: string; appPassword: string };

export type RestResult<T> = { ok: true; data: T } | { ok: false; reason: string; status?: number };

/**
 * The site's REST root, with no trailing slash and a scheme.
 *
 * Owners paste what is in their address bar, which is sometimes
 * "example.com", sometimes with a trailing slash, and occasionally with
 * /wp-admin still on the end. Normalising here rather than at each call
 * site is the same rule the rest of this codebase follows: one place
 * that knows the shape.
 */
export function restRoot(siteUrl: string): string {
  let url = siteUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "").replace(/\/wp-admin\/?$/i, "").replace(/\/wp-json\/?$/i, "");
}

function authHeader(creds: WordPressCreds): string {
  // Application passwords are shown with spaces for readability and
  // WordPress accepts them either way, but a pasted value carrying a
  // trailing newline does NOT authenticate — and the failure is a flat
  // 401 that reads as "wrong password".
  return `Basic ${Buffer.from(`${creds.username.trim()}:${creds.appPassword.trim()}`).toString("base64")}`;
}

/**
 * WordPress's own words when it refuses, rather than a status code.
 *
 * A REST error body is `{ code, message, data: { status } }`, and the
 * message is written for a human — "Sorry, you are not allowed to edit
 * this post." tells an owner what to fix; "403" does not.
 */
function describeFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Not JSON. A WordPress site behind a security plugin or a login
    // wall answers with HTML, and quoting a page of it at the owner
    // helps nobody.
  }
  if (status === 401) return "WordPress refused the username and application password.";
  if (status === 403) return "WordPress accepted the login but that user is not allowed to do this.";
  if (status === 404) return "WordPress has no REST API at that address, or that item no longer exists.";
  return `WordPress returned ${status}.`;
}

/**
 * One authenticated REST call.
 *
 * `context=edit` is added to every GET, never optionally — see the
 * header. A caller that wanted `view` would be asking for the rendered
 * values, and nothing in the publish path ever should.
 */
export async function wordpressRequest<T>(
  creds: WordPressCreds,
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch
): Promise<RestResult<T>> {
  const method = init.method ?? "GET";
  const root = restRoot(creds.siteUrl);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${root}/wp-json${path}${method === "GET" ? `${sep}context=edit` : ""}`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: authHeader(creds),
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch (err: any) {
    // A site that is down, expired or behind DNS that no longer
    // resolves. Distinct from a refusal, and the owner can act on it.
    return { ok: false, reason: `Could not reach ${root} — ${err?.message ?? "no response"}.` };
  }

  const text = await res.text();
  if (!res.ok) return { ok: false, reason: describeFailure(res.status, text), status: res.status };

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    // A 200 that is not JSON means something answered in front of
    // WordPress — a cache, a maintenance page, a security plugin. It is
    // NOT a success, and treating it as an empty object would make the
    // adapter report a write that nothing performed.
    return { ok: false, reason: "That address answered, but not with WordPress REST data." };
  }
}
