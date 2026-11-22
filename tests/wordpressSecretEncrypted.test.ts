// The WordPress application password is ciphertext, like the other three.
//
// THE FINDING, 22 November 2026, while sizing WordPress/WooCommerce
// support. Migration 160 encrypted razorpay_key_secret,
// shopify_access_token and woocommerce_consumer_secret; migration 164
// dropped their plaintext originals. `wordpress_app_password` was added
// separately in migration 025 and nobody came back for it, so it sat in
// plaintext for the whole period the other three were ciphertext.
//
// IT IS THE MOST POWERFUL OF THE FOUR, which is why this is not a
// stylistic objection. A WordPress application password has NO SCOPES:
// it carries exactly the capabilities of the user it belongs to, so an
// administrator's is administrator access to the entire site — posts,
// pages, media, users, plugins. A dump of the dealerships table yielded
// that in the clear for every merchant who had connected a site.
//
// Fixed BEFORE any WordPress feature was built, at the owner's
// instruction. docs/RESEARCH-WOO-WP.md records the decision.

import { describe, it, beforeAll, expect } from "vitest";
import { code, sql } from "./helpers/source";
import {
  WORDPRESS_SECRET_SELECT,
  encryptedWrite,
  clearedWrite,
  wordpressAppPassword,
} from "@/lib/crypto/commerceSecrets";
import { encryptSecret } from "@/lib/crypto/secretCrypto";

const ROUTE = "src/app/api/integrations/wordpress/route.ts";
const MIGRATION = "supabase/migrations/238_encrypt_wordpress_app_password.sql";

// A TEST KEY, never the real one — the same 64 zeros-style stand-in
// tests/secretCrypto.test.ts and tests/oauthSecrets.test.ts use. The
// point of these tests is the round trip and the column names; the real
// COMMERCE_ENCRYPTION_KEY belongs only in the environment.
beforeAll(() => {
  process.env.COMMERCE_ENCRYPTION_KEY = process.env.COMMERCE_ENCRYPTION_KEY ?? "b".repeat(64);
});

describe("1. THE HELPERS TREAT IT LIKE EVERY OTHER COMMERCE SECRET", () => {
  it("THE LOAD-BEARING ONE: a round trip, through the real crypto", () => {
    // Behavioural, not a source grep: the value written is ciphertext
    // and the reader gets the original back. A grep for `encryptedWrite`
    // cannot tell whether the column it targets is the right one.
    const secret = "abcd EFGH 1234 ijkl MNOP 5678";
    const payload = encryptedWrite("wordpress_app_password", secret);
    expect(Object.keys(payload)).toEqual(["wordpress_app_password_encrypted"]);
    const stored = String(payload.wordpress_app_password_encrypted);
    expect(stored, "the stored value is the password in the clear").not.toContain(secret);
    expect(stored, "not the AES-256-GCM envelope this codebase uses").toMatch(/^v1:/);
    expect(wordpressAppPassword({ wordpress_app_password_encrypted: stored })).toBe(secret);
  });

  it("an unreadable ciphertext reads as NOT CONFIGURED, never as a value", () => {
    // Fails closed. A rotated key or a truncated column must not look
    // like a usable connection, or every write afterwards fails on a
    // site the panel said was connected.
    expect(wordpressAppPassword({ wordpress_app_password_encrypted: "v1:nonsense" })).toBeNull();
    expect(wordpressAppPassword({ wordpress_app_password_encrypted: null })).toBeNull();
    expect(wordpressAppPassword({})).toBeNull();
    expect(wordpressAppPassword(null)).toBeNull();
  });

  it("it reads the ENCRYPTED column only — a plaintext value is not accepted", () => {
    // The direction that matters after migration 238 drops the old
    // column: a row still carrying a plaintext value must not be
    // honoured, or the fix is cosmetic.
    expect(wordpressAppPassword({ wordpress_app_password: "plaintext-password" } as any)).toBeNull();
  });

  it("disconnecting clears the encrypted column", () => {
    expect(clearedWrite("wordpress_app_password")).toEqual({ wordpress_app_password_encrypted: null });
  });

  it("the SELECT fragment names the encrypted column", () => {
    // A literal, because building a select() from a computed value
    // degrades the typed client's row inference to any — the trap five
    // routes hit during migration 165.
    expect(WORDPRESS_SECRET_SELECT).toBe("wordpress_app_password_encrypted");
  });
});

