// ------------------------------------------------------------------
// Backfill: encrypt existing payment and commerce secrets. R1 phase 1.
// ------------------------------------------------------------------
// Run AFTER migration 160, BEFORE migration 161 (which drops the
// plaintext columns).
//
//   npx tsx scripts/backfill-commerce-secrets.ts          # dry run
//   npx tsx scripts/backfill-commerce-secrets.ts --write  # apply
//
// Requires in the environment:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (RLS must be bypassed to touch every row)
//   COMMERCE_ENCRYPTION_KEY     (32 bytes, hex or base64)
//
// SAFETY PROPERTIES, deliberate:
//   - Dry run is the DEFAULT. Encrypting production secrets is not
//     something a mistyped command should be able to do.
//   - Idempotent: rows whose encrypted column is already populated are
//     skipped, so re-running after a partial failure resumes rather
//     than re-encrypting (which would still be correct, but wasted
//     work and a needless write).
//   - Non-destructive: plaintext columns are left untouched. This
//     script only ever writes the new columns.
//   - Verifies every value by decrypting it back and comparing to the
//     original BEFORE writing. A row whose ciphertext doesn't round
//     trip is reported and skipped, never written.
//   - No secret is ever printed. Output names dealerships by id and
//     field only.
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

const FIELDS = [
  { plain: "razorpay_key_secret", enc: "razorpay_key_secret_encrypted" },
  { plain: "shopify_access_token", enc: "shopify_access_token_encrypted" },
  { plain: "woocommerce_consumer_secret", enc: "woocommerce_consumer_secret_encrypted" },
] as const;

async function main() {
  const write = process.argv.includes("--write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!isRingConfigured("commerce")) {
    console.error("COMMERCE_ENCRYPTION_KEY is not set, or is not 32 bytes. Generate one with: openssl rand -hex 32");
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
        ciphertext = encryptSecret(String(plaintext), "commerce");
        // Round-trip check before we commit to writing it. A value that
        // encrypts but doesn't decrypt back would be a silent data loss
        // the moment the plaintext column is dropped.
        if (decryptSecret(ciphertext, "commerce") !== String(plaintext)) {
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
    console.log("\nSome values failed. Do NOT run migration 161 until this reports 0 failures.");
    process.exit(1);
  }
  if (!write) console.log("\nNothing was changed. Re-run with --write to apply.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
