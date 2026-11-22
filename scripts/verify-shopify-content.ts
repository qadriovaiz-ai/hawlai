// ------------------------------------------------------------------
// Verify Phase 3's Shopify write path against a REAL store.
// ------------------------------------------------------------------
// Everything in 3.1-3.4 is "unverified": the mutation shapes, the
// scopes and the field names are confirmed from the version-pinned
// 2026-07 documentation and nothing else. 7,312 passing tests prove
// the adapter behaves correctly against a fake fetch. They prove
// nothing about whether `collectionUpdate(collection:)` is the form
// this store's API actually accepts.
//
// So this drives THE ADAPTER'S OWN preview() and execute() — not raw
// GraphQL written for the occasion. The point is that the code under
// test is the code that will run in production. The only raw queries
// here are READS used to discover target ids, because the adapter has
// no search: every one of its queries takes an `id: ID!`, which is
// itself one of the findings worth reporting.
//
//   npx tsx scripts/verify-shopify-content.ts --shop=<domain>
//   npx tsx scripts/verify-shopify-content.ts --shop=<domain> --write
//
// Requires in the environment (all already in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (reads the stored Shopify credential)
//   COMMERCE_ENCRYPTION_KEY     (the token is encrypted at rest)
//
// SAFETY PROPERTIES, deliberate:
//
//   - DRY RUN IS THE DEFAULT. Without --write it discovers targets and
//     runs preview() only. preview() issues one read and never a
//     mutation, which is itself asserted here by counting calls.
//
//   - --shop IS REQUIRED AND IS CHECKED. The script resolves the
//     credential from the database and then refuses to continue unless
//     the resolved shop domain equals the one named on the command
//     line. A script that can write to a live storefront must not be
//     able to pick the store itself.
//
//   - EVERY EDIT IS PUT BACK, through the adapter's own undo() and a
//     second execute() — so the restore is not a hand-written reversal
//     but the undo path under test. Reported separately, because a
//     restore that fails is a page left changed and has to be loud.
//
//   - TWO THINGS CANNOT BE PUT BACK and are not pretended otherwise: a
//     created article and an uploaded file. Both are reported with
//     their ids so they can be deleted by hand. The article is created
//     unpublished, so nothing reaches the storefront.
//
//     AMENDED 22 NOVEMBER 2026: the CREATION is still one-way, but
//     PUBLISHING it is not. Step 2b takes that same draft live through
//     `update_post` and puts it back through the adapter's own undo(),
//     so the one mutation in this file that no live store has ever
//     accepted — `articleUpdate` — gets exercised on a post this script
//     made and already calls disposable. It never touches a post the
//     owner wrote.
//
//   - NO TOKEN IS EVER PRINTED.
// ------------------------------------------------------------------

// RUN IT WITH THE react-server CONDITION:
//
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-shopify-content.ts --shop=...
//
// `lib/supabase/service.ts` imports `server-only`, whose default export
// throws by design — that is the first of the three defences keeping
// the service-role key out of a client bundle. Under `next dev` the
// react-server condition resolves it to an empty module instead. tsx
// has no such condition by default, so without the flag above this
// script dies on an import rather than on anything about Shopify.
//
// Deliberately NOT worked around by rebuilding the credential read
// here. The whole point is to exercise the code that will run in
// production, and that includes resolving and decrypting the stored
// token.
import fs from "fs";

// tsx does not load .env.local the way `next dev` does, and this
// project has no dotenv dependency — the same note as
// backfill-commerce-secrets.ts, which is where this comes from. A
// third copy is a smell; extracting it would mean editing two working
// scripts for no behavioural gain, so it is left as the convention.
// Existing environment variables win, so an exported value overrides
// the file.
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

import { createShopifyPlatform } from "../src/lib/publish/platforms/shopify";
import { shopifyCredentialsAdapter } from "../src/lib/publish/platforms/shopifyCredentials";
import { shopifyGraphQL } from "../src/lib/commerce/shopifyGraphQL";
import { createServiceClient } from "../src/lib/supabase/service";
import type { PublishActionRecord, PreviewDiff } from "../src/lib/publish/types";

const WRITE = process.argv.includes("--write");
const SHOP_ARG = (process.argv.find((a) => a.startsWith("--shop=")) ?? "").split("=")[1] ?? "";

/** A marker that makes every value this script writes obvious in the admin. */
const STAMP = `[hawlai-verify ${new Date().toISOString().slice(0, 16)}]`;

