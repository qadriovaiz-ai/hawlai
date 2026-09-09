// The Meta Page access token is never read in the clear.
//
// THE FAILURE THIS PREVENTS is silent and total. Once the backfill
// nulls the plaintext column, any query that still selects only
// `fb_page_access_token` returns null — and the Meta token is read by
// lead ingestion, ad launch, campaign activation, autopilot posting,
// auto-reply, analytics, strategy and retargeting. A single missed
// select does not fail that one feature; it looks like "Facebook
// disconnected itself" across eight surfaces at once, hours after a
// deploy that touched none of them.
//
// Thirteen files and forty sites were converted by hand. Twice in this
// project a fix of mine has missed a sibling occurrence, and both times
// a test pinned to one instance stayed green. So the guarantee is not
// that I was careful — it is this file, which fails if ANY source file
// reads the column directly or selects it without its encrypted
// companion.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "c".repeat(64);

import {
  META_PAGE_TOKEN_SELECT,
  readMetaPageToken,
  hasMetaPageToken,
  metaPageTokenWrite,
} from "@/lib/crypto/oauthSecrets";

const PLAIN = "fb_page_access_token";
const ENC = "fb_page_access_token_encrypted";
const ACCESSOR_FILE = "src/lib/crypto/oauthSecrets.ts";

/** Every tracked source file, from git rather than a directory walk. */
function sourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("no source file reads the plaintext column directly", () => {
  it("finds no property access on .fb_page_access_token outside the accessor", () => {
    // `.fb_page_access_token` NOT followed by `_encrypted` — the
    // word-boundary matters, since the plaintext name is a prefix of
    // the encrypted one and a naive search reports the correct code as
    // a violation.
    const pattern = /\.fb_page_access_token(?!_encrypted)\b/;
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      if (file === ACCESSOR_FILE) continue;
      const source = read(file);
      source.split("\n").forEach((line, i) => {
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
        if (pattern.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }

    expect(
      offenders,
      `these read the plaintext Meta token directly instead of readMetaPageToken():\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("scanned a meaningful number of files, so the sweep is not vacuous", () => {
    // A broken git invocation or a bad filter would make the check
    // above pass over nothing at all.
    expect(sourceFiles().length).toBeGreaterThan(100);
  });
});

describe("every select that reads the token also selects the encrypted column", () => {
  it("finds no select() naming only the plaintext column", () => {
    // THE ONE THAT MATTERS AFTER THE BACKFILL. Reading via the
    // accessor is not enough if the query never fetched the encrypted
    // column — resolveSecret would get undefined and fall through to a
    // plaintext value that is now null.
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      if (file === ACCESSOR_FILE) continue;
      const source = read(file);

      // Each .select("...") / .select('...') argument, whole.
      for (const match of source.matchAll(/\.select\(\s*(["'])([\s\S]*?)\1/g)) {
        const columns = match[2];
        if (!columns.includes(PLAIN)) continue;
        if (!columns.includes(ENC)) {
          offenders.push(`${file}  select(${columns.slice(0, 80)}...)`);
        }
      }
    }

    expect(
      offenders,
      `these select the plaintext Meta token without its encrypted companion — they return null once the backfill runs:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the exported select constant names both columns", () => {
    expect(META_PAGE_TOKEN_SELECT).toContain(PLAIN);
    expect(META_PAGE_TOKEN_SELECT).toContain(ENC);
  });
});

describe("the accessor itself", () => {
  it("prefers the encrypted value over a stale plaintext one", () => {
    // Both columns populated is the state DURING the backfill. If
    // plaintext won, a token rotated after encryption began would be
    // silently ignored in favour of the old one.
    const row = { ...metaPageTokenWrite("NEW_TOKEN"), fb_page_access_token: "OLD_TOKEN" };
    expect(readMetaPageToken(row)).toBe("NEW_TOKEN");
  });

  it("falls back to plaintext before the backfill has run", () => {
    expect(readMetaPageToken({ fb_page_access_token: "LEGACY", fb_page_access_token_encrypted: null })).toBe("LEGACY");
  });

  it("round-trips through encryption", () => {
    const written = metaPageTokenWrite("EAAG-page-token");
    expect(written.fb_page_access_token_encrypted).not.toContain("EAAG-page-token");
    expect(readMetaPageToken(written)).toBe("EAAG-page-token");
  });

  it("NULLS the plaintext column on write, so a connect never stores it in the clear", () => {
    // Shrinks the exposure window to "until the next connect" rather
    // than freezing it until the plaintext column is dropped.
    expect(metaPageTokenWrite("x").fb_page_access_token).toBeNull();
  });

  it("returns null when neither column holds anything", () => {
    for (const row of [null, undefined, {}, { fb_page_access_token: null, fb_page_access_token_encrypted: null }]) {
      expect(readMetaPageToken(row as any)).toBeNull();
    }
  });

  it("hasMetaPageToken answers without decrypting", () => {
    // A connectedness check must not depend on the key ring. If it
    // did, a key misconfiguration would read as "not connected" — and
    // the obvious response to that is to reconnect, overwriting a
    // perfectly good token.
    expect(hasMetaPageToken({ fb_page_access_token_encrypted: "v1:not:valid:ciphertext" })).toBe(true);
    expect(hasMetaPageToken({ fb_page_access_token: "LEGACY" })).toBe(true);
    expect(hasMetaPageToken({})).toBe(false);
  });

  it("survives ciphertext it cannot decrypt by falling back, not throwing", () => {
    // A throw here would take down lead ingestion and autopilot, not
    // just the one caller.
    expect(() =>
      readMetaPageToken({ fb_page_access_token_encrypted: "v1:bad:bad:bad", fb_page_access_token: "LEGACY" })
    ).not.toThrow();
    expect(readMetaPageToken({ fb_page_access_token_encrypted: "v1:bad:bad:bad", fb_page_access_token: "LEGACY" })).toBe("LEGACY");
  });
});

describe("the connect path writes encrypted", () => {
  it("finalize stores via metaPageTokenWrite, not a raw column assignment", () => {
    const source = read("src/app/api/auth/facebook/finalize/route.ts");
    expect(source).toContain("metaPageTokenWrite(");
    expect(source).not.toMatch(/fb_page_access_token:\s*page\.access_token/);
  });
});
