// ------------------------------------------------------------------
// Verification of Canva's return-navigation JWT (`correlation_jwt`).
// ------------------------------------------------------------------
// When someone finishes editing and clicks Canva's Return button, they
// land back here with a signed JWT naming the design they worked on.
// Canva's guidance is explicit that the signature must be checked
// against their published keys, so it is — this arrives as a URL
// parameter in a redirect, which means anyone can put anything there.
//
// Verified details:
//   JWKS   https://api.canva.com/rest/v1/connect/keys
//   claims aud (our client id), exp (1 day), sub (Canva user id),
//          team_id, type ("rti"), jti, design_id, correlation_state
//
// Implemented on node:crypto rather than pulling in a JWT library.
// Canva's own example uses `jose`, but this is one algorithm family
// and one endpoint; a dependency that ships its own JWKS cache, clock
// skew handling and algorithm negotiation is more surface than the job
// needs. The signing algorithm isn't documented, so both RSA and EC
// are handled by reading the key type rather than hardcoding a guess.
// ------------------------------------------------------------------

import crypto from "crypto";

const JWKS_URL = "https://api.canva.com/rest/v1/connect/keys";

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  [k: string]: unknown;
}

export interface CorrelationClaims {
  aud: string;
  exp: number;
  sub: string;
  team_id?: string;
  type: string;
  jti: string;
  design_id: string;
  correlation_state?: string;
}

// Small in-process cache. Canva rotates these rarely, and refetching
// on every return would put their availability in the path of our
// redirect handler. Deliberately short so a rotation heals on its own
// within minutes rather than needing a redeploy.
let cache: { keys: Jwk[]; fetchedAt: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function getKeys(forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Could not fetch Canva's signing keys (${res.status}).`);
  const body = (await res.json()) as { keys?: Jwk[] };
  if (!body.keys?.length) throw new Error("Canva's key endpoint returned no keys.");

  cache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/**
 * RSA signatures are PKCS#1 v1.5 over the raw bytes; EC (ES256) uses a
 * fixed-width r||s pair, which node needs told about explicitly via
 * dsaEncoding — without it an otherwise valid ES256 token fails to
 * verify, which is a genuinely confusing way to lose an hour.
 */
function verifySignature(jwk: Jwk, signingInput: string, signature: Buffer): boolean {
  const keyObject = crypto.createPublicKey({ key: jwk as any, format: "jwk" });

  if (jwk.kty === "RSA") {
    return crypto.verify("sha256", Buffer.from(signingInput), keyObject, signature);
  }
  if (jwk.kty === "EC") {
    return crypto.verify(
      "sha256",
      Buffer.from(signingInput),
      { key: keyObject, dsaEncoding: "ieee-p1363" },
      signature
    );
  }
  throw new Error(`Unsupported Canva key type "${jwk.kty}".`);
}

/**
 * Verifies signature and claims, returning the payload.
 *
 * Throws on anything suspect rather than returning a partial result —
 * every caller here acts on design_id, and acting on an unverified one
 * is the whole risk this function exists to remove.
 */
export async function verifyCorrelationJwt(token: string): Promise<CorrelationClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed return token.");

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(b64urlToBuffer(headerB64).toString("utf8")) as { kid?: string; alg?: string };
  if (!header.kid) throw new Error("Return token has no key id.");
  if (header.alg === "none") throw new Error("Return token is unsigned.");

  let keys = await getKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Unknown kid most often means Canva rotated keys since our cache
    // was filled, so one forced refetch is tried before giving up.
    keys = await getKeys(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("Return token was signed with an unrecognised key.");

  const ok = verifySignature(jwk, `${headerB64}.${payloadB64}`, b64urlToBuffer(signatureB64));
  if (!ok) throw new Error("Return token signature is invalid.");

  const claims = JSON.parse(b64urlToBuffer(payloadB64).toString("utf8")) as CorrelationClaims;

  // A valid signature only proves Canva issued it — not that it was
  // issued for us, recently, or for this purpose.
  const clientId = process.env.CANVA_CLIENT_ID;
  if (clientId && claims.aud !== clientId) throw new Error("Return token was issued for a different integration.");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Return token has expired.");
  if (claims.type !== "rti") throw new Error(`Unexpected return token type "${claims.type}".`);
  if (!claims.design_id) throw new Error("Return token names no design.");

  return claims;
}