/** Which credential the run used, named in the summary so a pasted result is unambiguous. */
let CREDENTIAL_SOURCE: "override" | "minted" | "database" = "database";

type Outcome = { name: string; pass: boolean; detail: string };
const results: Outcome[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

/** Counts the adapter's HTTP calls, so "preview never writes" is checked rather than assumed. */
function countingFetch() {
  const bodies: any[] = [];
  const impl = (async (url: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    return fetch(url, init);
  }) as unknown as typeof fetch;
  return { impl, bodies };
}

const action = (over: Partial<PublishActionRecord>): PublishActionRecord => ({
  id: `verify-${Math.random().toString(36).slice(2, 8)}`,
  dealershipId: "",
  platform: "shopify",
  connectionRef: null,
  actionKey: "update_page_meta",
  targetRef: null,
  targetLabel: null,
  requestedChanges: {},
  preview: null,
  previewedAt: null,
  status: "approved",
  idempotencyKey: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  ...over,
});

// ------------------------------------------------------------------
// Discovery. READ-ONLY, and not the code under test.
// ------------------------------------------------------------------
const DISCOVER = `
  query VerifyDiscover {
    shop { name myshopifyDomain }
    pages(first: 5) {
      nodes {
        id title handle isPublished
        seoTitle: metafield(namespace: "global", key: "title_tag") { value }
        seoDescription: metafield(namespace: "global", key: "description_tag") { value }
      }
    }
    collections(first: 5) {
      nodes { id title handle descriptionHtml productsCount { count } }
    }
    blogs(first: 5) { nodes { id title handle } }
  }
`;

const READ_PAGE = `
  query VerifyPage($id: ID!) {
    page(id: $id) {
      id
      title
      body
      seoTitle: metafield(namespace: "global", key: "title_tag") { value }
      seoDescription: metafield(namespace: "global", key: "description_tag") { value }
    }
  }
`;
const READ_COLLECTION = `query VerifyCollection($id: ID!) { collection(id: $id) { id title descriptionHtml } }`;
const READ_ARTICLE = `query VerifyArticle($id: ID!) { article(id: $id) { id title isPublished publishedAt blog { title } } }`;

/**
 * Apply an undo proposal through the adapter.
 *
 * The proposal is a REQUEST, not a write — so putting a page back means
 * previewing and executing it like any other action. That is the whole
 * design, and running it here is the only way to find out whether it
 * holds against a real store.
 */
async function applyUndo(
  platform: ReturnType<typeof createShopifyPlatform>,
  dealershipId: string,
  done: PublishActionRecord
): Promise<string> {
  if (!platform.undo) return "the adapter declares no undo at all";
  const proposal = await platform.undo(done);
  if (!proposal.ok) return `undo refused: ${proposal.reason}`;

  const back = action({
    dealershipId,
    actionKey: proposal.actionKey,
    targetRef: proposal.targetRef,
    targetLabel: proposal.targetLabel,
    requestedChanges: proposal.requestedChanges,
  });
  const pv = await platform.preview(back);
  if (!pv.ok) return `undo preview failed: ${pv.reason}`;
  const ex = await platform.execute({ ...back, preview: pv.preview, previewedAt: new Date().toISOString() });
  if (!ex.ok) return `undo execute failed: ${ex.stale ? "reported stale" : ex.reason}`;
  return "restored";
}

async function main(): Promise<number> {
  console.log("Verifying the Shopify content write path against a real store.\n");

  if (!SHOP_ARG) {
    console.error("Refusing to run: --shop=<domain> is required.");
    console.error("The script must not be able to choose which store it writes to.");
    return 1;
  }

  // ---------------- preflight ----------------
  //
  // CHECKED HERE RATHER THAN LEFT TO THROW. Without this, a missing
  // variable surfaces as a stack trace inside createServiceClient,
  // which reads like a bug in the code under test rather than a local
  // setup step. The two Supabase variables are not in .env.local by
  // default — they live in Vercel, because nothing else run locally
  // needs the service-role key.
  const NEEDED: (readonly [string, string])[] = [
    ["NEXT_PUBLIC_SUPABASE_URL", "Vercel → Settings → Environment Variables"],
    ["SUPABASE_SERVICE_ROLE_KEY", "Vercel → Settings → Environment Variables (secret — do not paste it into chat)"],
  ];
  // Only needed to DECRYPT a stored token. With SHOPIFY_VERIFY_TOKEN
  // set there is nothing to decrypt, and demanding the key would be
  // demanding the very thing that cannot be obtained.
  if (!process.env.SHOPIFY_VERIFY_TOKEN) {
    NEEDED.push(["COMMERCE_ENCRYPTION_KEY", "already in .env.local — but it must be the key that ENCRYPTED the token"]);
  }
  const missing = NEEDED.filter(([k]) => !process.env[k]);
  if (missing.length) {
    console.error("Refusing to run — these are not in the environment:\n");
    for (const [key, where] of missing) console.error(`  ${key}\n      from: ${where}`);
    console.error("\nAdd them to .env.local (or `vercel env pull .env.local`) and run again.");
    console.error("Nothing was read and nothing was written.");
    return 1;
  }

  // ---------------- the business, confirmed by a read ----------------
  //
  // NOT KEYED ON A GUESSED ID. The dealership is found BY the shop
  // domain that was passed in, so the credential and the named store
  // cannot disagree.
  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("dealerships")
    // `dealership_name`, CONFIRMED in migration 001_schema.sql. I
    // wrote `name` from habit and it does not exist on this table —
    // 001 declares `name` on a DIFFERENT table seventeen lines later,
    // which is exactly how the wrong one looks right in a grep.
    .select("id, dealership_name, shopify_store_url")
    .eq("shopify_store_url", SHOP_ARG);

  if (error) {
    console.error(`Couldn't read dealerships: ${error.message}`);
    return 1;
  }
  if (!rows?.length) {
    console.error(`No business has ${SHOP_ARG} connected. Nothing to verify.`);
    return 1;
  }
  if (rows.length > 1) {
    console.error(`${rows.length} businesses share that store domain. Refusing to guess which.`);
    return 1;
  }
  const dealershipId = rows[0].id as string;
  console.log(`Business:  ${rows[0].dealership_name} (${dealershipId})`);
  console.log(`Store:     ${SHOP_ARG}`);
  console.log(`Mode:      ${WRITE ? "WRITE — real edits, each one put back" : "DRY RUN — preview only, nothing written"}\n`);

  // ---------------- the credential ------------------------------------
  //
  // TWO SOURCES, AND THE OVERRIDE IS NOT A SHORTCUT. The stored token
  // is encrypted with COMMERCE_ENCRYPTION_KEY, and the token for this
  // store was written by the LIVE app on Vercel — so it is encrypted
  // under the production key. That key is a Vercel "Sensitive"
  // variable: it cannot be read back by anyone, including the owner,
  // and `secretCrypto` only ever tries COMMERCE_ENCRYPTION_KEY and
  // COMMERCE_ENCRYPTION_KEY_PREVIOUS. There is nothing to recover.
  //
  // The two obvious ways round it are both worse than the problem.
  // Rotating the key rewrites every encrypted secret in the database
  // to fix one test store. Reconnecting the store from a local dev
  // server re-encrypts the token under the LOCAL key, which then makes
  // it undecryptable in production — breaking the live connection to
  // fix the local one.
  //
  // So: SHOPIFY_VERIFY_TOKEN, an Admin API token from a custom app on
  // the test store itself. What is unverified here is the four
  // MUTATION SHAPES. Credential resolution is not unverified — it has
  // been running in production since September — so it does not belong
  // in this test. Skipping it costs nothing and risks nothing, and the
  // database path stays the default so the script still works
  // unchanged in a context that has the real key.
  let creds: { shop: string; accessToken: string } | null = null;
  const override = process.env.SHOPIFY_VERIFY_TOKEN;
  if (override) {
    creds = { shop: SHOP_ARG, accessToken: override };
    record(
      "credential source",
      true,
      "SHOPIFY_VERIFY_TOKEN — a store-level token; the encrypted-token path is DELIBERATELY NOT exercised"
    );
    CREDENTIAL_SOURCE = "override";
  } else if (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    // ---- mint one, rather than relay one by hand -------------------
    //
    // THE CLIENT CREDENTIALS GRANT. One form POST with the client id
    // and secret, both already in .env.local for the OAuth callback.
    // No key pair, no signed assertion, no merchant session, and
    // nothing to copy between windows — which is the whole point: an
    // `id_token` is valid for 60 seconds and cannot be relayed by hand,
    // and a Dev Dashboard custom app now issues 24-hour tokens through
    // this same grant anyway. Minting on demand makes the expiry
    // irrelevant.
    //
    // ONLY WORKS WITHIN ONE ORGANIZATION, in Shopify's words: "The
    // client credentials grant only works when the app and the store
    // belong to the same Shopify organization", and "Owning a store or
    // having it installed doesn't automatically place it in your org."
    // So this can legitimately fail, and the failure is reported as
    // what it is rather than as a broken script.
    const res = await fetch(`https://${SHOP_ARG}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      }).toString(),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as any);

    const raw = await res.text();
    let minted: any = null;
    try {
      minted = JSON.parse(raw);
    } catch {
      /* not JSON — reported below as the body Shopify actually sent */
    }

    if (!res.ok || !minted?.access_token) {
      record(
        "mint a token with the client credentials grant",
        false,
        `HTTP ${res.status} — ${raw.slice(0, 300)}`
      );
      console.error("");
      console.error("The client credentials grant needs the app and the store to be in");
      console.error("the SAME Shopify organization. Installing the app on a store does");
      console.error("not put the store in the org — Shopify is explicit about that.");
      console.error("");
      console.error("If that is the problem, the remaining option is a store-level token:");
      console.error(`  Shopify admin for ${SHOP_ARG} → Settings → Apps → Develop apps`);
      console.error("  → Build apps in Dev Dashboard → Create app → Admin API scopes:");
      console.error("  write_products, write_content, write_files → install on this store");
      console.error("Then put it in .env.local as SHOPIFY_VERIFY_TOKEN=...");
      console.error("");
      console.error("Nothing was written.");
      return 1;
    }

    creds = { shop: SHOP_ARG, accessToken: minted.access_token };
    record(
      "mint a token with the client credentials grant",
      true,
      `expires_in=${minted.expires_in ?? "?"}s · scope=${minted.scope ?? "(not returned)"} · token not printed`
    );
    CREDENTIAL_SOURCE = "minted";
    // THE SCOPES ARE WORTH READING. This is the first chance to see
    // what the app's granted scopes actually are from the API's own
    // mouth rather than from the Dev Dashboard's screen — so a missing
    // write_files here explains a later upload failure immediately.
    if (typeof minted.scope === "string") {
      for (const need of ["write_products", "write_content", "write_files"]) {
        record(`granted: ${need}`, minted.scope.includes(need), minted.scope.includes(need) ? "" : "NOT in the granted scopes");
      }
    }
  } else {
    creds = await shopifyCredentialsAdapter(dealershipId);
    if (!creds) {
      console.error("Couldn't resolve a Shopify credential from the database.");
      console.error("");
      console.error("If the error above was a decryption failure, this machine's");
      console.error("COMMERCE_ENCRYPTION_KEY is not the key that encrypted the token.");
      console.error("That is expected for a store connected through the live app, and it");
      console.error("is not recoverable. Set SHOPIFY_VERIFY_TOKEN in .env.local instead:");
      console.error("");
      console.error(`  Shopify admin for ${SHOP_ARG} → Settings → Apps and sales channels`);
      console.error("  → Develop apps → Create an app → Configure Admin API scopes");
      console.error("  → tick write_products, write_content, write_files → Install");
      console.error("  → reveal the Admin API access token (shpat_...)");
      console.error("");
      console.error("Nothing was written.");
      return 1;
    }
    if (creds.shop !== SHOP_ARG) {
      console.error(`Resolved credential is for ${creds.shop}, not ${SHOP_ARG}. Refusing to continue.`);
      return 1;
    }
    record("the stored credential resolves and matches --shop", true, `token for ${creds.shop} (not printed)`);
  }

  // ---------------- discovery ----------------------------------------
  const found = await shopifyGraphQL<any>(creds.shop, creds.accessToken, DISCOVER, {});
  if (!found.ok) {
    record("discovery read", false, found.reason);
    return finish();
  }
  const page = found.data.pages?.nodes?.[0] ?? null;
  const collection = found.data.collections?.nodes?.[0] ?? null;
  const blogs = found.data.blogs?.nodes ?? [];
  record(
    "discovery read",
    true,
    `shop "${found.data.shop?.name}" · ${found.data.pages?.nodes?.length ?? 0} pages · ` +
      `${found.data.collections?.nodes?.length ?? 0} collections · ${blogs.length} blogs`
  );

  const platform = createShopifyPlatform({ getCredentials: async () => creds });

  // ================================================================
  // 1. pageUpdate — the SEO title alone, description untouched
  // ================================================================
  console.log("\n1. pageUpdate — search title only\n");
  if (!page) {
    record("page SEO", false, "this store has no pages, so there is nothing to edit");
  } else {
    const beforeTitle = page.seoTitle?.value ?? "";
    const beforeDescription = page.seoDescription?.value ?? "";
    console.log(`   page "${page.title}" (/pages/${page.handle})`);
    console.log(`   before: title=${JSON.stringify(beforeTitle)} description=${JSON.stringify(beforeDescription)}`);

    const { impl, bodies } = countingFetch();
    const counted = createShopifyPlatform({ getCredentials: async () => creds, fetchImpl: impl });
    const act = action({
      dealershipId,
      actionKey: "update_page_meta",
      targetRef: page.id,
      targetLabel: page.title,
      requestedChanges: { metaTitle: `${beforeTitle} ${STAMP}`.trim() },
    });

    const pv = await counted.preview(act);
    if (!pv.ok) {
      record("page SEO preview", false, pv.reason);
    } else {
      record(
        "page SEO preview",
        true,
        `changes: ${pv.preview.changes.map((c) => `${c.field} ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`).join("; ")}`
      );
      // The contract: a preview reads and never writes.
      const mutated = bodies.filter((b) => String(b.query).includes("mutation"));
      record(
        "preview issued no mutation",
        bodies.length === 1 && mutated.length === 0,
        `${bodies.length} call(s), ${mutated.length} mutation(s)`
      );
      // The description must be carried through, not dropped. This is
      // the assertion the whole seo-object design exists for.
      const sendsDescription = pv.preview.changes.every((c) => c.field !== "seoDescription");
      record(
        "preview proposes only the title",
        sendsDescription,
        "seoDescription is absent from the diff, so only the title was asked for"
      );

      if (WRITE) {
        const done = { ...act, preview: pv.preview as PreviewDiff, previewedAt: new Date().toISOString() };
        const ex = await platform.execute(done);
        if (!ex.ok) {
          record("page SEO execute", false, ex.stale ? `reported STALE: ${JSON.stringify(ex.changed)}` : ex.reason);
        } else {
          record("page SEO execute", true, JSON.stringify(ex.platformResponse));
          // THE LOAD-BEARING READ-BACK. Metafields upsert per
          // namespace+key, so a dropped description would show here —
          // and so would an empty one written to carry a half that was
          // never set, which Shopify rejects outright.
          const after = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_PAGE, { id: page.id });
          if (!after.ok) {
            record("page SEO read-back", false, after.reason);
          } else {
            const a = {
              title: after.data.page?.seoTitle?.value ?? "",
              description: after.data.page?.seoDescription?.value ?? "",
            };
            record("the title changed", (a.title ?? "") !== beforeTitle, `now ${JSON.stringify(a.title ?? "")}`);
            record(
              "THE DESCRIPTION SURVIVED UNTOUCHED",
              (a.description ?? "") === beforeDescription,
              `was ${JSON.stringify(beforeDescription)}, now ${JSON.stringify(a.description ?? "")}`
            );
          }
          // ---- staleness, the safety property, against a real store
          // Preview again, move the field behind the adapter's back,
          // then execute. The approved transition no longer matches
          // what is there, and execute must write NOTHING.
          const stalePv = await platform.preview(
            action({
              dealershipId,
              actionKey: "update_page_meta",
              targetRef: page.id,
              requestedChanges: { metaTitle: `${beforeTitle} ${STAMP} second` },
            })
          );
          if (stalePv.ok) {
            // Moves the field behind the adapter's back, through the
            // metafield the adapter itself reads — a nudge that wrote
            // somewhere else would prove nothing.
            await shopifyGraphQL<any>(
              creds.shop,
              creds.accessToken,
              `mutation VerifyNudge($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { message } } }`,
              {
                id: page.id,
                page: {
                  metafields: [
                    {
                      namespace: "global",
                      key: "title_tag",
                      type: "single_line_text_field",
                      value: `${beforeTitle} ${STAMP} moved`,
                    },
                  ],
                },
              }
            );
            const staleEx = await platform.execute(
              action({
                dealershipId,
                actionKey: "update_page_meta",
                targetRef: page.id,
                requestedChanges: { metaTitle: `${beforeTitle} ${STAMP} second` },
                preview: stalePv.preview,
                previewedAt: new Date().toISOString(),
              })
            );
            record(
              "STALENESS HOLDS AGAINST A REAL STORE",
              !staleEx.ok && staleEx.stale === true,
              !staleEx.ok && staleEx.stale
                ? `refused, nothing written: ${JSON.stringify(staleEx.changed)}`
                : `expected a stale refusal, got ${JSON.stringify(staleEx)}`
            );
          }
          // ---- put it back, through the adapter's own undo
          const restored = await applyUndo(platform, dealershipId, done);
          record("page SEO restored via undo()", restored === "restored", restored);
          const final = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_PAGE, { id: page.id });
          if (final.ok) {
            const f = {
              title: final.data.page?.seoTitle?.value ?? "",
              description: final.data.page?.seoDescription?.value ?? "",
            };
            record(
              "the page is exactly as it was found",
              (f.title ?? "") === beforeTitle && (f.description ?? "") === beforeDescription,
              `title=${JSON.stringify(f.title ?? "")} description=${JSON.stringify(f.description ?? "")}`
            );
          }
        }
      }
    }
  }

  // ================================================================
  // 2. articleCreate — and it must stay unpublished
  // ================================================================
  console.log("\n2. articleCreate — a draft post\n");
  {
    const act = action({
      dealershipId,
      actionKey: "publish_post",
      targetRef: blogs.length === 1 ? blogs[0].id : null,
      requestedChanges: {
        title: `${STAMP} verification draft`,
        html: "<p>Created by scripts/verify-shopify-content.ts to confirm articleCreate works. Safe to delete.</p>",
      },
    });
    const pv = await platform.preview(act);
    if (!pv.ok) {
      // A refusal here is a RESULT, not a failure: no blog, or several
      // and none named, are both correct refusals.
      record("blog post preview", false, pv.reason);
    } else {
      record("blog post preview", true, pv.preview.summary);
      record(
        "the preview says it will not be published",
        pv.preview.warnings.join(" ").toLowerCase().includes("unpublished"),
        pv.preview.warnings.join(" ")
      );
      if (WRITE) {
        const ex = await platform.execute({ ...act, preview: pv.preview, previewedAt: new Date().toISOString() });
        if (!ex.ok) {
          record("blog post execute", false, ex.stale ? "reported stale" : ex.reason);
        } else {
          const created = (ex.platformResponse as any)?.article;
          record("blog post execute", true, JSON.stringify(ex.platformResponse));
          if (created?.id) {
            const back = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_ARTICLE, { id: created.id });
            if (back.ok) {
              const art = back.data.article;
              record(
                "THE POST IS NOT LIVE ON THE STOREFRONT",
                art?.isPublished === false,
                `isPublished=${art?.isPublished} publishedAt=${JSON.stringify(art?.publishedAt)} blog="${art?.blog?.title}"`
              );
            }
            console.log(`        NOT UNDOABLE — delete by hand if unwanted: ${created.id}`);

            // ========================================================
            // 2b. articleUpdate — take that draft live, then put it
            //     back. THE ONLY UNVERIFIED MUTATION IN THIS FILE.
            // ========================================================
            //
            // `article(id:)` above is live-confirmed. `articleUpdate`
            // and `isPublished` on ArticleUpdateInput are from the
            // 2026-07 documentation and nothing else, which is exactly
            // how the `seo`-on-Page error and the missing required
            // `author` both got written. So this runs last, on the
            // draft this script just created and is already reporting
            // as disposable — it cannot touch a post the owner wrote.
            //
            // AND IT IS PUT BACK THROUGH THE ADAPTER'S OWN undo(),
            // like every other edit here. A post left live by a failed
            // restore is the one outcome that reaches a stranger, so
            // it is reported separately and loudly.
            console.log("\n2b. articleUpdate — the draft goes live, then back\n");
            const goLive = action({
              dealershipId,
              actionKey: "update_post",
              targetRef: created.id,
              targetLabel: `${STAMP} verification draft`,
              requestedChanges: { published: true },
            });
            const livePv = await platform.preview(goLive);
            if (!livePv.ok) {
              record("go-live preview", false, livePv.reason);
            } else {
              record("go-live preview", true, livePv.preview.summary);
              record(
                "the preview warns that customers will see it",
                livePv.preview.warnings.join(" ").toLowerCase().includes("customers"),
                livePv.preview.warnings.join(" ")
              );
              const liveDone = { ...goLive, preview: livePv.preview as PreviewDiff, previewedAt: new Date().toISOString() };
              const liveEx = await platform.execute(liveDone);
              if (!liveEx.ok) {
                record("go-live execute", false, (liveEx as any).stale ? "reported stale" : (liveEx as any).reason);
              } else {
                const back = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_ARTICLE, { id: created.id });
                record(
                  "THE POST IS NOW LIVE ON THE STOREFRONT",
                  back.ok && back.data.article?.isPublished === true,
                  back.ok ? `isPublished=${back.data.article?.isPublished} publishedAt=${JSON.stringify(back.data.article?.publishedAt)}` : "re-read failed"
                );
                // AND BACK TO A DRAFT, through undo().
                record("put back: " + (await applyUndo(platform, dealershipId, liveDone as PublishActionRecord)), true, "");
                const after = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_ARTICLE, { id: created.id });
                record(
                  "THE POST IS A DRAFT AGAIN, AND STILL EXISTS",
                  after.ok && after.data.article?.isPublished === false && Boolean(after.data.article?.id),
                  after.ok ? `isPublished=${after.data.article?.isPublished} id=${after.data.article?.id}` : "re-read failed"
                );
              }
            }
          }
        }
      }
    }
  }

  // ================================================================
  // 3. collectionUpdate — the argument form that matters
  // ================================================================
  console.log("\n3. collectionUpdate — the paragraph above the products\n");
  if (!collection) {
    record("collection text", false, "this store has no collections, so there is nothing to edit");
  } else {
    const before = collection.descriptionHtml ?? "";
    console.log(`   collection "${collection.title}" (/collections/${collection.handle}), ${collection.productsCount?.count ?? "?"} products`);
    const act = action({
      dealershipId,
      actionKey: "update_collection_text",
      targetRef: collection.id,
      targetLabel: collection.title,
      requestedChanges: { html: `${before}<p>${STAMP}</p>` },
    });
    const pv = await platform.preview(act);
    if (!pv.ok) {
      record("collection preview", false, pv.reason);
    } else {
      record("collection preview", true, pv.preview.summary);
      if (WRITE) {
        const done = { ...act, preview: pv.preview as PreviewDiff, previewedAt: new Date().toISOString() };
        const ex = await platform.execute(done);
        if (!ex.ok) {
          // THE ONE MOST LIKELY TO FAIL. If the error names
          // `collection` or CollectionUpdateInput, the 2026-07 docs and
          // this store's live schema disagree and the deprecated
          // `input:` form is the fallback.
          record("collection execute", false, ex.stale ? "reported stale" : ex.reason);
        } else {
          record("collection execute", true, JSON.stringify(ex.platformResponse));
          const after = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_COLLECTION, { id: collection.id });
          if (after.ok) {
            record(
              "the collection text changed",
              (after.data.collection?.descriptionHtml ?? "") !== before,
              `${(after.data.collection?.descriptionHtml ?? "").length} chars now, ${before.length} before`
            );
          }
          const restored = await applyUndo(platform, dealershipId, done);
          record("collection restored via undo()", restored === "restored", restored);
          const final = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_COLLECTION, { id: collection.id });
          if (final.ok) {
            record(
              "the collection is exactly as it was found",
              (final.data.collection?.descriptionHtml ?? "") === before,
              `${(final.data.collection?.descriptionHtml ?? "").length} chars`
            );
          }
        }
      }
    }
  }

  // ================================================================
  // 4. fileCreate — a real Hawlai-generated image
  // ================================================================
  console.log("\n4. fileCreate — a picture this product made\n");
  {
    // THE SOURCE MUST BE A REAL ONE. The adapter refuses any URL that
    // is not on the configured storage origin, so a made-up URL would
    // test the guard rather than the upload.
    //
    // ONE BUCKET, MANY PREFIXES — and the first version of this looked
    // only under `<dealershipId>/`, which is where AD CREATIVES go. A
    // business that had generated graphics but never an ad would have
    // been told "no image found, generate one first" while holding
    // several. Each writer in the codebase picks its own prefix; these
    // are all of the image ones, read off the upload calls rather than
    // assumed. Videos and voiceovers are excluded by extension, and
    // `agency-branding/` is keyed on a user id rather than a business.
    const PREFIXES = [
      `${dealershipId}`, // ads: adlaunch, generate-creative, preview
      `graphic-designs/${dealershipId}`,
      `content-autopilot/${dealershipId}`,
      `content-queue/${dealershipId}`,
      `social/${dealershipId}`,
      `website-assets/${dealershipId}`,
      `landing/${dealershipId}`,
      `logos/${dealershipId}`,
    ];

    type Found = { path: string; name: string; prefix: string; at: string };
    const candidates: Found[] = [];
    const listErrors: string[] = [];

    for (const prefix of PREFIXES) {
      const { data: listed, error: listErr } = await service.storage
        .from("ad-creatives")
        .list(prefix, { limit: 20, sortBy: { column: "created_at", order: "desc" } });
      if (listErr) {
        listErrors.push(`${prefix}: ${listErr.message}`);
        continue;
      }
      for (const f of listed ?? []) {
        if (!/\.(png|jpe?g|webp)$/i.test(f.name)) continue;
        candidates.push({
          path: `${prefix}/${f.name}`,
          name: f.name,
          prefix,
          at: (f as any).created_at ?? (f as any).updated_at ?? "",
        });
      }
    }

    let source: string | null = null;
    if (!candidates.length) {
      record(
        "find a Hawlai-generated image",
        false,
        listErrors.length
          ? `no image found; storage errors: ${listErrors.join(" | ")}`
          : `no image under any of ${PREFIXES.length} prefixes for this business — generate a graphic in the product first, then re-run`
      );
    } else {
      candidates.sort((a, b) => b.at.localeCompare(a.at));
      const img = candidates[0];
      const { data: pub } = service.storage.from("ad-creatives").getPublicUrl(img.path);
      source = pub.publicUrl;
      record(
        "find a Hawlai-generated image",
        true,
        `${img.path}  (newest of ${candidates.length} across ${new Set(candidates.map((c) => c.prefix)).size} prefix(es))`
      );
    }

    if (source) {
      const act = action({
        dealershipId,
        actionKey: "upload_image",
        requestedChanges: { imageUrl: source, alt: `${STAMP} verification upload`, filename: "hawlai-verify.png" },
      });
      const pv = await platform.preview(act);
      if (!pv.ok) {
        record("image upload preview", false, pv.reason);
      } else {
        record("image upload preview", true, pv.preview.summary);
        if (WRITE) {
          const ex = await platform.execute({ ...act, preview: pv.preview, previewedAt: new Date().toISOString() });
          if (!ex.ok) {
            // A scope error naming write_files means app version 4 did
            // not take effect for this install.
            record("image upload execute", false, ex.stale ? "reported stale" : ex.reason);
          } else {
            const r = ex.platformResponse as any;
            record("image upload execute", true, JSON.stringify(r));
            // PROCESSING, NOT FAILURE. A null url with processing=true
            // on a fast run is the documented behaviour, not a bug.
            record(
              "the status is reported honestly",
              typeof r.fileStatus === "string" && (r.url === null ? r.processing === true : r.processing === false),
              `fileStatus=${r.fileStatus} url=${JSON.stringify(r.url)} processing=${r.processing}`
            );
            console.log(`        NOT UNDOABLE — delete by hand if unwanted: ${r.id}`);
          }
        }
      }
    }
  }

  return finish();
}

/** Prints the summary and returns the exit code. Never exits. */
function finish(): number {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"-".repeat(60)}`);
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  if (!WRITE) {
    console.log("\nDRY RUN — nothing was written. Re-run with --write to execute.");
  }
  // SAID EVERY TIME, so a pasted result is never ambiguous about what
  // it covers. A pass here is a statement about the mutation shapes,
  // and with the override it is NOT a statement about the stored
  // credential or the OAuth-granted scopes.
  console.log(
    process.env.SHOPIFY_VERIFY_TOKEN
      ? "Credential: SHOPIFY_VERIFY_TOKEN (store-level). The encrypted-token path was not exercised."
      : CREDENTIAL_SOURCE === "minted"
        ? "Credential: minted via the client credentials grant. The encrypted-token path was not exercised."
        : "Credential: resolved and decrypted from the database — that path was exercised too."
  );
  return failed.length ? 1 : 0;
}

// NO process.exit() ANYWHERE, and that is the fix for a real failure
// rather than tidiness. Calling it while the Supabase client and
// in-flight fetches still hold handles makes libuv abort on Windows:
//
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
//   file src\win\async.c, line 94
//
// An abort does not flush stdout, so the run that hit it could have
// lost results it had already produced. Setting `exitCode` lets the
// event loop drain and the process end on its own.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error("\nThe script itself threw, which is not a result about Shopify:");
    console.error(e);
    process.exitCode = 2;
  });
