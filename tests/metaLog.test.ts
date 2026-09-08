// [meta] — the log tag, and the one rule it must never break.
//
// The Meta path handles a Page access token that can spend the
// merchant's money. A token in a Vercel log is a credential in a
// system with a different access boundary than the database it came
// from, and log retention on Hobby is an hour but a leaked token
// outlives that by ninety days.

import { describe, it, expect } from "vitest";
import { __renderForTest as render } from "@/lib/ads/metaLog";
import { execFileSync } from "child_process";

describe("credentials never reach a log line", () => {
  it.each(["token", "access_token", "page_access_token", "secret", "password"])(
    "redacts a STRING under a %s-ish key",
    (key) => {
      const line = render("call", { [key]: "EAAG-a-real-looking-token" });
      expect(line).not.toContain("EAAG-a-real-looking-token");
      expect(line).toContain("[redacted]");
    }
  );

  it("redacts the raw image payload, which is enormous and useless in a log", () => {
    const line = render("call", { bytes: "iVBORw0KGgoAAAANSUhEUg".repeat(50) });
    expect(line).not.toContain("iVBORw0KGgo");
  });

  it("does NOT redact a boolean presence flag, which is the whole diagnostic", () => {
    // THE BUG THIS FILE CAUGHT. Redacting on the key name alone turned
    // `has_token=false` into `has_token=[redacted]`, so
    // launch.not_connected — whose entire job is to say WHICH of the
    // three connection fields is missing — reported nothing usable.
    //
    // A boolean cannot be a credential. Only strings are redacted.
    const line = render("launch.not_connected", { has_token: false, has_ad_account: true, has_page: true });
    expect(line).toBe("[meta] launch.not_connected has_token=false has_ad_account=true has_page=true");
  });

  it("does not redact a numeric budget that happens to sit beside a token field", () => {
    expect(render("adset", { budget_paise: 50000 })).toContain("budget_paise=50000");
  });
});

describe("the line is readable and complete", () => {
  it("carries one tag, so a single filter returns the whole story", () => {
    expect(render("launch.start", { dealership: "d1" }).startsWith("[meta] launch.start")).toBe(true);
  });

  it("omits undefined but KEEPS null", () => {
    // null means "asked, and there was none" — a real observation.
    // undefined means the caller never supplied it. Collapsing them
    // loses the difference between "Meta returned no subcode" and
    // "we forgot to log the subcode".
    const line = render("call.failed", { code: null, subcode: undefined });
    expect(line).toContain("code=null");
    expect(line).not.toContain("subcode");
  });

  it("quotes values containing spaces so the fields stay parseable", () => {
    expect(render("call.failed", { detail: "Invalid parameter value" })).toContain('detail="Invalid parameter value"');
  });
});

describe("the call sites are clean", () => {
  it("never passes a params or body object wholesale to the logger", () => {
    // The single shape that would leak a token: metaPost's `params`
    // gains access_token when it is spread into the request body, so
    // `metaLog("call", params)` would print it. Call sites must name
    // their fields.
    const source = execFileSync("git", ["show", "HEAD:src/lib/adEngine.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(source).not.toMatch(/meta(Log|Error)\(\s*["'][^"']*["']\s*,\s*(params|body|\.\.\.params)\s*\)/);
  });

  it("logs before the Graph call, so a timeout still leaves a record", () => {
    // A launch makes five sequential calls in one try block. Logging
    // only on success means the one that hung is the one with no line.
    const source = execFileSync("git", ["show", "HEAD:src/lib/adEngine.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const fn = source.slice(source.indexOf("export async function metaPost"), source.indexOf("export async function resolveCityKey"));
    expect(fn.indexOf('metaLog("call"')).toBeGreaterThan(-1);
    expect(fn.indexOf('metaLog("call"')).toBeLessThan(fn.indexOf("await fetch("));
  });
});
