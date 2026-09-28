// Every paid call is logged, and a failure says so (2026-09-27).
//
// THE BUG, and it ran for 90 days in silence. api_usage_logs had RLS on
// and exactly ONE policy — a SELECT policy. No INSERT policy existed
// anywhere in 201 migrations, so every insert made with a session-bound
// client (anon key + user cookie) was rejected by Postgres, and the
// logger's bare `catch {}` swallowed it without a word.
//
// What survived was cron and background work, which runs on a service
// client and bypasses RLS: ten operations and about ₹343 across three
// months. The AI Employee chat, content generation, captions, ad copy,
// research and every image wrote nothing — and a credit-pricing decision
// was about to be taken on top of that number.
//
// The fix is not an INSERT policy. api_usage_logs is billing data, and a
// policy for `authenticated` would let anyone holding the public anon key
// — which ships to every browser — write cost rows. RLS stays read-only
// and the logger writes through the service role.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

import {
  logClaudeUsage,
  logWebSearchUsage,
  logGeminiImageUsage,
  logVeoVideoUsage,
  logElevenLabsUsage,
  logPerplexityUsage,
  logVapiUsage,
} from "@/lib/usage/logUsage";

type Row = Record<string, any>;
let inserted: Row[];
let errors: string[];

function db(onInsert?: (row: Row) => void) {
  return {
    from: () => ({
      insert: async (row: Row) => {
        onInsert?.(row);
        inserted.push(row);
        return { error: null };
      },
    }),
  };
}

beforeEach(() => {
  inserted = [];
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: any[]) => {
    errors.push(args.map(String).join(" "));
  });
});
afterEach(() => vi.restoreAllMocks());

describe("what a usage row carries", () => {
  it("a Claude call records operation, both token counts, the model and a real cost", async () => {
    await logClaudeUsage(db(), "d1", "master_chat", 15500, 800, "claude-sonnet-4-6");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      dealership_id: "d1",
      service: "anthropic",
      operation: "master_chat",
      model: "claude-sonnet-4-6",
      input_tokens: 15500,
      output_tokens: 800,
    });
    // Priced from the real per-token rates, not a flat guess.
    expect(inserted[0].cost_inr).toBeGreaterThan(0);
  });

  it("each paid service writes its own row, named", async () => {
    await logWebSearchUsage(db(), "d1", "aeo_check", 3);
    await logGeminiImageUsage(db(), "d1", "graphic_design");
    await logVeoVideoUsage(db(), "d1", "video_generation");
    await logElevenLabsUsage(db(), "d1", "voiceover", 600);
    await logPerplexityUsage(db(), "d1", "research", 1500, 1200, "sonar-pro");
    await logVapiUsage(db(), "d1", "ai_call", 300);

    expect(inserted.map((r) => r.service)).toEqual(["anthropic", "gemini", "gemini", "elevenlabs", "perplexity", "vapi"]);
    for (const row of inserted) expect(row.cost_inr).toBeGreaterThan(0);
    // Web searches are billed on top of tokens, so they get their own row.
    expect(inserted[0].operation).toBe("aeo_check:web_search");
  });

  it("zero searches writes nothing rather than a zero-cost row", async () => {
    await logWebSearchUsage(db(), "d1", "aeo_check", 0);
    expect(inserted).toEqual([]);
  });
});

describe("a failure is never silent again", () => {
  it("A REJECTED INSERT IS REPORTED — the 90-day silence is what this prevents", async () => {
    const rejecting = { from: () => ({ insert: async () => { throw new Error("new row violates row-level security policy"); } }) };
    await logClaudeUsage(rejecting as any, "d1", "master_chat", 100, 50);
    expect(errors.join(" ")).toContain("[usage] claude log failed");
    expect(errors.join(" ")).toContain("row-level security");
  });

  it("and it still never breaks the feature that triggered it", async () => {
    const exploding = { from: () => { throw new Error("gone"); } };
    await expect(logClaudeUsage(exploding as any, "d1", "master_chat", 1, 1)).resolves.toBeUndefined();
    await expect(logGeminiImageUsage(exploding as any, "d1", "graphic_design")).resolves.toBeUndefined();
  });

  it("every logger names itself, so the Vercel line says which one broke", () => {
    const src = readFileSync("src/lib/usage/logUsage.ts", "utf8");
    for (const name of ["claude", "web search", "vapi", "gemini image", "veo video", "elevenlabs", "perplexity"]) {
      expect(src, name).toContain(`logFailed("${name}", err)`);
    }
    // No bare swallow left anywhere in the logger.
    expect(src).not.toMatch(/\}\s*catch\s*\{\s*\n\s*\/\/[^\n]*\n\s*\}/);
  });
});

