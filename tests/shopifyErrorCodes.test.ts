// Every failure the Shopify callback can emit must have its own
// distinct message.
//
// FROM 2026-09-04, and this one cost a full round of debugging. Two
// separate failures could produce a scope complaint:
//
//   scope_not_granted   — the token came back without a needed scope
//   missing_scope       — products.json returned 403
//
// Only the first was updated when the diagnostics improved. So when
// the scope fix landed and the flow got FURTHER than ever before,
// reaching the second branch for the first time, the unchanged
// wording looked exactly like a stale deploy. A working fix was read
// as a build that had never shipped, and the next step taken was to
// investigate CDN caching rather than the new failure.
//
// Two guarantees here: no code can be emitted without a message, and
// no two messages may be near-identical.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

const routeSrc = committed("src/app/api/integrations/shopify/callback/route.ts");
const authSrc = committed("src/lib/commerce/shopifyAuth.ts");
const uiSrc = committed("src/components/settings/ShopifyConnect.tsx");

/** Codes emitted directly, plus those reached through a variable. */
function emittedCodes(): string[] {
  const literal = [...routeSrc.matchAll(/shopify_error=([a-z_]+)/g)].map((m) => m[1]);
  // `shopify_error=${reason}` — the ternary values assigned to it.
  const viaReason = [...routeSrc.matchAll(/reason\s*=\s*[^;]*?"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)].flatMap((m) => [m[1], m[2]]);
  // `shopify_error=${check.reason}` — the CallbackCheck failure union.
  const viaCheck = [...authSrc.matchAll(/ok:\s*false,\s*reason:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  return [...new Set([...literal, ...viaReason, ...viaCheck])];
}

/** Keys of the SHOPIFY_ERRORS map in the UI. */
function uiMessages(): Record<string, string> {
  const block = uiSrc.slice(uiSrc.indexOf("SHOPIFY_ERRORS"), uiSrc.indexOf("};", uiSrc.indexOf("SHOPIFY_ERRORS")));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{2}([a-z_]+):\s*"((?:[^"\\]|\\.)*)"/gm)) out[m[1]] = m[2];
  return out;
}

describe("Shopify callback error codes", () => {
  const codes = emittedCodes();
  const messages = uiMessages();

  it("finds the codes and the messages at all", () => {
    // Vacuity guard — if either extractor silently returns nothing,
    // every assertion below passes while checking nothing.
    expect(codes.length).toBeGreaterThan(5);
    expect(Object.keys(messages).length).toBeGreaterThan(5);
  });

  it("gives every emitted code its own message", () => {
    // A code with no entry falls through to "Couldn't connect to
    // Shopify. Try again." — which is wrong for every failure here,
    // since almost none of them are retryable.
    const orphaned = codes.filter((c) => !(c in messages));
    expect(orphaned, `emitted with no message: ${orphaned.join(", ")}`).toEqual([]);
  });

  it("has no message for a code that can never be emitted", () => {
    // Dead entries are how a stale string survives a rename — which
    // is precisely how missing_scope outlived its own fix.
    const dead = Object.keys(messages).filter((m) => !codes.includes(m));
    expect(dead, `message for un-emittable code: ${dead.join(", ")}`).toEqual([]);
  });

  it("keeps the two scope failures clearly distinguishable", () => {
    // THE LOAD-BEARING ONE. These describe different stages and must
    // not read alike, or a fix that advances the flow is
    // indistinguishable from a deploy that never landed.
    const a = messages.scope_not_granted;
    const b = messages.products_forbidden;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);

    // Beyond mere inequality: they must not share a long opening
    // phrase, which is all a user actually reads before deciding
    // "same error as last time".
    const opening = (s: string) => s.slice(0, 40).toLowerCase();
    expect(opening(a)).not.toBe(opening(b));
  });

  it("never blames the merchant for a failure on our side", () => {
    // "Check you're an admin on that store" sent the user auditing
    // their own permissions for a bug in our health check. Scope and
    // configuration failures are always ours.
    for (const code of ["scope_not_granted", "products_forbidden", "not_configured"]) {
      const message = messages[code] ?? "";
      expect(message.toLowerCase(), `${code} must not blame the merchant`).not.toMatch(/check you'?re an admin/);
    }
  });
});
