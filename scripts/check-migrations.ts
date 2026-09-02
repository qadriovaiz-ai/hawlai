// Does production match HEAD? — audit item R4.
//
//   npx tsx scripts/check-migrations.ts
//   npm run migrations:check
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
// the environment or .env.local. Exits non-zero when the database is
// behind the files on disk, so it can gate a deploy.
//
// RUN THIS BEFORE DEPLOYING. The failure it exists to prevent is code
// shipping against a schema that lacks its columns — which is not a
// hypothetical: migration 160 was reported as applied, was not, and
// the code depending on it was already on main.
//
// WHAT IT CANNOT TELL YOU: anything about migrations 001-162. They
// predate the ledger and their applied state was never recorded. The
// output says so rather than counting them as applied.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Not present — variables may be exported directly.
  }
}

/** The version below which the ledger has no information. */
const BASELINE = 163;

interface DiskMigration {
  version: string;
  numeric: number;
  filename: string;
  checksum: string;
}

function readDiskMigrations(): DiskMigration[] {
  const dir = "supabase/migrations";
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((filename) => {
      const version = (filename.match(/^(\d+[a-z]?)/)?.[1]) ?? filename;
      return {
        version,
        numeric: parseInt(version, 10),
        filename,
        checksum: crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, filename))).digest("hex"),
      };
    })
    .sort((a, b) => a.numeric - b.numeric || a.version.localeCompare(b.version));
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const db = createClient(url, key);
  const disk = readDiskMigrations();

  const { data: rows, error } = await db.from("schema_migrations").select("version, filename, checksum, verified");
  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
      console.error("The schema_migrations table does not exist.");
      console.error("Run supabase/migrations/163_schema_migrations_tracking.sql first.");
      process.exit(1);
    }
    console.error("Could not read schema_migrations:", error.message);
    process.exit(1);
  }

  const applied = new Map((rows ?? []).map((r: any) => [r.version, r]));
  const tracked = disk.filter((m) => m.numeric >= BASELINE);
  const preBaseline = disk.filter((m) => m.numeric < BASELINE);

  const missing = tracked.filter((m) => !applied.has(m.version));
  const edited = tracked.filter((m) => {
    const row = applied.get(m.version);
    return row && row.checksum && row.checksum !== m.checksum;
  });

  console.log(`Files on disk:       ${disk.length}`);
  console.log(`Tracked (>= ${BASELINE}):    ${tracked.length}`);
  console.log(`Recorded as applied: ${tracked.length - missing.length}`);
  console.log(`Not tracked (< ${BASELINE}): ${preBaseline.length}  — applied state unknown, never recorded`);
  console.log("");

  if (missing.length > 0) {
    console.log("NOT APPLIED — run these in the Supabase SQL Editor before deploying:");
    for (const m of missing) console.log(`  ${m.filename}`);
    console.log("");
  }

  if (edited.length > 0) {
    console.log("EDITED AFTER APPLYING — the file on disk no longer matches what ran:");
    for (const m of edited) console.log(`  ${m.filename}`);
    console.log("");
  }

  if (missing.length === 0 && edited.length === 0) {
    console.log("Production matches HEAD for every tracked migration.");
    console.log(`Note: this says nothing about the ${preBaseline.length} migrations below ${BASELINE}.`);
    return;
  }

  // Non-zero so this can gate a deploy rather than merely inform one.
  process.exit(1);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