describe("where the write goes, and where it can't go", () => {
  const src = readFileSync("src/lib/usage/logUsage.ts", "utf8");

  it("writes through the SERVICE role, so RLS cannot reject it", () => {
    expect(src).toContain("createServiceClient");
    expect(src.match(/usageClient\(supabase\)\.from\("api_usage_logs"\)/g) ?? []).toHaveLength(7);
  });

  it("RLS STAYS READ-ONLY — no INSERT policy is added, because the anon key ships to browsers", () => {
    const sql = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(sql).not.toMatch(/api_usage_logs[^;]*for insert/i);
    expect(sql).toMatch(/create policy[^;]*api_usage_logs[^;]*for select/i);
  });

  it("THE SERVICE CLIENT refuses to run in a browser, and is not reachable from one", () => {
    // Only the module holding the key guards this way. logUsage cannot:
    // it is still reachable from client bundles (a dozen components
    // import a server agent for its task list), and throwing there
    // blacked out four dashboard pages on 2026-09-28.
    expect(readFileSync("src/lib/supabase/service.ts", "utf8")).toContain('typeof window !== "undefined"');
    // Required lazily, so no bundler follows the edge into client code.
    expect(readFileSync("src/lib/usage/logUsage.ts", "utf8")).toContain('require("../supabase/service")');
    expect(readFileSync("src/lib/usage/logUsage.ts", "utf8")).not.toMatch(/^import \{ createServiceClient/m);
  });

  it("AND NO CLIENT COMPONENT IMPORTS EITHER — the check that keeps it out of a bundle", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const body = readFileSync(path, "utf8");
          if (!/^\s*["']use client["']/m.test(body)) continue;
          if (/usage\/logUsage|supabase\/service/.test(body)) offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("falls back to the caller's client when there is no service key, so tests and local runs still work", async () => {
    // This suite has no SUPABASE_SERVICE_ROLE_KEY, and the rows above
    // landed in the injected fake — which is the fallback working.
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeFalsy();
    await logClaudeUsage(db(), "d1", "content_generation", 10, 10);
    expect(inserted).toHaveLength(1);
  });
});

// ---- Fix D: the guard that stops this regressing -------------------------
//
// Reads each call's real argument span by matching parentheses, rather
// than a fixed window — two sites pass a huge prompt before their options
// object, and two pass the options as a variable built a line earlier. A
// naive scan calls all four unlogged, which would make this guard cry wolf
// until somebody deleted it.
function callSpan(src: string, at: number): string {
  let depth = 0;
  for (let i = src.indexOf("(", at); i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return src.slice(at, at + 4000);
}

/**
 * Just the LAST argument of the call — the options object.
 *
 * Scanning the whole call span is what made an earlier version of this
 * guard useless: the prompt body of one site happens to contain the word
 * "logContext", so removing the real option still passed. Splitting on
 * top-level commas leaves only the argument that actually carries it.
 */
function lastArgument(span: string): string {
  const open = span.indexOf("(");
  let depth = 0;
  let lastComma = -1;
  for (let i = open; i < span.length; i++) {
    const ch = span[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 1) lastComma = i;
  }
  return lastComma < 0 ? span.slice(open) : span.slice(lastComma + 1, span.length - 1);
}

/** The span, plus the declaration of any options variable it passes. */
function resolvedOptions(src: string, span: string): string {
  const arg = lastArgument(span).trim();
  // Options passed as a variable: resolve its declaration, or the guard
  // would call two legitimate sites unlogged and get itself deleted.
  const variable = arg.match(/^([A-Za-z_$][\w$]*)$/);
  if (!variable) return arg;
  // Double-escaped on purpose: inside a template literal a single "\s"
  // is just "s", which silently turns this into a regex that matches
  // nothing — and a guard that matches nothing passes everything.
  const declared = src.match(new RegExp(`(?:const|let)\\s+${variable[1]}\\s*=\\s*\\{[^;]*;`));
  return arg + (declared ? declared[0] : "");
}

function claudeCallSites(): { file: string; opts: string }[] {
  const out: { file: string; opts: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        if (path.endsWith("lib/ai/claude.ts")) continue; // the wrapper itself
        const src = readFileSync(path, "utf8");
        let from = 0;
        while (true) {
          const at = src.indexOf("callClaude(", from);
          if (at < 0) break;
          from = at + 1;
          out.push({ file: path, opts: resolvedOptions(src, callSpan(src, at)) });
        }
      }
    }
  };
  walk("src");
  return out;
}

describe("no paid Claude call can be added without logging", () => {
  const sites = claudeCallSites();

  it("finds every call site", () => {
    // A sanity floor: if this drops sharply the scanner broke, not the code.
    expect(sites.length).toBeGreaterThan(40);
  });

  it("EVERY SITE PASSES AN OPERATION — an unnamed call is unattributable spend", () => {
    const unnamed = sites.filter((s) => !/operation\s*[:,}]/.test(s.opts));
    expect(unnamed.map((s) => s.file)).toEqual([]);
  });

  it("EVERY SITE PASSES A LOG CONTEXT — the check that would have caught the three that didn't", () => {
    const unlogged = sites.filter((s) => !/logContext/.test(s.opts));
    expect(unlogged.map((s) => s.file)).toEqual([]);
  });

  it("and the scanner really does reject a call with no log context", () => {
    // Proof the guard can fail: the same predicate against a fabricated site.
    const fake = { file: "fake.ts", opts: 'callClaude(body, { operation: "x" })' };
    expect(/logContext/.test(fake.opts)).toBe(false);
  });
});

describe("the business a row is billed to always comes from the server", () => {
  it("no route derives a logged dealership id from the request body or query string", () => {
    // The four routes that read dealership_id from the query string
    // (leads, calls, appointments, analytics) make no AI calls, so they
    // log nothing. Any route that DOES log must derive it from the
    // session — profiles.dealership_id keyed on the authenticated user.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts") {
          const src = readFileSync(path, "utf8");
          const logs = /logContext|logClaudeUsage|logGeminiImageUsage|logVeoVideoUsage|logElevenLabsUsage|logPerplexityUsage/.test(src);
          if (!logs) continue;
          const fromClient = /dealership_?[iI]d\s*[=:]\s*(body|searchParams\.get|params\.)/.test(src);
          if (fromClient) offenders.push(path);
        }
      }
    };
    walk("src/app/api");
    expect(offenders).toEqual([]);
  });
});
