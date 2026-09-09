// Encrypt every Meta Page access token still stored in plaintext.
//
//   npx tsx scripts/backfill-meta-token.ts           (dry run)
//   npx tsx scripts/backfill-meta-token.ts --write   (applies)
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// MARKETING_ENCRYPTION_KEY in the environment or .env.local.
//
// RUN THIS ONLY AFTER the code that reads via readMetaPageToken() is
// deployed. Order matters and the failure is total: this nulls the
// plaintext column, so any still-deployed instance selecting only
// `fb_page_access_token` gets null and every Meta feature — lead
// ingestion, ad launch, activation, autopilot posting, auto-reply,
// analytics — reads as "Facebook disconnected" at once.
//
// SAFE TO RE-RUN. Rows already encrypted are skipped, so an
// interrupted run is resumed by running it again. Dry run by default
// for the same reason as rekey-secrets.ts: the destructive half is
// nulling a credential that cannot be recovered from anywhere else.

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "../src/lib/crypto/secretCrypto";

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

/** Never print a token. Enough to tell two rows apart, useless to an attacker. */
function fingerprint(token: string): string {
  return `len=${token.length} …${token.slice(-4)}`;
}

async function main() {
  loadEnvLocal();
  const write = process.argv.includes("--write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!process.env.MARKETING_ENCRYPTION_KEY) {
    console.error("Missing MARKETING_ENCRYPTION_KEY — the same key the app decrypts with.");
    process.exit(1);
  }

  const db = createClient(url, key);
  const { data: rows, error } = await db
    .from("dealerships")
    .select("id, dealership_name, fb_page_access_token, fb_page_access_token_encrypted");

  if (error) {
    console.error("Could not read dealerships:", error.message);
    process.exit(1);
  }

  const all = rows ?? [];
  const needsWork = all.filter((r: any) => r.fb_page_access_token);
  const alreadyDone = all.filter((r: any) => !r.fb_page_access_token && r.fb_page_access_token_encrypted);
  const unconnected = all.filter((r: any) => !r.fb_page_access_token && !r.fb_page_access_token_encrypted);

  console.log(`Dealerships:            ${all.length}`);
  console.log(`Already encrypted:      ${alreadyDone.length}`);
  console.log(`No Meta connection:     ${unconnected.length}`);
  console.log(`Plaintext to encrypt:   ${needsWork.length}`);
  console.log("");

  if (needsWork.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let done = 0;
  let failed = 0;

  for (const row of needsWork as any[]) {
    const token: string = row.fb_page_access_token;
    const label = `${row.dealership_name ?? row.id} (${fingerprint(token)})`;

    // Encrypt, then decrypt what we are about to store and compare.
    // A row is only nulled once its ciphertext has been proven
    // readable — otherwise a key-ring mistake would destroy every
    // token in the table in one pass, with no copy anywhere.
    let ciphertext: string;
    try {
      ciphertext = encryptSecret(token, "marketing");
      if (decryptSecret(ciphertext, "marketing") !== token) {
        throw new Error("round-trip mismatch");
      }
    } catch (err: any) {
      console.error(`  FAIL  ${label} — ${err?.message ?? err}`);
      failed++;
      continue;
    }

    if (!write) {
      console.log(`  would encrypt  ${label}`);
      done++;
      continue;
    }

    // Guarded on the plaintext still being what we read. If a connect
    // landed between the SELECT and here, that newer token is already
    // encrypted by metaPageTokenWrite and must not be clobbered.
    const { data: updated, error: updateError } = await db
      .from("dealerships")
      .update({ fb_page_access_token_encrypted: ciphertext, fb_page_access_token: null })
      .eq("id", row.id)
      .eq("fb_page_access_token", token)
      .select("id");

    if (updateError) {
      console.error(`  FAIL  ${label} — ${updateError.message}`);
      failed++;
    } else if (!updated || updated.length === 0) {
      console.log(`  SKIP  ${label} — changed underneath us, left alone`);
    } else {
      console.log(`  ok    ${label}`);
      done++;
    }
  }

  console.log("");
  console.log(write ? `Encrypted ${done}, failed ${failed}.` : `Dry run — ${done} would be encrypted, ${failed} would fail.`);
  if (!write) console.log("Re-run with --write to apply.");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
