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
      nodes { id title handle isPublished seo { title description } }
    }
    collections(first: 5) {
      nodes { id title handle descriptionHtml productsCount { count } }
    }
    blogs(first: 5) { nodes { id title handle } }
  }
`;

const READ_PAGE = `query VerifyPage($id: ID!) { page(id: $id) { id title body seo { title description } } }`;
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
  const NEEDED = [
    ["NEXT_PUBLIC_SUPABASE_URL", "Vercel → Settings → Environment Variables"],
    ["SUPABASE_SERVICE_ROLE_KEY", "Vercel → Settings → Environment Variables (secret — do not paste it into chat)"],
    ["COMMERCE_ENCRYPTION_KEY", "already in .env.local"],
  ] as const;
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

  // ---------------- the credential, through the real path ------------
  const creds = await shopifyCredentialsAdapter(dealershipId);
  if (!creds) {
    console.error("Couldn't resolve a Shopify credential. Is the store still connected?");
    return 1;
  }
  if (creds.shop !== SHOP_ARG) {
    console.error(`Resolved credential is for ${creds.shop}, not ${SHOP_ARG}. Refusing to continue.`);
    return 1;
  }
  record("the stored credential resolves and matches --shop", true, `token for ${creds.shop} (not printed)`);

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
    const beforeTitle = page.seo?.title ?? "";
    const beforeDescription = page.seo?.description ?? "";
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
          // THE LOAD-BEARING READ-BACK. Shopify's seo input replaces
          // the object, so this is where a dropped description shows.
          const after = await shopifyGraphQL<any>(creds.shop, creds.accessToken, READ_PAGE, { id: page.id });
          if (!after.ok) {
            record("page SEO read-back", false, after.reason);
          } else {
            const a = after.data.page?.seo ?? {};
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
            await shopifyGraphQL<any>(
              creds.shop,
              creds.accessToken,
              `mutation VerifyNudge($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { message } } }`,
              { id: page.id, page: { seo: { title: `${beforeTitle} ${STAMP} moved`, description: beforeDescription } } }
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
            const f = final.data.page?.seo ?? {};
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
