// ------------------------------------------------------------------
// Verify the WordPress write path against a REAL site.
// ------------------------------------------------------------------
// The same shape as scripts/verify-shopify-content.ts, and for the same
// reason: 7,700 passing tests prove the adapter behaves correctly
// against a fake fetch. They prove nothing about whether WordPress
// accepts the bodies it is sent — and on 22 November the Shopify script
// caught a producer bug that had been silently refused for two days,
// invisible to every one of those tests.
//
// This drives THE ADAPTER'S OWN preview() and execute() and undo(), not
// raw REST written for the occasion. The point is that the code under
// test is the code that will run in production.
//
//   npx tsx scripts/verify-wordpress-content.ts --site=<domain>
//   npx tsx scripts/verify-wordpress-content.ts --site=<domain> --write
//
// Run it with the react-server condition, like the Shopify one:
//
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-wordpress-content.ts --site=... --write
//
// lib/supabase/service.ts imports `server-only`, whose default export
// throws by design. Under `next dev` the react-server condition
// resolves it to an empty module; tsx has no such condition by default,
// so without the flag this dies on an import rather than on anything
// about WordPress.
//
// SAFETY PROPERTIES, deliberate and the same as the Shopify script's:
//
//   - DRY RUN IS THE DEFAULT. Without --write it reads and runs
//     preview() only. preview() never issues a write, which is
//     asserted here by counting the requests it makes.
//
//   - --site IS REQUIRED AND IS CHECKED. The script resolves the
//     credential from the database and refuses to continue unless the
//     stored site matches the one named on the command line. A script
//     that can write to a live site must not be able to pick the site
//     itself.
//
//   - EVERY EDIT IS PUT BACK, through the adapter's own undo() and a
//     second execute() — so the restore is the undo path under test
//     rather than a hand-written reversal. Reported separately, because
//     a restore that fails is a page left changed and has to be loud.
//
//   - ONE THING CANNOT BE PUT BACK and is not pretended otherwise: a
//     created post. It is reported with its id. The post is created as
//     a DRAFT, so nothing reaches a reader — and the go-live step below
//     publishes that same draft and then puts it back.
//
//   - NO CREDENTIAL IS EVER PRINTED.
// ------------------------------------------------------------------
import fs from "fs";

// tsx does not load .env.local the way `next dev` does, and this
// project has no dotenv dependency — the same note the Shopify script
// and backfill-commerce-secrets.ts carry. Existing environment
// variables win, so an exported value overrides the file.
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

import { createWordPressPlatform } from "../src/lib/publish/platforms/wordpress";
import { wordpressCredentialsAdapter } from "../src/lib/publish/platforms/wordpressCredentials";
import { restRoot, wordpressRequest, type WordPressCreds } from "../src/lib/commerce/wordpressRest";
import { createServiceClient } from "../src/lib/supabase/service";
import type { PreviewDiff, PublishActionRecord } from "../src/lib/publish/types";

const WRITE = process.argv.includes("--write");
const SITE_ARG = (process.argv.find((a) => a.startsWith("--site=")) ?? "").split("=")[1] ?? "";
const STAMP = `[hawlai-verify ${new Date().toISOString().slice(0, 16)}]`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function record(what: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    failures.push(`${what}${detail ? `: ${detail}` : ""}`);
  }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (detail) console.log(`        ${detail}`);
}

const action = (over: Partial<PublishActionRecord>): PublishActionRecord =>
  ({
    id: `verify-${Math.random().toString(36).slice(2, 8)}`,
    platform: "wordpress",
    preview: null,
    previewedAt: null,
    targetRef: null,
    targetLabel: null,
    requestedChanges: {},
    ...over,
  }) as unknown as PublishActionRecord;

/** A fetch that counts what the adapter actually sent. */
function countingFetch(): { impl: typeof fetch; sent: { method: string; url: string }[] } {
  const sent: { method: string; url: string }[] = [];
  const impl = (async (url: any, init: any) => {
    sent.push({ method: init?.method ?? "GET", url: String(url) });
    return fetch(url, init);
  }) as unknown as typeof fetch;
  return { impl, sent };
}

async function applyUndo(
  platform: ReturnType<typeof createWordPressPlatform>,
  done: PublishActionRecord
): Promise<string> {
  if (!platform.undo) return "the adapter declares no undo at all";
  const proposal = await platform.undo(done);
  if (!proposal.ok) return `undo refused: ${proposal.reason}`;
  const back = action({
    dealershipId: done.dealershipId,
    actionKey: proposal.actionKey,
    targetRef: proposal.targetRef,
    targetLabel: proposal.targetLabel,
    requestedChanges: proposal.requestedChanges,
  });
  const pv = await platform.preview(back);
  if (!pv.ok) return `undo preview refused: ${pv.reason}`;
  const ex = await platform.execute({ ...back, preview: pv.preview as PreviewDiff, previewedAt: new Date().toISOString() });
  if (!ex.ok) return `undo execute failed: ${(ex as any).stale ? "reported stale" : (ex as any).reason}`;
  return "restored";
}

