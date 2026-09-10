// Every column the code selects from ad_creatives must actually exist.
//
// WHY: activate_meta_campaign selected `car_type`, which is NOT a
// column — it only ever lived inside plan_json. PostgREST rejects the
// whole query, supabase-js returns { data: null, error }, and code that
// reads only `data` sees an empty list. Chat then said "no existing Meta
// campaign found" about a campaign that was sitting right there, and
// offered to create a duplicate. The budget-change tool had carried the
// same broken select for far longer.
//
// Mocked tests can't catch this: a mock returns whatever the test
// hands it, whatever columns were asked for. So this checks the code
// against the schema the migrations actually build.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function schemaColumns(): Set<string> {
  const dir = join(ROOT, "supabase", "migrations");
  const cols = new Set<string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    const create = sql.match(/create table if not exists ad_creatives\s*\(([\s\S]*?)\n\);/i);
    if (create) {
      for (const line of create[1].split("\n")) {
        const m = line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (m && !/^(constraint|primary|unique|check|foreign)$/i.test(m[1])) cols.add(m[1].toLowerCase());
      }
    }
    for (const m of sql.matchAll(/alter table (?:public\.)?ad_creatives\s+add column if not exists\s+([a-z_][a-z0-9_]*)/gi)) {
      cols.add(m[1].toLowerCase());
    }
  }
  return cols;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Top-level column names from a PostgREST select string. */
function selectedColumns(sel: string): string[] {
  // Drop embedded relations: other_table(col, col)
  let flat = sel;
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/[a-z_!:]*\([^()]*\)/gi, "");
  return flat
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (c.includes(":") ? c.split(":").pop()! : c)) // alias:column
    .map((c) => c.split("->")[0].trim()) // json path
    .filter((c) => c !== "*" && c !== "");
}

function adCreativesSelects() {
  const found: { file: string; line: number; columns: string[] }[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    // A .select(...) that belongs to a from("ad_creatives") chain: no
    // other .from( between them.
    for (const m of src.matchAll(/\.from\(\s*["']ad_creatives["']\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*(["'`])([^"'`]*)\2/g)) {
      const line = src.slice(0, m.index).split("\n").length;
      found.push({ file: file.slice(ROOT.length + 1), line, columns: selectedColumns(m[3]) });
    }
  }
  return found;
}

describe("ad_creatives selects match the real schema", () => {
  const cols = schemaColumns();

  it("the schema parser sees the columns we rely on", () => {
    // Guards the test itself: a parser that found nothing would pass
    // every select vacuously.
    for (const c of ["id", "headline", "status", "meta_ad_id", "meta_campaign_id", "meta_adset_id", "daily_budget", "plan_json", "external_status"]) {
      expect(cols.has(c), c).toBe(true);
    }
    expect(cols.has("car_type")).toBe(false);
  });

  it("finds the selects it is meant to check", () => {
    expect(adCreativesSelects().length).toBeGreaterThan(10);
  });

  it("no select asks for a column that does not exist", () => {
    const bad = adCreativesSelects().flatMap((s) =>
      s.columns.filter((c) => !cols.has(c.toLowerCase())).map((c) => `${s.file}:${s.line} selects "${c}"`)
    );
    expect(bad).toEqual([]);
  });
});
