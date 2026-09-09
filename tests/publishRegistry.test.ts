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

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "e".repeat(64);

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** Platforms any caller actually passes to createPublishAction. */
function producedPlatforms(): string[] {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const found = new Set<string>();
  for (const m of brain.matchAll(/platform:\s*"([a-z_]+)"/g)) found.add(m[1]);
  return [...found];
}

describe("the registry is complete", () => {
  const registry = createPlatformRegistry({} as any);

  it("RUNTIME: registers shopify and meta", () => {
    expect(Object.keys(registry).sort()).toEqual(["meta", "shopify"]);
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
    // wordpress and woocommerce are declared in PlatformId and have no
    // caller. A stub would make the executor claim success on a publish
    // that never happened, which is worse than the honest error.
    expect(registry).not.toHaveProperty("wordpress");
    expect(registry).not.toHaveProperty("woocommerce");
  });

  it("the approve route uses the shared registry, not its own literal", () => {
    // The original bug was an inline object nobody could inspect.
    const route = committed("src/app/api/approvals/[id]/route.ts");
    expect(route).toMatch(/createPlatformRegistry\(service\)/);
    expect(route).not.toMatch(/platforms:\s*\{\s*shopify:/);
  });
});
