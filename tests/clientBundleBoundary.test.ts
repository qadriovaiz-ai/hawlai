// The guard that would have caught the 2026-09-28 outage before it shipped.
//
// A component marked "use client" is the entry point of a browser bundle,
// and the bundler pulls in EVERYTHING it value-imports, then everything
// those files import, all the way down. So a module can end up in browser
// JavaScript without a single client file naming it — which is exactly
// what happened: lib/usage/logUsage added one import of
// lib/supabase/service, and fifteen client components inherited it through
// a chain four modules long.
//
// The old check in usageLogging.test.ts only looked at direct imports of
// client files. It passed the whole time the pages were black. This one
// walks the graph.
//
// What counts as an edge: a value `import`/`export ... from`, and a
// dynamic `import()`. What does not: `import type` (erased before it
// reaches the bundler) and a `require()` inside a function body (not a
// static edge, which is why the fix uses one). Both of those are the
// sanctioned ways to reference a server module's types or internals from
// a file that the browser might load.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";

/**
 * Modules that must never end up in browser JavaScript, and why. Add to
 * this list rather than trusting a code review to notice.
 */
const SERVER_ONLY = [
  // Holds SUPABASE_SERVICE_ROLE_KEY, which bypasses every RLS policy in
  // the database. It throws on evaluation in a browser; being in a bundle
  // at all is the bug, and the throw is only the symptom.
  "src/lib/supabase/service.ts",
  // Reads MARKETING_ENCRYPTION_KEY / COMMERCE_ENCRYPTION_KEY and
  // decrypts stored OAuth tokens. A chat card nearly pulled it into the
  // browser by naming the one pure function that happened to sit next
  // to it (lib/chat/postConfirm.ts exists because of that).
  "src/lib/crypto/secretCrypto.ts",
];

const SOURCE = /\.tsx?$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (isSource(entry.name)) out.push(path);
  }
  return out;
}
function isSource(name: string) {
  return SOURCE.test(name) && !name.endsWith(".d.ts");
}

/** Comments are stripped first: a `from` inside prose is not an import. */
function stripComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/**
 * True when nothing in this import clause survives compilation — either
 * `import type { X }` or `import { type X, type Y }`. Those create no
 * bundler edge, so they are the approved way to share a type with a
 * client file.
 */
function typeOnly(clause: string): boolean {
  const c = clause.trim();
  if (/^type\b/.test(c)) return true;
  const braced = c.match(/^\{([\s\S]*)\}$/);
  if (!braced) return false;
  const specifiers = braced[1].split(",").map((s) => s.trim()).filter(Boolean);
  return specifiers.length > 0 && specifiers.every((s) => /^type\b/.test(s));
}

function importedSpecifiers(body: string): string[] {
  const src = stripComments(body);
  const specs: string[] = [];

  // import X from "m" / export { X } from "m" — the clause may wrap lines.
  const withClause = /^[ \t]*(?:import|export)[ \t]+([\s\S]{0,400}?)[ \t\n]from[ \t\n]*["']([^"']+)["']/gm;
  for (const m of src.matchAll(withClause)) if (!typeOnly(m[1])) specs.push(m[2]);

  // import "m" — side effect, still bundled.
  for (const m of src.matchAll(/^[ \t]*import[ \t]+["']([^"']+)["']/gm)) specs.push(m[1]);

  // await import("m") / next/dynamic — lazily fetched, but still shipped.
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) specs.push(m[1]);

  return specs;
}

function resolve(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    const parts = fromFile.split("/").slice(0, -1);
    for (const segment of spec.split("/")) {
      if (segment === "." || segment === "") continue;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    }
    base = parts.join("/");
  } else return null; // a package — not ours to police

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (isSource(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

const files = sourceFiles("src");
const bodies = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

const graph = new Map<string, string[]>(
  files.map((f) => [f, importedSpecifiers(bodies.get(f)!).map((s) => resolve(f, s)).filter((x): x is string => !!x)])
);

const clientRoots = files.filter((f) => /^\s*["']use client["']/m.test(bodies.get(f)!));

/** The shortest chain from a client entry point to `target`, for the failure message. */
function chainTo(target: string): string[] | null {
  const seen = new Set<string>();
  const queue: string[][] = clientRoots.map((r) => [r]);
  clientRoots.forEach((r) => seen.add(r));
  while (queue.length) {
    const path = queue.shift()!;
    const head = path[path.length - 1];
    if (head === target) return path;
    for (const next of graph.get(head) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

describe("the client/server bundle boundary", () => {
  it("finds the client entry points and their import graph at all", () => {
    // If this ever reads zero, every other assertion below passes
    // vacuously — the exact failure mode of a source-scanning guard.
    expect(clientRoots.length).toBeGreaterThan(50);
    expect(graph.get("src/lib/usage/logUsage.ts")).toContain("src/lib/usage/pricing.ts");
  });

  it("NO SERVER-ONLY MODULE IS REACHABLE FROM A CLIENT COMPONENT, however deep the chain", () => {
    const reached = SERVER_ONLY.map((target) => ({ target, chain: chainTo(target) })).filter((r) => r.chain);
    const report = reached.map((r) => `${r.target} is bundled:\n    ${r.chain!.join("\n      -> ")}`).join("\n\n");
    expect(report).toBe("");
  });

  it("the department task lists are data-only, so a picker can read them without an agent", () => {
    // The actual repair: eleven client components used to import their
    // department's server agent for one constant. Now they import the
    // constant. A file under lib/departments that imports anything at all has
    // started that chain over again.
    const tasks = readdirSync("src/lib/departments").filter((f) => f.endsWith(".ts"));
    expect(tasks.length).toBeGreaterThanOrEqual(11);
    const importing = tasks.filter((f) => importedSpecifiers(readFileSync(`src/lib/departments/${f}`, "utf8")).length > 0);
    expect(importing).toEqual([]);
  });

  it("treats `import type` as no edge, so types can still be shared with client files", () => {
    expect(typeOnly("type { QueryRow }")).toBe(true);
    expect(typeOnly("{ type QueryRow, type Foo }")).toBe(true);
    expect(typeOnly("{ QueryRow }")).toBe(false);
    expect(typeOnly("{ type QueryRow, formatQueries }")).toBe(false);
    expect(importedSpecifiers('import type { A } from "./a";\nimport { b } from "./b";')).toEqual(["./b"]);
  });
});
