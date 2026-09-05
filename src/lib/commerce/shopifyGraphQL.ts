// The single door to Shopify's Admin GraphQL API.
//
// WHY GRAPHQL AT ALL: Shopify deprecated the REST /products and
// /variants endpoints for public apps (deadline 1 Feb 2025, long
// past). Product writes are not available over REST to an app like
// this one, so this is not a modernisation — it is the only door left.
//
// THE TRAP THIS EXISTS TO CLOSE. GraphQL answers HTTP 200 for most
// failures, so `if (!res.ok)` — the shape every REST caller in this
// codebase uses — catches almost nothing. There are THREE layers:
//
//   1. HTTP non-2xx        — transport, auth, throttling
//   2. body.errors[]       — 200. Bad query, bad variables, no access
//   3. userErrors[]        — 200, and `errors` is absent too. The
//                            request was valid and Shopify DECLINED
//                            it: price rejected, variant not found,
//                            product archived
//
// Layer 3 is the dangerous one. A price update that Shopify refuses
// returns 200 with an empty `errors` array and a populated
// `userErrors`, so a caller checking only res.ok and errors records a
// successful price change that never happened — and the merchant
// finds out from their own storefront.
//
// So mutations go through shopifyMutation(), which REQUIRES the path
// to userErrors. Forgetting is not possible; it is a type error.

import { SHOPIFY_API_VERSION } from "./shopifyAuth";

export type UserError = { field?: string[] | null; message: string };

export type GraphQLResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; userErrors?: UserError[] };

/** Shopify's own message, unwrapped from whichever layer produced it. */
function firstMessage(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0] as { message?: string };
  return typeof first?.message === "string" ? first.message : null;
}

/**
 * A GraphQL QUERY. Reads only.
 *
 * Handles layers 1 and 2. Queries have no userErrors — that concept
 * belongs to mutations — so there is no third layer to forget here.
 */
export async function shopifyGraphQL<T = unknown>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch
): Promise<GraphQLResult<T>> {
  try {
    const res = await fetchImpl(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    // Read as text first, then parse. A throttle page or a proxy error
    // is not JSON, and `await res.json()` would throw — losing the
    // body that explains why. The same discarded-evidence mistake the
    // OAuth callback made three times.
    const raw = await res.text().catch(() => "");
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, reason: `Shopify returned a non-JSON response (${res.status}): ${raw.slice(0, 200)}` };
    }

    // Layer 1.
    if (!res.ok) {
      return { ok: false, reason: firstMessage(body?.errors) ?? `Shopify returned ${res.status}` };
    }

    // Layer 2 — HTTP 200, but the query itself was rejected.
    const topLevel = firstMessage(body?.errors);
    if (topLevel) return { ok: false, reason: topLevel };

    if (body?.data === undefined || body?.data === null) {
      return { ok: false, reason: "Shopify returned no data" };
    }

    return { ok: true, data: body.data as T };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Couldn't reach Shopify" };
  }
}

/**
 * A GraphQL MUTATION. Writes.
 *
 * `mutationName` is REQUIRED and is not decoration — it is the path to
 * that mutation's userErrors, and demanding it is what makes layer 3
 * impossible to skip. A mutation sent through shopifyGraphQL() would
 * compile and would silently report success on a declined write; that
 * is precisely why mutations have their own function.
 */
export async function shopifyMutation<T = unknown>(
  shop: string,
  accessToken: string,
  mutation: string,
  variables: Record<string, unknown>,
  mutationName: string,
  fetchImpl: typeof fetch = fetch
): Promise<GraphQLResult<T>> {
  const result = await shopifyGraphQL<Record<string, any>>(shop, accessToken, mutation, variables, fetchImpl);
  if (!result.ok) return result;

  const payload = result.data?.[mutationName];
  if (payload === undefined) {
    // A typo in mutationName would otherwise read as "no userErrors,
    // therefore success" — the exact failure this function exists to
    // prevent, reintroduced by a spelling mistake.
    return { ok: false, reason: `Shopify response has no "${mutationName}" field — the mutation name does not match the query` };
  }

  // Layer 3.
  const userErrors: UserError[] = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
  if (userErrors.length > 0) {
    const detail = userErrors.map((e) => (e.field?.length ? `${e.field.join(".")}: ${e.message}` : e.message)).join("; ");
    return { ok: false, reason: detail, userErrors };
  }

  return { ok: true, data: payload as T };
}
