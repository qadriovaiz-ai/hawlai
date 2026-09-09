// Saving the website address from chat.
//
// WHY THIS EXISTS: asked in chat to save their website, the assistant
// said it "can't" for account-security reasons and told the person to
// go and do it on a settings page. There was no such restriction. The
// field is an ordinary column on the business's own row, written by an
// ordinary session-authenticated route that the Website page and the
// Settings panel both call. No tool existed, and the model invented a
// policy to explain the gap.
//
// That is the same failure as the "go to Ads Manager" regression, in a
// smaller frame: a missing capability rationalised into a rule. The fix
// is the capability, and a test that the description tells the truth
// about it.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { BUSINESS_BRAIN_TOOLS } from "@/lib/businessBrain/toolRegistry";
import { normalizeAdUrl } from "@/lib/ads/destination";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

describe("the tool exists and claims no false restriction", () => {
  const tool = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "update_website_url");

  it("is registered", () => {
    expect(tool).toBeDefined();
  });

  it("does not describe itself as blocked or restricted", () => {
    // The invented policy, asserted against directly.
    expect(tool!.description.toLowerCase()).not.toMatch(/security|cannot|can't|not allowed|settings page/);
  });

  it("says it confirms before writing", () => {
    expect(tool!.description.toLowerCase()).toMatch(/confirm/);
  });
});

describe("the URL is validated the SAME way the ad path reads it", () => {
  it("accepts a bare domain, which is what people actually type", () => {
    expect(normalizeAdUrl("candlesbyqaaf.com")).toBe("https://candlesbyqaaf.com/");
  });

  it("keeps an explicit scheme", () => {
    expect(normalizeAdUrl("http://example.com/shop")).toBe("http://example.com/shop");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeAdUrl("  candlesbyqaaf.com  ")).toBe("https://candlesbyqaaf.com/");
  });

  it.each(["", "   ", "not a url at all", "javascript:alert(1)", "ftp://x/y"])(
    "rejects %s rather than storing something unusable",
    (bad) => {
      expect(normalizeAdUrl(bad)).toBeNull();
    }
  );

  it("what it accepts is exactly what resolveAdDestination will accept", async () => {
    // THE POINT OF SHARING THE VALIDATOR. Two definitions of "usable"
    // is how a value gets accepted at the settings step and silently
    // dropped at the launch step — leaving an ad with nowhere to go and
    // no explanation anywhere.
    const { resolveAdDestination } = await import("@/lib/ads/destination");
    for (const input of ["candlesbyqaaf.com", "https://example.com/shop", "http://x.in"]) {
      const stored = normalizeAdUrl(input)!;
      expect(stored).toBeTruthy();
      const dest = resolveAdDestination({ externalWebsiteUrl: stored });
      expect(dest.ok, `${stored} was storable but not usable as a destination`).toBe(true);
    }
  });
});

describe("the handler's behaviour, read from the committed source", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "update_website_url": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("the slice is not empty, so these assertions are not vacuous", () => {
    expect(handler.length).toBeGreaterThan(400);
  });

  it("does NOT write on the first call", () => {
    // Show, confirm, then write — the pattern used everywhere else.
    const confirmGate = handler.indexOf("input.confirmed !== true");
    const write = handler.indexOf('.update({ external_website_url');
    expect(confirmGate).toBeGreaterThan(-1);
    expect(confirmGate).toBeLessThan(write);
  });

  it("shows the OLD value alongside the new one", () => {
    // A confirmation that does not say what it is replacing is not a
    // confirmation.
    expect(handler).toMatch(/previous/);
    expect(handler).toMatch(/Change your website from \$\{previous\} to \$\{normalized\}/);
  });

  it("confirms the NORMALISED value, not the raw input", () => {
    // The normaliser may add https:// or a trailing slash. The person
    // should agree to what will actually be stored.
    expect(handler).toMatch(/Save \$\{normalized\} as your website address/);
  });

  it("scopes the write to this business's own row", () => {
    expect(handler).toMatch(/\.eq\("id", ctx\.id\)/);
  });

  it("rejects an unusable address instead of storing it", () => {
    expect(handler).toMatch(/doesn't look like a web address/);
  });
});

describe("the card shows what changed", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const card = brain.slice(
    brain.indexOf('case "update_website_url":', brain.indexOf("function extractArtifact")),
    brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("function extractArtifact"))
  );

  it("shows both the old and new values", () => {
    expect(card).toMatch(/label: "Was"/);
    expect(card).toMatch(/label: "Now"/);
  });
});