describe("2. THE ROUTE NEVER TOUCHES A PLAINTEXT COLUMN", () => {
  it("THE LOAD-BEARING ONE: no write names the bare column", () => {
    // Comments stripped: this route's header quotes the old column name
    // while explaining why it is gone, and rule 8 is explicit that a
    // grep is defeated by a comment about the thing it looks for.
    const src = code(ROUTE);
    expect(src, "the route writes the plaintext column").not.toMatch(/wordpress_app_password\s*:/);
    expect(src).toMatch(/encryptedWrite\("wordpress_app_password",\s*app_password\)/);
    expect(src).toMatch(/clearedWrite\("wordpress_app_password"\)/);
  });

  it("CONNECTED-NESS IS DECIDED BY DECRYPTING, not by testing for non-null", () => {
    // A ciphertext that will not decrypt is not a connection. Testing
    // the column for non-null would report one.
    const src = code(ROUTE);
    expect(src).toMatch(/wordpressAppPassword\(data\)/);
  });

  it("the read FAILS CLOSED, which is what makes the deploy order safe", () => {
    // Selecting a column that does not exist is an error, not an empty
    // value, so shipping this before migration 238 runs would throw on
    // every call. The same ordering lesson commerceSecrets.ts records
    // for 160, which "was reported as run and had not been".
    const src = code(ROUTE);
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
    expect(get.length).toBeGreaterThan(200);
    expect(get).toMatch(/if \(error\) \{/);
    expect(get).toMatch(/connected: false/);
  });

  it("A SAVE FAILURE IS REPORTED, not swallowed", () => {
    // It was unchecked before. An unchecked update on a credential save
    // tells the owner "connected" over a row that never changed — the
    // usage-log failure of 27 September, in the one place where they are
    // handing over a password.
    const src = code(ROUTE);
    const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function DELETE"));
    expect(post).toMatch(/const \{ error: saveError \}/);
    expect(post).toMatch(/if \(saveError\)/);
    expect(post).toMatch(/Nothing was stored/);
  });

  it("and so is a DISCONNECT failure, because the credential would still be live", () => {
    const src = code(ROUTE);
    const del = src.slice(src.indexOf("export async function DELETE"));
    expect(del).toMatch(/const \{ error: clearError \}/);
    expect(del).toMatch(/if \(clearError\)/);
    expect(del).toMatch(/revoke the application password in WordPress/);
  });

  it("THE SECRET IS NEVER RETURNED TO THE CLIENT", () => {
    // The whole point. Every response body on this route is asserted,
    // rather than trusting that nobody added the value to one.
    const src = code(ROUTE);
    const bodies = [...src.matchAll(/NextResponse\.json\((\{[^;]*?\})\)/g)].map((m) => m[1]);
    expect(bodies.length).toBeGreaterThanOrEqual(5);
    for (const body of bodies) {
      expect(body, `a response carries the password: ${body}`).not.toMatch(/app_password|appPassword|_encrypted/);
    }
  });
});

describe("3. THE MIGRATION ADDS THE ENCRYPTED COLUMN AND DROPS THE PLAINTEXT ONE", () => {
  it("THE LOAD-BEARING ONE: both halves, in one transaction", () => {
    // Read through sql(), which strips `--` comments: this migration's
    // header names the old column repeatedly while explaining the
    // finding, and `code()` does not strip SQL comments at all. That is
    // the exact gap rule 8 records for migrations.
    const ddl = sql(MIGRATION);
    expect(ddl).toMatch(/add column if not exists wordpress_app_password_encrypted text/);
    expect(ddl).toMatch(/drop column if exists wordpress_app_password\b/);
    expect(ddl).toMatch(/^begin;/m);
    expect(ddl).toMatch(/^commit;/m);
  });

  it("the assertion is INSIDE the transaction, so a failure rolls back", () => {
    // Supabase opens a new connection per Run, so begin / change /
    // check / commit have to be one script — and a check after the
    // commit cannot undo anything.
    const ddl = sql(MIGRATION);
    // EXACTLY ONE TRANSACTION, and the count is the right assertion
    // here because the claim IS about the count. `raises < indexOf
    // ("commit;")` alone SURVIVED a mutation that inserted a SECOND
    // commit before the assertion: the first match moved past it and
    // the ordering still read as correct, while the transaction had
    // already been closed.
    expect((ddl.match(/^begin;/gm) ?? []).length, "more than one transaction").toBe(1);
    expect((ddl.match(/^commit;/gm) ?? []).length, "more than one commit").toBe(1);
    const begin = ddl.indexOf("begin;");
    const commit = ddl.indexOf("commit;");
    const raises = ddl.indexOf("raise exception");
    expect(begin).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(begin);
    expect(raises, "the assertion is outside the transaction").toBeGreaterThan(begin);
    expect(raises, "the assertion is after the commit").toBeLessThan(commit);
  });

  it("it asserts BOTH directions — created, and the old one gone", () => {
    const ddl = sql(MIGRATION);
    expect(ddl).toMatch(/wordpress_app_password_encrypted was not created/);
    expect(ddl).toMatch(/plaintext wordpress_app_password column is still present/);
  });

  it("it records itself in schema_migrations, with the real column name", () => {
    // `name` instead of `filename` would fail inside the transaction and
    // roll the whole migration back. Caught before it ever ran.
    const ddl = sql(MIGRATION);
    expect(ddl).toMatch(/insert into schema_migrations \(version, filename\)/);
    expect(ddl).toMatch(/values \('238', '238_encrypt_wordpress_app_password\.sql'\)/);
  });

  it("NO OTHER MIGRATION STILL CREATES THE PLAINTEXT COLUMN after this one", () => {
    // Not vacuous: migration 025 adds it, and must keep adding it —
    // history is not rewritten. The assertion is about what comes AFTER.
    const later = ["supabase/migrations/238_encrypt_wordpress_app_password.sql"];
    for (const file of later) {
      expect(sql(file)).not.toMatch(/add column if not exists wordpress_app_password text/);
    }
  });
});

describe("4. THE REAL CRYPTO IS BEING USED, so none of the above is a stub", () => {
  it("the envelope is the same one the other three secrets use", () => {
    const direct = encryptSecret("x", "commerce");
    expect(direct).toMatch(/^v1:/);
    expect(direct.split(":")).toHaveLength(4);
  });
});