async function main(): Promise<number> {
  if (!SITE_ARG) {
    console.error("Refusing to run: --site=<domain> is required.");
    console.error("A script that can write to a live site must not be able to pick the site itself.");
    return 1;
  }

  console.log("Verifying the WordPress content write path against a real site.\n");

  const service = createServiceClient();
  const { data: dealership } = await service
    .from("dealerships")
    .select("id, dealership_name, wordpress_site_url")
    .not("wordpress_site_url", "is", null)
    .limit(1)
    .maybeSingle();

  if (!dealership?.id) {
    console.error("No business has a WordPress site connected. Connect one in Settings first.");
    return 1;
  }

  // THE STORED CREDENTIAL FIRST, AND AN ENV FALLBACK SECOND — with the
  // run saying plainly which one it used.
  //
  // WHY THE FALLBACK EXISTS, 22 November 2026. The stored value is
  // encrypted under COMMERCE_ENCRYPTION_KEY, and the key a DEPLOYED
  // Hawlai used is not the key sitting in a developer's .env.local — a
  // probe confirmed both the Shopify token and the WordPress password
  // fail to decrypt locally with the same auth-tag error, so this is
  // about the key and not about either platform. The Shopify script
  // never hit this because it mints a fresh token and says so.
  //
  // The alternative was to copy the production encryption key onto a
  // laptop, which widens the blast radius of the one secret that
  // protects every merchant's store credentials — to test a throwaway
  // sandbox. The sandbox's own application password is disposable and
  // revocable in one click, so it travels instead.
  let creds = await wordpressCredentialsAdapter(dealership.id);
  let credentialSource = "the stored, encrypted credential";
  if (!creds) {
    const siteUrl = process.env.WP_VERIFY_SITE_URL;
    const username = process.env.WP_VERIFY_USERNAME;
    const appPassword = process.env.WP_VERIFY_APP_PASSWORD;
    if (siteUrl && username && appPassword) {
      creds = { siteUrl, username, appPassword };
      credentialSource = "WP_VERIFY_* from the environment — THE ENCRYPTED PATH WAS NOT EXERCISED";
    }
  }
  if (!creds) {
    console.error("No usable WordPress credential.");
    console.error("");
    console.error("The stored one could not be decrypted — most likely this machine's");
    console.error("COMMERCE_ENCRYPTION_KEY is not the key the deployed app encrypted with.");
    console.error("");
    console.error("Either reconnect the site from a Hawlai running with this machine's key,");
    console.error("or put a disposable application password in .env.local:");
    console.error("");
    console.error("  WP_VERIFY_SITE_URL=https://<site>");
    console.error("  WP_VERIFY_USERNAME=<wp username>");
    console.error("  WP_VERIFY_APP_PASSWORD=<application password>");
    return 1;
  }
  if (restRoot(creds.siteUrl) !== restRoot(SITE_ARG)) {
    console.error(`Resolved credential is for ${restRoot(creds.siteUrl)}, not ${restRoot(SITE_ARG)}. Refusing to continue.`);
    return 1;
  }

  console.log(`Business:  ${dealership.dealership_name} (${dealership.id})`);
  console.log(`Site:      ${restRoot(creds.siteUrl)}`);
  console.log(`Mode:      ${WRITE ? "WRITE — real edits, each one put back" : "DRY RUN — reads and previews only"}\n`);

  const platform = createWordPressPlatform({ getCredentials: async () => creds });
  const dealershipId = dealership.id as string;

  record("the credential resolves and matches --site", true, `${credentialSource}; application password for ${creds.username} (not printed)`);
  record("the site answers an authenticated request", await platform.isConnected(dealershipId), "GET /wp/v2/users/me");

  // ================================================================
  // 0. What the live site actually returns — the three rendered traps
  // ================================================================
  console.log("\n0. raw vs rendered — the thing that would break staleness\n");
  {
    const posts = await wordpressRequest<any[]>(creds, "/wp/v2/posts?per_page=1");
    if (!posts.ok || !posts.data.length) {
      record("read a post with context=edit", false, posts.ok ? "the site has no posts" : posts.reason);
    } else {
      const p = posts.data[0];
      record("context=edit returns title.raw", typeof p.title?.raw === "string", `title.raw=${JSON.stringify(p.title?.raw)}`);
      record("context=edit returns content.raw", typeof p.content?.raw === "string", `${String(p.content?.raw ?? "").length} chars raw`);
      // THE ASSERTION THAT MATTERS. If these were equal the trap would
      // be theoretical; they are not, which is why every comparison in
      // the adapter uses raw.
      record(
        "RENDERED IS NOT RAW, so comparing the wrong one would always read as stale",
        String(p.content?.raw ?? "") !== String(p.content?.rendered ?? ""),
        `raw=${JSON.stringify(String(p.content?.raw ?? "").slice(0, 48))} rendered=${JSON.stringify(String(p.content?.rendered ?? "").slice(0, 48))}`
      );
      const metaKeys = Object.keys(p.meta ?? {});
      record(
        "Yoast's keys are present and writable through wp/v2",
        metaKeys.includes("_yoast_wpseo_title") && metaKeys.includes("_yoast_wpseo_metadesc"),
        `meta keys: ${metaKeys.join(", ") || "none"}`
      );
    }
  }

  // ================================================================
  // 1. A page's text — preview, execute, staleness, undo
  // ================================================================
  console.log("\n1. update_page_text — the words on a page\n");
  const pages = await wordpressRequest<any[]>(creds, "/wp/v2/pages?per_page=1");
  const page = pages.ok ? pages.data[0] : null;
  if (!page) {
    record("page text", false, pages.ok ? "this site has no pages" : pages.reason);
  } else {
    const before = String(page.content?.raw ?? "");
    const ref = `page:${page.id}`;
    console.log(`   page "${page.title?.raw}" (/${page.slug}), ${before.length} chars`);

    const { impl, sent } = countingFetch();
    const counted = createWordPressPlatform({ getCredentials: async () => creds, fetchImpl: impl });
    const act = action({
      dealershipId,
      actionKey: "update_page_text",
      targetRef: ref,
      targetLabel: page.title?.raw,
      requestedChanges: { html: `${before}\n<p>${STAMP}</p>` },
    });
    const pv = await counted.preview(act);
    if (!pv.ok) {
      record("page text preview", false, pv.reason);
    } else {
      record("page text preview", true, pv.preview.summary);
      record(
        "preview issued no write",
        sent.every((s) => s.method === "GET"),
        `${sent.length} call(s): ${sent.map((s) => s.method).join(", ")}`
      );
      const change = pv.preview.changes.find((c) => c.field === "content");
      record("THE WHOLE PRIOR BODY IS THE BEFORE-VALUE", change?.before === before, `${String(change?.before ?? "").length} chars recorded`);

      if (WRITE) {
        const done = { ...act, preview: pv.preview as PreviewDiff, previewedAt: new Date().toISOString() };
        const ex = await platform.execute(done);
        if (!ex.ok) {
          record("page text execute", false, (ex as any).stale ? "reported stale" : (ex as any).reason);
        } else {
          record("page text execute", true, JSON.stringify(ex.platformResponse));
          const after = await wordpressRequest<any>(creds, `/wp/v2/pages/${page.id}`);
          record("the page changed on the live site", after.ok && String(after.data.content?.raw ?? "").includes(STAMP), after.ok ? `${String(after.data.content?.raw ?? "").length} chars now` : "re-read failed");

          // A REPLAY IS A NO-OP, NOT A SECOND WRITE. The page is
          // already at the target, and the adapter says so rather than
          // writing again — the same contract the Shopify adapter
          // keeps. The first version of this block asserted that a
          // replay should be STALE, and reported the correct no-op as
          // "it wrote twice". The page was never touched twice; the
          // assertion was wrong, and only the live run showed it.
          const replay = await platform.execute(done);
          record(
            "A REPLAY OF THE SAME APPROVED ACTION IS A NO-OP",
            replay.ok && Boolean((replay.platformResponse as any)?.skipped),
            replay.ok ? JSON.stringify(replay.platformResponse) : "it refused a replay instead of no-opping"
          );

          // STALENESS IS THE OTHER CASE: an approval whose before-value
          // the site has since moved past. Same recorded `before`, a
          // different `after`, so the live content matches neither.
          const moved = `${before}\n<p>${STAMP} second</p>`;
          const again = await platform.execute({
            ...done,
            requestedChanges: { html: moved },
            preview: { ...pv.preview, changes: [{ field: "content", before, after: moved }] } as PreviewDiff,
          } as PublishActionRecord);
          record(
            "STALENESS HOLDS AGAINST A REAL SITE",
            !again.ok && (again as any).stale === true,
            !again.ok && (again as any).stale
              ? "refused, nothing written"
              : "it applied an edit whose before-value had already moved"
          );

          record(`put back: ${await applyUndo(platform, done as PublishActionRecord)}`, true, "");
          const restored = await wordpressRequest<any>(creds, `/wp/v2/pages/${page.id}`);
          record("the page is exactly as it was found", restored.ok && String(restored.data.content?.raw ?? "") === before, restored.ok ? `${String(restored.data.content?.raw ?? "").length} chars` : "re-read failed");
        }
      }
    }
  }

  // ================================================================
  // 2. Yoast's two lines — the half that needed the plugin
  // ================================================================
  console.log("\n2. update_page_meta — the search title and description (Yoast)\n");
  //
  // AGAINST A POST, NOT A PAGE, and the first dry run is why. Yoast
  // registers its editable meta in REST PER CONTENT TYPE: on this site
  // posts carry _yoast_wpseo_title and pages do not, while Yoast is
  // active for both. Testing the write on a page would have proved
  // nothing except that the refusal fires.
  //
  // Both halves are checked: the write on a type that exposes the
  // fields, and the honest refusal on one that does not.
  const metaPosts = await wordpressRequest<any[]>(creds, "/wp/v2/posts?per_page=1");
  const metaPost = metaPosts.ok ? metaPosts.data[0] : null;
  if (page) {
    const refused = await platform.preview(
      action({ dealershipId, actionKey: "update_page_meta", targetRef: `page:${page.id}`, requestedChanges: { seoTitle: "x" } })
    );
    const exposed = typeof page.meta?._yoast_wpseo_title === "string";
    record(
      exposed
        ? "pages expose Yoast's fields on this site, so the write path is used"
        : "A CONTENT TYPE WITHOUT YOAST'S FIELDS IS REFUSED, not written to",
      exposed ? refused.ok : !refused.ok,
      !refused.ok ? refused.reason : "pages do expose them here"
    );
    if (!exposed && !refused.ok) {
      // The refusal must name the real cause. The first version said
      // "Yoast isn't active", which was untrue and would have sent the
      // owner to reinstall a running plugin.
      record(
        "and the refusal names the CONTENT TYPE, not a missing plugin",
        /Content types/i.test(refused.reason) && !/doesn't have Yoast SEO active/i.test(refused.reason),
        refused.reason
      );
    }
  }
  if (!metaPost) {
    record("post meta", false, metaPosts.ok ? "this site has no posts" : metaPosts.reason);
  } else {
    const beforeTitle = typeof metaPost.meta?._yoast_wpseo_title === "string" ? metaPost.meta._yoast_wpseo_title : "";
    const beforeDesc = typeof metaPost.meta?._yoast_wpseo_metadesc === "string" ? metaPost.meta._yoast_wpseo_metadesc : "";
    console.log(`   post "${metaPost.title?.raw}" — before: title=${JSON.stringify(beforeTitle)} description=${JSON.stringify(beforeDesc)}`);
    const act = action({
      dealershipId,
      actionKey: "update_page_meta",
      targetRef: `post:${metaPost.id}`,
      targetLabel: metaPost.title?.raw,
      requestedChanges: { seoTitle: `${beforeTitle} ${STAMP}`.trim() },
    });
    const pv = await platform.preview(act);
    if (!pv.ok) {
      record("post meta preview", false, pv.reason);
    } else {
      record("post meta preview", true, pv.preview.summary);
      record(
        "preview proposes only the title",
        pv.preview.changes.every((c) => c.field !== "seoDescription"),
        "seoDescription is absent from the diff, so only the title was asked for"
      );
      if (WRITE) {
        const done = { ...act, preview: pv.preview as PreviewDiff, previewedAt: new Date().toISOString() };
        const ex = await platform.execute(done);
        if (!ex.ok) {
          record("post meta execute", false, (ex as any).stale ? "reported stale" : (ex as any).reason);
        } else {
          const after = await wordpressRequest<any>(creds, `/wp/v2/posts/${metaPost.id}`);
          const nowTitle = after.ok ? String(after.data.meta?._yoast_wpseo_title ?? "") : "";
          const nowDesc = after.ok ? String(after.data.meta?._yoast_wpseo_metadesc ?? "") : "";
          record("the search title changed", nowTitle.includes(STAMP), `now ${JSON.stringify(nowTitle)}`);
          // THE ASSERTION THE WHOLE "only what changes is sent" RULE
          // EXISTS FOR: a meta object carrying both keys would blank
          // the description on a site where it was set outside Hawlai.
          record("THE DESCRIPTION SURVIVED UNTOUCHED", nowDesc === beforeDesc, `was ${JSON.stringify(beforeDesc)}, now ${JSON.stringify(nowDesc)}`);

          record(`put back: ${await applyUndo(platform, done as PublishActionRecord)}`, true, "");
          const restored = await wordpressRequest<any>(creds, `/wp/v2/posts/${metaPost.id}`);
          record(
            "the search listing is exactly as it was found",
            restored.ok && String(restored.data.meta?._yoast_wpseo_title ?? "") === beforeTitle,
            restored.ok ? `title=${JSON.stringify(String(restored.data.meta?._yoast_wpseo_title ?? ""))}` : "re-read failed"
          );
        }
      }
    }
  }

  // ================================================================
  // 3. A new post — created as a draft, then taken live, then back
  // ================================================================
  console.log("\n3. publish_post + update_post — a draft, live, and back\n");
  {
    const act = action({
      dealershipId,
      actionKey: "publish_post",
      requestedChanges: { title: `${STAMP} verification draft`, html: "<p>Created by scripts/verify-wordpress-content.ts. Safe to delete.</p>" },
    });
    const pv = await platform.preview(act);
    if (!pv.ok) {
      record("post preview", false, pv.reason);
    } else {
      record("post preview", true, pv.preview.summary);
      record("the preview says it will not be published", pv.preview.warnings.join(" ").toLowerCase().includes("draft"), pv.preview.warnings.join(" "));
      if (WRITE) {
        const ex = await platform.execute({ ...act, preview: pv.preview as PreviewDiff, previewedAt: new Date().toISOString() });
        if (!ex.ok) {
          record("post execute", false, (ex as any).reason);
        } else {
          const made = (ex.platformResponse as any)?.post;
          record("post execute", true, JSON.stringify(ex.platformResponse));
          record("THE POST IS NOT LIVE", made?.status === "draft", `status=${made?.status}`);
          console.log(`        NOT UNDOABLE — delete by hand if unwanted: ${made?.targetRef}`);

          // ---- take it live, then put it back --------------------
          const live = action({
            dealershipId,
            actionKey: "update_post",
            targetRef: made.targetRef,
            targetLabel: `${STAMP} verification draft`,
            requestedChanges: { published: true },
          });
          const livePv = await platform.preview(live);
          if (!livePv.ok) {
            record("go-live preview", false, livePv.reason);
          } else {
            record("go-live preview", true, livePv.preview.summary);
            record("the preview warns that readers will see it", livePv.preview.warnings.join(" ").toLowerCase().includes("readers"), livePv.preview.warnings.join(" "));
            const liveDone = { ...live, preview: livePv.preview as PreviewDiff, previewedAt: new Date().toISOString() };
            const liveEx = await platform.execute(liveDone);
            if (!liveEx.ok) {
              record("go-live execute", false, (liveEx as any).stale ? "reported stale" : (liveEx as any).reason);
            } else {
              const back = await wordpressRequest<any>(creds, `/wp/v2/posts/${made.id}`);
              record("THE POST IS NOW LIVE ON THE SITE", back.ok && back.data.status === "publish", back.ok ? `status=${back.data.status} link=${back.data.link}` : "re-read failed");
              record(`put back: ${await applyUndo(platform, liveDone as PublishActionRecord)}`, true, "");
              const after = await wordpressRequest<any>(creds, `/wp/v2/posts/${made.id}`);
              record("THE POST IS A DRAFT AGAIN, AND STILL EXISTS", after.ok && after.data.status === "draft" && Boolean(after.data.id), after.ok ? `status=${after.data.status} id=${after.data.id}` : "re-read failed");
            }
          }
        }
      }
    }
  }

  // ================================================================
  // 4. The refusals — what it will NOT do
  // ================================================================
  console.log("\n4. refusals\n");
  {
    const bad = await platform.preview(action({ dealershipId, actionKey: "update_page_text", targetRef: "42", requestedChanges: { html: "x" } }));
    record("a bare id is refused, because posts and pages share an id space", !bad.ok, !bad.ok ? bad.reason : "it accepted one");

    const unsupported = await platform.preview(action({ dealershipId, actionKey: "update_product_price", targetRef: "post:1", requestedChanges: { price: "1" } }));
    record("a WooCommerce action is refused by the WordPress adapter", !unsupported.ok, !unsupported.ok ? unsupported.reason : "it accepted one");
  }

  console.log(`\n${"-".repeat(60)}\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailed:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("\nThe run itself failed:", err?.message ?? err);
    process.exit(1);
  });
