// ------------------------------------------------------------------
// Re-encrypt stored secrets under a new key. Audit item R6.
// ------------------------------------------------------------------
//   npx tsx scripts/rekey-secrets.ts <ring>            # dry run
//   npx tsx scripts/rekey-secrets.ts <ring> --write    # apply
//
//   <ring> is "canva", "commerce" or "marketing".
//
// ================================================================
// THE PROCEDURE — the order matters, and getting it wrong locks
// people out of their own data.
// ================================================================
//
//   1. Generate the new key:      openssl rand -hex 32
//
//   2. In Vercel, set BOTH:
//        <RING>_ENCRYPTION_KEY          = the NEW key
//        <RING>_ENCRYPTION_KEY_PREVIOUS = the OLD key
//      then REDEPLOY. Until this deploy lands, production cannot read
//      anything written under the new key.
//
//   3. Confirm the app still works. It is now reading under either key
//      and writing under the new one, so nothing is broken and nothing
//      is stranded.
//
//   4. Run this script with --write. It rewrites every stored value
//      under the new key.
//
//   5. Re-run it WITHOUT --write. It must report 0 remaining.
//
//   6. Remove <RING>_ENCRYPTION_KEY_PREVIOUS from Vercel and redeploy.
//      The old key is now retired and can be destroyed.
//
// DO NOT skip step 2's redeploy, and DO NOT remove the previous key
// before step 5 reports zero. Removing it early strands every value
// not yet re-keyed, with no way back — which is the exact failure this
// whole mechanism exists to make impossible.
//
// SAFE TO INTERRUPT. Every value is verified by decrypting it back
// before the write, the check is per-row, and already-migrated values
// are skipped — so a half-finished run resumes cleanly rather than
// leaving a mix nobody can untangle. During a partial state the app
// reads both keys, so a partially re-keyed database still works.
// ------------------------------------------------------------------

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  encryptSecret,
  decryptSecret,
  isUnderCurrentKey,
  isRingConfigured,
  isRotationInProgress,
  type KeyRing,
} from "../src/lib/crypto/secretCrypto";

function loadEnvLocal() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* not present */
  }
}

/** Where each ring's encrypted values live. */
const TARGETS: Record<KeyRing, { table: string; idColumn: string; columns: string[] }> = {
  canva: {
    table: "canva_connections",
    idColumn: "id",
    columns: ["access_token_encrypted", "refresh_token_encrypted"],
  },
  commerce: {
    table: "dealerships",
    idColumn: "id",
    columns: [
      "razorpay_key_secret_encrypted",
      "shopify_access_token_encrypted",
      "woocommerce_consumer_secret_encrypted",
    ],
  },
  marketing: {
    table: "dealerships",
    idColumn: "id",
    columns: [
      "gmail_access_token_encrypted",
      "gmail_refresh_token_encrypted",
      "youtube_access_token_encrypted",
      "youtube_refresh_token_encrypted",
      "google_ads_access_token_encrypted",
      "google_ads_refresh_token_encrypted",
      "linkedin_access_token_encrypted",
      "linkedin_refresh_token_encrypted",
      "pinterest_access_token_encrypted",
      "pinterest_refresh_token_encrypted",
      "snapchat_access_token_encrypted",
      "snapchat_refresh_token_encrypted",
    ],
  },
};

async function main() {
  loadEnvLocal();

  const ring = process.argv[2] as KeyRing;
  const write = process.argv.includes("--write");

  if (!Object.prototype.hasOwnProperty.call(TARGETS, ring)) {
    console.error(`Usage: npx tsx scripts/rekey-secrets.ts <${Object.keys(TARGETS).join("|")}> [--write]`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!isRingConfigured(ring)) {
    console.error(`The current key for the "${ring}" ring is not set or is not 32 bytes.`);
    process.exit(1);
  }
  if (!isRotationInProgress(ring)) {
    // Without the previous key, anything still under the old key is
    // unreadable — so a "successful" run here would silently skip
    // exactly the rows that need migrating.
    console.error(
      `No previous key is set for the "${ring}" ring, so there is nothing to migrate FROM.\n` +
        `Set the retiring key as the *_PREVIOUS variable and redeploy before running this. See the header of this file.`
    );
    process.exit(1);
  }

  const target = TARGETS[ring];
  const db = createClient(url, serviceKey);

  const { data: rows, error } = await db
    .from(target.table)
    .select([target.idColumn, ...target.columns].join(", "));
  if (error) {
    console.error(`Could not read ${target.table}:`, error.message);
    process.exit(1);
  }

  console.log(`${write ? "APPLYING" : "DRY RUN"} — ring "${ring}", ${rows?.length ?? 0} rows scanned\n`);

  let toRekey = 0;
  let alreadyCurrent = 0;
  let empty = 0;
  let failed = 0;
  let written = 0;

  for (const row of (rows ?? []) as any[]) {
    const update: Record<string, string> = {};

    for (const column of target.columns) {
      const value = row[column];
      if (!value) {
        empty++;
        continue;
      }
      if (isUnderCurrentKey(value, ring)) {
        alreadyCurrent++;
        continue;
      }

      try {
        const plaintext = decryptSecret(value, ring); // tries current, then previous
        const reEncrypted = encryptSecret(plaintext, ring); // always the current key
        // Verified BEFORE writing. A value that re-encrypts but does
        // not decrypt back would be silent data loss the moment the
        // previous key is retired.
        if (decryptSecret(reEncrypted, ring) !== plaintext) throw new Error("round-trip mismatch");
        if (!isUnderCurrentKey(reEncrypted, ring)) throw new Error("re-encrypted value is not under the current key");

        update[column] = reEncrypted;
        toRekey++;
        console.log(`  ${write ? "rekey" : "would rekey"}  ${row[target.idColumn]}  ${column}`);
      } catch (err: any) {
        // Never prints the value.
        console.error(`  FAILED  ${row[target.idColumn]}  ${column}: ${err?.message}`);
        failed++;
      }
    }

    if (write && Object.keys(update).length > 0) {
      const { error: updateError } = await db.from(target.table).update(update).eq(target.idColumn, row[target.idColumn]);
      if (updateError) {
        console.error(`  WRITE FAILED  ${row[target.idColumn]}: ${updateError.message}`);
        failed++;
      } else {
        written += Object.keys(update).length;
      }
    }
  }

  console.log("\n---");
  console.log(`needing re-key:     ${toRekey}`);
  console.log(`already current:    ${alreadyCurrent}`);
  console.log(`empty:              ${empty}`);
  console.log(`failed:             ${failed}`);
  if (write) console.log(`written:            ${written}`);

  if (failed > 0) {
    console.log("\nFailures above. Do NOT remove the *_PREVIOUS key until a dry run reports 0 needing re-key.");
    process.exit(1);
  }
  if (!write) {
    console.log(
      toRekey === 0
        ? "\nNothing left to migrate — safe to remove the *_PREVIOUS key and redeploy."
        : "\nNothing was changed. Re-run with --write to apply."
    );
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
