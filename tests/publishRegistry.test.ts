// Every platform that can produce a publish action must be executable.
//
// THE BUG: the registry was an object literal inline in the approve
// route holding one entry, "shopify". createPublishAction could be
// called with "meta", so a Meta campaign was proposed, previewed and
// approved exactly like a price change -- and then the executor said
// "No platform module for 'meta'", AFTER the human had said yes.
//
// A missing entry is not a compile error and not a runtime error until
// the approve click. PlatformId listed four platforms, the registry
// held one, and nothing connected the two.
//
// Two halves again, labelled: a RUNTIME half that calls the registry
// and reads what is in it, and a STRUCTURAL half that scans the source
// for which platforms are actually produced. Neither is sufficient
// alone -- the runtime half cannot know what callers pass, and the
// structural half cannot know what the registry contains.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { createPlatformRegistry } from "@/lib/publish/registry";
import { code } from "./helpers/source";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "e".repeat(64);

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Platforms any caller actually passes to createPublishAction.
 *
 * THE WORKING TREE, NOT HEAD — changed 22 November 2026, and it is a
 * correction rather than a preference. This read `git show HEAD:` and
 * therefore validated the LAST COMMIT: a producer and its registry
 * entry added together passed only because neither was visible yet,
 * and the mismatch this file exists to catch would have been caught
 * one commit late, which is after the approve click it is about.
 *
 * AND THROUGH `code()`, so comments do not count as producers. The old
 * form would have read `platform: "woocommerce"` inside a comment
 * explaining why woocommerce has no producer as proof that it has one
 * — rule 8, in the one place that would have been quietly reassuring.
 */
function producedPlatforms(): string[] {
  const brain = code("src/lib/agents/masterBrainV2.ts");
  const found = new Set<string>();
  for (const m of brain.matchAll(/platform:\s*"([a-z_]+)"/g)) found.add(m[1]);
  return [...found];
}

describe("the registry is complete", () => {
  const registry = createPlatformRegistry({} as any);

  it("RUNTIME: registers shopify, meta, the business's own storefront and website, and WordPress", () => {
    // wordpress joined on 22 November 2026, in the same commit as its
    // first producer — see the registry's own comment for why that
    // ordering is a rule rather than a preference.
    expect(Object.keys(registry).sort()).toEqual(["hawlai_shop", "hawlai_site", "meta", "shopify", "wordpress"]);
  });

  it("RUNTIME: every registered module declares what it supports", () => {
    for (const [id, mod] of Object.entries(registry)) {
      expect(mod!.id, `${id} module reports a different id`).toBe(id);
      expect(mod!.supports.length, `${id} supports nothing, so it can never execute`).toBeGreaterThan(0);
    }
  });

  it("STRUCTURAL + RUNTIME: every platform a caller can propose is registered", () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT IT. "meta" appeared in a
    // createPublishAction call while the registry held only "shopify".
    const produced = producedPlatforms();
    expect(produced.length, "found no producers — the scan is vacuous").toBeGreaterThan(0);

    const missing = produced.filter((p) => !(p in registry));
    expect(
      missing,
      `these platforms can reach approval but have no executable module — approving one fails with "No platform module for '<x>'" after the human has said yes:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("does NOT stub platforms that have no producer", () => {
    // A stub would make the executor claim success on a publish that
    // never happened, which is worse than the honest error.
    //
    // DERIVED, NOT A LIST — rewritten 22 November 2026 when wordpress
    // gained a producer and had to come off the hard-coded side. The
    // old form named the two platforms, so it had to be edited by hand
    // every time one of them graduated, and a PlatformId added later
    // would never have been covered at all. Together with the
    // assertion above — every platform a caller can propose IS
    // registered — this now pins both directions for every platform
    // that exists, including ones nobody has thought of yet.
    const produced = new Set(producedPlatforms());
    const stubbed = Object.keys(registry).filter((id) => !produced.has(id));
    expect(
      stubbed,
      `these are registered but nothing produces them, so the entry is unreachable code that looks wired:\n  ${stubbed.join("\n  ")}`
    ).toEqual([]);

    // NOT VACUOUS: woocommerce is the one still waiting, and it must
    // stay out until it has a producer of its own.
    expect(produced.has("woocommerce"), "woocommerce gained a producer — it needs a registry entry too").toBe(false);
    expect(registry).not.toHaveProperty("woocommerce");
  });

  it("the approve route uses the shared registry, not its own literal", () => {
    // The original bug was an inline object nobody could inspect.
    // H1 MOVED THE DECISION out of the route and into
    // lib/approvals/decide.ts, so the WhatsApp channel reaches the same
    // one instead of a second copy. These assertions are unchanged; only
    // the file they read moved. The route still holds the session half.
    const route = committed("src/lib/approvals/decide.ts");
    expect(route).toMatch(/createPlatformRegistry\(service\)/);
    expect(route).not.toMatch(/platforms:\s*\{\s*shopify:/);
  });
});
