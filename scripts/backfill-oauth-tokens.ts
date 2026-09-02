// ------------------------------------------------------------------
// Backfill: encrypt existing marketing OAuth tokens. Phase 1 of 2.
// ------------------------------------------------------------------
//   npx tsx scripts/backfill-oauth-tokens.ts          # dry run
//   npx tsx scripts/backfill-oauth-tokens.ts --write  # apply
//
// Run AFTER migration 165 and after deploying the code that reads
// encrypted-first. Run it IMMEDIATELY — there is nothing to wait for.
//
// The original plan assumed most values would migrate naturally as
// tokens refreshed, leaving only a remainder. Checking which
// integrations are actually live showed otherwise:
//   - google_ads, linkedin, pinterest and snapchat have refresh code,
//     but all four platforms are INACTIVE pending credentials, so it
//     never executes.
//   - youtube refreshes only when a video is published — rare.
//   - gmail is the only one with a routine refresh path.
// Eight of these twelve columns will therefore never migrate on their
// own. The backfill is the whole job, not a mop-up.
//
// NOT COVERED: fb_page_access_token and instagram_access_token. Both
// are deferred until after the pending live tests — see the open item
// in src/lib/crypto/oauthSecrets.ts.
//
// Requires in the environment:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (RLS must be bypassed to touch every row)
//   MARKETING_ENCRYPTION_KEY    (32 bytes, hex or base64)
//
// SAFETY PROPERTIES, unchanged from the commerce backfill this is
// derived from:
//   - Dry run is the DEFAULT.
//   - Idempotent: rows already encrypted are skipped, so a re-run
//     after a partial failure resumes rather than redoing work.
//   - Non-destructive: plaintext columns are left untouched; only the
//     new columns are written. The drop is a later migration.
//   - Every value is decrypted back and compared BEFORE writing. A
//     value that encrypts but does not round-trip would be silent data
//     loss the moment the plaintext column is dropped.
//   - No secret is ever printed. Output names dealerships by id and
//     column only.
//
// PARTIAL FAILURE IS SAFE, which is the whole point of the two-phase
// shape: application code reads encrypted-first with a plaintext
// fallback, so a database where some accounts are encrypted and some
// are not keeps every integration working. The script exits non-zero
// on any failure so a partial run is visible rather than assumed
// complete.
// ------------------------------------------------------------------

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret, isRingConfigured } from "../src/lib/crypto/secretCrypto";

// tsx does not load .env.local the way `next dev` does, and this
// project has no dotenv dependency. Parsed here rather than adding one
// for a script that runs a handful of times. Existing environment
// variables win, so an explicitly exported value can override the file.
function loadEnvLocal() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local — variables may be exported directly instead.
  }
}
loadEnvLocal();

const PROVIDERS = ["gmail", "youtube", "google_ads", "linkedin", "pinterest", "snapchat"] as const;
const KINDS = ["access_token", "refresh_token"] as const;

const FIELDS = PROVIDERS.flatMap((provider) =>
  KINDS.map((kind) => ({
    plain: `${provider}_${kind}`,
    enc: `${provider}_${kind}_encrypted`,
  }))
);

async function main() {
  const write = process.argv.includes("--write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!isRingConfigured("marketing")) {
    console.error("MARKETING_ENCRYPTION_KEY is not set, or is not 32 bytes. Generate one with: openssl rand -hex 32");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);
  const select = ["id", ...FIELDS.flatMap((f) => [f.plain, f.enc])].join(", ");

  const { data: rows, error } = await supabase.from("dealerships").select(select);
  if (error) {
    console.error("Could not read dealerships:", error.message);
    process.exit(1);
  }

  console.log(`${write ? "APPLYING" : "DRY RUN"} — ${rows?.length ?? 0} dealerships scanned\n`);

  let toEncrypt = 0;
  let alreadyDone = 0;
  let empty = 0;
  let failed = 0;
  let written = 0;

  for (const row of (rows ?? []) as any[]) {
    const update: Record<string, string> = {};

    for (const field of FIELDS) {
      const plaintext = row[field.plain];
      const existing = row[field.enc];

      if (existing) { alreadyDone++; continue; }
      if (!plaintext) { empty++; continue; }

      let ciphertext: string;
      try {
        ciphertext = encryptSecret(String(plaintext), "marketing");
        // Round-trip check before we commit to writing it. A value that
        // encrypts but doesn't decrypt back would be a silent data loss
        // the moment the plaintext column is dropped.
        if (decryptSecret(ciphertext, "marketing") !== String(plaintext)) {
          throw new Error("round-trip mismatch");
        }
      } catch (err: any) {
        console.error(`  FAILED  ${row.id}  ${field.plain}: ${err?.message}`);
        failed++;
        continue;
      }

      update[field.enc] = ciphertext;
      toEncrypt++;
      console.log(`  ${write ? "encrypt" : "would encrypt"}  ${row.id}  ${field.plain}`);
    }

    if (write && Object.keys(update).length > 0) {
      const { error: updateError } = await supabase.from("dealerships").update(update).eq("id", row.id);
      if (updateError) {
        console.error(`  WRITE FAILED  ${row.id}: ${updateError.message}`);
        failed++;
      } else {
        written += Object.keys(update).length;
      }
    }
  }

  console.log("\n---");
  console.log(`to encrypt:      ${toEncrypt}`);
  console.log(`already encrypted: ${alreadyDone}`);
  console.log(`empty (nothing to do): ${empty}`);
  console.log(`failed:          ${failed}`);
  if (write) console.log(`written:         ${written}`);

  if (failed > 0) {
    console.log("\nSome values failed. Do NOT run the drop migration until this reports 0 failures.");
    process.exit(1);
  }
  if (!write) console.log("\nNothing was changed. Re-run with --write to apply.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
