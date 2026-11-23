// WordPress — posts, pages, and Yoast's two search-result lines.
//
// Content only. WooCommerce is a separate namespace on the same host
// (/wp-json/wc/v3/… beside /wp-json/wp/v2/…) with its own credential,
// and it is a separate adapter when its phase comes — see
// docs/RESEARCH-WOO-WP.md.
//
// ───────────────────────────────────────────────────────────────────
// EVERY SHAPE BELOW WAS PROBED AGAINST A LIVE SITE on 22 November 2026,
// before any of it was written. That ordering is the whole lesson of
// the Shopify adapter, which needed FOUR corrections after meeting a
// real store — a `seo` field that did not exist on `Page`, a required
// `author` hidden by a filtered introspection, an empty metafield write
// Shopify accepted and ignored, and a producer still writing the old
// key. Three of the four were invisible to a green test suite.
//
// THE TRAP THIS PLATFORM HAS, THREE TIMES OVER. WordPress returns a
// RENDERED value and a RAW value for the same field, and the rendered
// one is never what you wrote:
//
//   title.rendered              vs  title.raw
//   content.rendered            vs  content.raw      (block markup, expanded)
//   yoast_head_json.title       vs  meta._yoast_wpseo_title
//
// The third is the subtlest: `yoast_head_json.title` is the COMPUTED
// search title, with the site-name template already applied — a live
// post with no override at all reads back as "Hello world! - Gruesome
// Feast". Storing that as a before-value and writing it back would turn
// a template into a hard-coded string on the owner's site.
//
// Picking the rendered side anywhere here produces an adapter that
// reports EVERY change as stale, for ever, and a fake-fetch test cannot
// see it: the fake returns whatever it is handed.
//
// So every read goes through wordpressRequest, which forces
// `context=edit` (the only context that returns `raw`, and one that
// requires authentication), and every comparison uses the raw side.
//
// YOAST'S KEYS ARE REGISTERED FOR REST, which was worth confirming
// rather than assuming — the plugin's own `yoast/v1` namespace has no
// route that writes a post's title or description, so if these were not
// in `wp/v2` there would be no write path at all and `update_page_meta`
// would have had to leave Phase 1. The live OPTIONS schema says:
//
//   meta properties: _yoast_wpseo_focuskw, _yoast_wpseo_title,
//                    _yoast_wpseo_metadesc, footnotes
//
// They do NOT appear in an unauthenticated read's `meta` object, which
// is why a first look suggested they were absent.
// ───────────────────────────────────────────────────────────────────

import type {
  ActionKey,
  ExecuteResult,
  FieldChange,
  PreviewResult,
  PublishActionRecord,
  PublishPlatform,
  UndoProposal,
} from "../types";
import { publishError, publishLog } from "../log";
import { wordpressRequest, type WordPressCreds } from "@/lib/commerce/wordpressRest";

/**
 * Yoast's two post-meta keys, confirmed writable against a live site.
 *
 * Named once. The Shopify adapter spent a day with its preview reading
 * `seoTitle` while its undo built `metaTitle`, and a key spelled twice
 * is how that happens.
 */
const YOAST_TITLE = "_yoast_wpseo_title";
const YOAST_DESC = "_yoast_wpseo_metadesc";

type WpRendered = { raw?: string; rendered?: string };

type WpItem = {
  id: number;
  slug: string;
  status: string;
  link: string;
  title: WpRendered;
  content: WpRendered;
  meta?: Record<string, unknown>;
  /** Present on every item when Yoast is active, whatever the content type. */
  yoast_head_json?: Record<string, unknown>;
};

/**
 * Whether Yoast's EDITABLE fields are reachable for this item.
 *
 * FOUND ON THE FIRST DRY RUN against a live site, 22 November 2026, and
 * it is the reason this is three states rather than a boolean:
 *
 *   posts →  meta: _yoast_wpseo_focuskw, _yoast_wpseo_title,
 *                  _yoast_wpseo_metadesc, footnotes
 *   pages →  meta: footnotes
 *
 * Yoast was active for BOTH — a page carries `yoast_head_json` and its
 * computed title — but it registers the editable meta keys in REST per
 * content type, and pages were not among them on that install.
 *
 * The first version of this check saw a page's bare `meta` and told the
 * owner "Yoast SEO isn't active", which was flatly untrue and would
 * have sent them to reinstall a plugin that was already running. The
 * two causes have different fixes, so they are different answers.
 *
 * `yoast_head_json` is the discriminator because Yoast adds it to every
 * REST item it knows about, regardless of whether the editable meta is
 * exposed.
 */
type YoastState = "ready" | "not_exposed_for_type" | "absent";

function yoastState(item: WpItem): YoastState {
  if (item.meta && YOAST_TITLE in item.meta) return "ready";
  return item.yoast_head_json ? "not_exposed_for_type" : "absent";
}

function yoastRefusal(state: Exclude<YoastState, "ready">, kind: WpKind): string {
  return state === "absent"
    ? "This WordPress site doesn't have Yoast SEO active, and WordPress itself has no search title or description to set. Activate Yoast and ask again."
    : // NOT "turn on a setting", BECAUSE THAT ADVICE WAS WRONG.
      //
      // This sentence used to say "Turn it on in Yoast SEO → Settings
      // → Content types". The owner did exactly that on 23 November
      // 2026 — both "Show pages in search results" and "Enable SEO
      // controls and assessments" — and nothing changed: Yoast 28.9
      // still registered _yoast_wpseo_title for `post` and not for
      // `page`, measured twice, on the item's own `meta` and on the
      // route's OPTIONS schema, which is post-type level and not about
      // any one item.
      //
      // So those toggles govern the editor and indexability, not the
      // REST registration, and sending the owner back to them is
      // sending them to do something that cannot work. A refusal that
      // prescribes a fix which does not fix it is worse than one that
      // says plainly what is possible instead.
      `Yoast SEO is active here, but it doesn't expose the search title and description for ${kind}s through the API that Hawlai uses, so there is nothing to write. Hawlai can set them on ${kind === "page" ? "posts" : "pages"} on this site. This is not a setting in Yoast — the content-type toggles do not change it.`;
}

/**
 * WHICH KIND OF THING, AND WHY targetRef CARRIES IT.
 *
 * A WordPress id is a bare integer and the id space is SHARED between
 * posts and pages — /wp/v2/posts/5 and /wp/v2/pages/5 can both exist
 * and be different things. Shopify had no such problem: a gid names its
 * own type. An adapter that guessed would eventually edit the wrong
 * one, silently, and the owner would find a page rewritten with a blog
 * post's words.
 *
 * So the reference is explicit — "post:5" or "page:5" — and anything
 * else is refused rather than defaulted.
 */
type WpKind = "post" | "page";

function parseRef(targetRef: string | null | undefined): { kind: WpKind; id: number } | null {
  const match = /^(post|page):(\d+)$/.exec(String(targetRef ?? "").trim());
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) && id > 0 ? { kind: match[1] as WpKind, id } : null;
}

const route = (kind: WpKind) => (kind === "post" ? "/wp/v2/posts" : "/wp/v2/pages");

/** The stored value, never the rendered one. See the header. */
const raw = (field: WpRendered | undefined): string => String(field?.raw ?? "");

/**
 * Did this read actually come back in the editable context?
 *
 * ADDED AFTER A MUTATION SURVIVED, 22 November 2026. `raw()` returning
 * "" for a missing `raw` is silently wrong in the one case that
 * matters: a read that did not carry `context=edit` has no `raw` at
 * all, so every before-value becomes "" — and on execute "" compares
 * equal to "", the staleness check passes, and the adapter overwrites a
 * page whose contents it never actually saw.
 *
 * `rendered` is NOT an acceptable substitute, which is the whole point
 * of the header: it is a transformed value and comparing it would make
 * every change read as stale. So there is no fallback. A read without
 * `raw` is a read this adapter cannot reason about, and it says so.
 */
function hasEditableFields(item: WpItem): boolean {
  return typeof item.title?.raw === "string" && typeof item.content?.raw === "string";
}

const NOT_EDITABLE =
  "WordPress returned this item without its editable fields, so Hawlai can't see what it currently says. Nothing was changed.";

/** A Yoast override as stored, which is "" when the owner has set none. */
const yoast = (item: WpItem, key: string): string => {
  const value = item.meta?.[key];
  return typeof value === "string" ? value : "";
};

export function createWordPressPlatform(deps: {
  getCredentials: (dealershipId: string) => Promise<WordPressCreds | null>;
  fetchImpl?: typeof fetch;
}): PublishPlatform {
  const fetchImpl = deps.fetchImpl ?? fetch;

  /**
   * What this platform can genuinely do.
   *
   * A declared capability is a promise the tool layer reads, so nothing
   * unbuilt is listed. WooCommerce's keys — product price, description,
   * name, discount codes — are deliberately absent: they belong to a
   * different namespace, a different credential and a different phase.
   */
  const supports: readonly ActionKey[] = [
    "publish_post",
    "update_post",
    "update_page_text",
    "update_page_meta",
  ];

  /**
   * Which of those can be put back.
   *
   * publish_post is absent for the reason the Shopify adapter records:
   * un-creating a post is a DELETION, and a deletion is not the reverse
   * of a creation in any sense an owner would accept — the post may
   * have been edited since. It is created as a draft instead, so
   * nothing went live to take back.
   *
   * The other three are genuine edits with a prior value, so each undo
   * is a real reverse rather than a deletion wearing the word.
   */
  const undoes: readonly ActionKey[] = ["update_post", "update_page_text", "update_page_meta"];

  async function readItem(creds: WordPressCreds, kind: WpKind, id: number): Promise<WpItem | null> {
    const result = await wordpressRequest<WpItem>(creds, `${route(kind)}/${id}`, {}, fetchImpl);
    return result.ok ? result.data : null;
  }

  return {
    id: "wordpress",
    supports,
    undoes,

    async isConnected(dealershipId: string): Promise<boolean> {
      const creds = await deps.getCredentials(dealershipId);
      if (!creds) return false;
      // A STORED CREDENTIAL IS NOT A WORKING ONE. An application
      // password revoked in WordPress still sits in our column, and an
      // expired sandbox still has a URL. The only honest answer comes
      // from asking the site.
      const who = await wordpressRequest<{ id: number }>(creds, "/wp/v2/users/me", {}, fetchImpl);
      return who.ok;
    },

    async preview(action: PublishActionRecord): Promise<PreviewResult> {
      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "WordPress isn't connected." };

      // ---- a new post, created as a DRAFT -------------------------
      //
      // Nothing reaches a reader on approval. The second step —
      // update_post with status "publish" — is its own approval, the
      // same shape the Shopify adapter and a Meta campaign both use:
      // create inert, go live separately.
      if (action.actionKey === "publish_post") {
        const title = typeof action.requestedChanges.title === "string" ? action.requestedChanges.title.trim() : "";
        const body = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : "";
        if (!title) return { ok: false, reason: "A post needs a headline." };
        if (!body.trim()) return { ok: false, reason: "A post needs some text." };

        return {
          ok: true,
          preview: {
            summary: `New post "${title}" on the WordPress site — created as a draft, not published`,
            target: { title, variantTitle: null, currentPrice: null, imageUrl: null },
            // `before: null` IS WHAT MARKS A CREATION, the same
            // convention the Shopify adapter follows. There is no prior
            // value, and undoing a creation is a different decision
            // from undoing an edit.
            changes: [{ field: "post", before: null, after: title }],
            warnings: [
              "The post is created as a draft. Publishing it is a separate approval, so nothing goes live when you approve this.",
            ],
          },
        };
      }

      const ref = parseRef(action.targetRef);
      if (!ref) {
        return { ok: false, reason: "That action didn't say which post or page it meant." };
      }
      const item = await readItem(creds, ref.kind, ref.id);
      if (!item) return { ok: false, reason: `That ${ref.kind} no longer exists on the WordPress site.` };
      if (!hasEditableFields(item)) return { ok: false, reason: NOT_EDITABLE };

      // ---- take a post live, or put it back to a draft -------------
      if (action.actionKey === "update_post") {
        const wanted = action.requestedChanges.published;
        if (wanted !== true && wanted !== false) {
          // STRICTLY BOOLEAN. `Boolean("false")` is true, and a JSON
          // round trip through a jsonb column can hand back that
          // string — the failure direction being a live post nobody
          // approved.
          return { ok: false, reason: "That action didn't say whether to publish the post or unpublish it." };
        }
        const nextStatus = wanted ? "publish" : "draft";
        const warnings: string[] = [];
        if (item.status === nextStatus) {
          warnings.push(wanted ? "This post is already live, so approving will change nothing." : "This post is already a draft, so approving will change nothing.");
        }
        if (wanted && item.status !== "publish") {
          warnings.push("Approving this puts the post on the live site, where readers and search engines can find it.");
        }
        if (!wanted && item.status === "publish") {
          warnings.push("The post comes off the live site and goes back to being a draft. Nothing is deleted.");
        }
        return {
          ok: true,
          preview: {
            summary: wanted
              ? `"${raw(item.title)}" goes live on the WordPress site`
              : `"${raw(item.title)}" comes off the live site and goes back to a draft`,
            target: { title: raw(item.title), variantTitle: null, currentPrice: null, imageUrl: null },
            changes: [{ field: "status", before: item.status, after: nextStatus }],
            warnings,
          },
        };
      }

      // ---- the words on a page or a post --------------------------
      if (action.actionKey === "update_page_text") {
        const html = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : null;
        if (html === null) return { ok: false, reason: `No new text was given for that ${ref.kind}.` };

        const current = raw(item.content);
        const warnings: string[] = [];
        if (current.trim() === html.trim()) {
          warnings.push(`The ${ref.kind} already reads this way — approving will change nothing.`);
        }
        if (item.status !== "publish") {
          warnings.push(`This ${ref.kind} is a ${item.status} on the site, so the change won't be visible to readers yet.`);
        }
        return {
          ok: true,
          preview: {
            summary: `"${raw(item.title)}" (/${item.slug}): ${ref.kind} text updated`,
            target: { title: raw(item.title), variantTitle: null, currentPrice: null, imageUrl: null },
            // THE WHOLE BODY IS THE BEFORE-VALUE, not a diff. Undo is
            // built from preview.changes[].before and there is no
            // history table, so anything less is an undo that loses
            // words.
            changes: [{ field: "content", before: current, after: html }],
            warnings,
          },
        };
      }

      // ---- the two lines a stranger reads in a search result -------
      if (action.actionKey === "update_page_meta") {
        const title = typeof action.requestedChanges.seoTitle === "string" ? action.requestedChanges.seoTitle : null;
        const description =
          typeof action.requestedChanges.metaDescription === "string" ? action.requestedChanges.metaDescription : null;
        if (title === null && description === null) {
          return { ok: false, reason: "No search title or description was given." };
        }
        // YOAST OR NOTHING, said plainly rather than written into a key
        // nothing reads. WordPress core has no SEO title or description
        // — they are the plugin's fields — so without them this write
        // would be accepted and ignored, which is the silent no-op
        // shape that cost the Shopify adapter a correction.
        const state = yoastState(item);
        if (state !== "ready") return { ok: false, reason: yoastRefusal(state, ref.kind) };

        const changes: FieldChange[] = [];
        if (title !== null) changes.push({ field: "seoTitle", before: yoast(item, YOAST_TITLE), after: title });
        if (description !== null) {
          changes.push({ field: "seoDescription", before: yoast(item, YOAST_DESC), after: description });
        }
        const warnings: string[] = [];
        if (item.status !== "publish") {
          warnings.push(`This ${ref.kind} is a ${item.status} on the site, so the search listing won't change until it is published.`);
        }
        return {
          ok: true,
          preview: {
            summary: `"${raw(item.title)}" (/${item.slug}): search listing updated`,
            target: { title: raw(item.title), variantTitle: null, currentPrice: null, imageUrl: null },
            changes,
            warnings,
          },
        };
      }

      return { ok: false, reason: `WordPress can't do "${action.actionKey}".` };
    },

    async execute(action: PublishActionRecord): Promise<ExecuteResult> {
      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "WordPress isn't connected." };
      if (!action.preview) return { ok: false, reason: "That action was never previewed." };

      // ---- create the draft ---------------------------------------
      //
      // A CREATION HAS NO BEFORE-VALUE, so there is no staleness check
      // to make and none is faked. What protects a retry is the
      // idempotency the executor already applies — and the post is
      // created as a DRAFT, so the worst case of a double write is a
      // duplicate draft rather than two live posts.
      if (action.actionKey === "publish_post") {
        const title = typeof action.requestedChanges.title === "string" ? action.requestedChanges.title.trim() : "";
        const body = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : "";
        if (!title || !body.trim()) return { ok: false, reason: "The post needs a title and some text." };

        publishLog("wordpress.write", { action: action.id, what: "post_create" });
        const created = await wordpressRequest<WpItem>(
          creds,
          "/wp/v2/posts",
          { method: "POST", body: { title, content: body, status: "draft" } },
          fetchImpl
        );
        if (!created.ok) {
          publishError("wordpress.write_failed", { action: action.id, detail: created.reason });
          return { ok: false, reason: created.reason };
        }
        publishLog("wordpress.write_ok", { action: action.id, post: created.data.id });
        return {
          ok: true,
          // THE REFERENCE IS RETURNED IN THE FORM A LATER ACTION NEEDS,
          // so taking the draft live is one approval away and nothing
          // has to reconstruct it.
          platformResponse: {
            post: { id: created.data.id, targetRef: `post:${created.data.id}`, status: created.data.status, link: created.data.link },
          },
        };
      }

      const ref = parseRef(action.targetRef);
      if (!ref) return { ok: false, reason: "That action didn't say which post or page it meant." };

      // RE-READ BEFORE WRITING. The contract, and the reason execute()
      // cannot simply apply the approved payload: someone previews at
      // 10am and approves at 3pm, and if the site changed at noon,
      // applying the approved intent silently overwrites a change
      // nobody saw. The approval was for a TRANSITION.
      const current = await readItem(creds, ref.kind, ref.id);
      if (!current) return { ok: false, reason: `That ${ref.kind} no longer exists on the WordPress site.` };
      if (!hasEditableFields(current)) return { ok: false, reason: NOT_EDITABLE };

      const expectedFor = (field: string) => action.preview!.changes.find((c) => c.field === field);

      if (action.actionKey === "update_post") {
        const wanted = action.requestedChanges.published;
        if (wanted !== true && wanted !== false) {
          return { ok: false, reason: "That action didn't say whether to publish the post or unpublish it." };
        }
        const expected = expectedFor("status");
        if (!expected) return { ok: false, reason: "The preview did not record anything to verify against." };
        const nextStatus = wanted ? "publish" : "draft";

        if (current.status === nextStatus) {
          publishLog("wordpress.noop", { action: action.id, post: current.id, why: "already_at_target" });
          return { ok: true, platformResponse: { skipped: wanted ? "the post is already live" : "the post is already a draft" } };
        }
        if (current.status !== (expected.before ?? "")) {
          publishError("wordpress.stale", { action: action.id, post: current.id, fields: "status" });
          return { ok: false, stale: true, changed: [{ field: "status", before: expected.before, after: current.status }] };
        }
        return writeItem(creds, action, ref, { status: nextStatus }, "status");
      }

      if (action.actionKey === "update_page_text") {
        const expected = expectedFor("content");
        if (!expected) return { ok: false, reason: "The preview did not record anything to verify against." };
        const now = raw(current.content);
        if (now === expected.after) {
          publishLog("wordpress.noop", { action: action.id, post: current.id, why: "already_at_target" });
          return { ok: true, platformResponse: { skipped: `the ${ref.kind} already reads this way` } };
        }
        if (now !== (expected.before ?? "")) {
          publishError("wordpress.stale", { action: action.id, post: current.id, fields: "content" });
          return { ok: false, stale: true, changed: [{ field: "content", before: expected.before, after: now }] };
        }
        return writeItem(creds, action, ref, { content: expected.after }, "content");
      }

      if (action.actionKey === "update_page_meta") {
        const wantTitle = expectedFor("seoTitle");
        const wantDesc = expectedFor("seoDescription");
        if (!wantTitle && !wantDesc) return { ok: false, reason: "The preview did not record anything to verify against." };
        // RE-CHECKED AT EXECUTE, not trusted from the preview. Yoast
        // can be deactivated, or its content-type setting turned off,
        // between the approval and the write — and writing an
        // unregistered meta key is accepted and silently dropped.
        const nowState = yoastState(current);
        if (nowState !== "ready") return { ok: false, reason: yoastRefusal(nowState, ref.kind) };

        // EVERY FIELD IS CHECKED, and a mismatch on either one is
        // stale. Checking only the field being written would let a
        // description somebody else changed survive a title edit that
        // was approved against the old pair.
        const stale: FieldChange[] = [];
        if (wantTitle && yoast(current, YOAST_TITLE) !== (wantTitle.before ?? "")) {
          stale.push({ field: "seoTitle", before: wantTitle.before, after: yoast(current, YOAST_TITLE) });
        }
        if (wantDesc && yoast(current, YOAST_DESC) !== (wantDesc.before ?? "")) {
          stale.push({ field: "seoDescription", before: wantDesc.before, after: yoast(current, YOAST_DESC) });
        }
        if (stale.length > 0) {
          publishError("wordpress.stale", { action: action.id, post: current.id, fields: stale.map((s) => s.field).join(",") });
          return { ok: false, stale: true, changed: stale };
        }

        // ONLY THE FIELDS THAT CHANGE ARE SENT. A `meta` object
        // carrying both keys when only one was asked for would blank
        // the other on a site where it was set outside Hawlai.
        const meta: Record<string, string> = {};
        if (wantTitle) meta[YOAST_TITLE] = wantTitle.after;
        if (wantDesc) meta[YOAST_DESC] = wantDesc.after;
        return writeItem(creds, action, ref, { meta }, Object.keys(meta).join(","));
      }

      return { ok: false, reason: `WordPress can't do "${action.actionKey}".` };
    },

    async undo(action: PublishActionRecord): Promise<UndoProposal> {
      if (!undoes.includes(action.actionKey)) {
        return { ok: false, reason: `There's nothing to put back for "${action.actionKey}".` };
      }
      if (!action.targetRef) return { ok: false, reason: "That edit didn't record which item it changed, so I can't put it back." };
      if (!action.preview) return { ok: false, reason: "That edit was never previewed, so there is no record of what it said before." };

      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "WordPress isn't connected." };
      const ref = parseRef(action.targetRef);
      if (!ref) return { ok: false, reason: "That edit didn't say which post or page it changed." };
      const item = await readItem(creds, ref.kind, ref.id);
      if (!item) return { ok: false, reason: `That ${ref.kind} isn't on the site any more, so there's nothing to put back.` };
      // THE SAME GUARD AS THE OTHER TWO PATHS. Without it the
      // from-value shown to the owner could be a rendered string, which
      // is not what the page says and not what the undo would write.
      if (!hasEditableFields(item)) return { ok: false, reason: NOT_EDITABLE };

      const was = (field: string) => action.preview!.changes.find((c) => c.field === field);
      const label = String(action.targetLabel ?? raw(item.title));

      if (action.actionKey === "update_post") {
        const before = was("status")?.before;
        // NOTHING RECORDED MEANS NOTHING OFFERED. Guessing the prior
        // status is how an undo unpublishes a post that was live before
        // anyone asked Hawlai about it.
        if (before !== "publish" && before !== "draft") {
          return { ok: false, reason: "That change didn't record whether the post was live before, so I can't put it back." };
        }
        return {
          ok: true,
          actionKey: action.actionKey,
          targetRef: action.targetRef,
          targetLabel: label,
          requestedChanges: { published: before === "publish" },
          changed: [{ what: "Post on the site", from: item.status === "publish" ? "live" : "a draft", to: before === "publish" ? "live" : "a draft" }],
          warnings: before === "publish" ? [] : ["The post goes back to being a draft. Nothing is deleted — the words stay on the site."],
        };
      }

      if (action.actionKey === "update_page_text") {
        const before = was("content")?.before;
        if (before === null || before === undefined) {
          return { ok: false, reason: `That edit didn't record what the ${ref.kind} said before, so I can't put it back.` };
        }
        return {
          ok: true,
          actionKey: action.actionKey,
          targetRef: action.targetRef,
          targetLabel: label,
          requestedChanges: { html: before },
          changed: [{ what: `${ref.kind === "post" ? "Post" : "Page"} text`, from: raw(item.content), to: before }],
          warnings: [],
        };
      }

      // update_page_meta
      const title = was("seoTitle");
      const desc = was("seoDescription");
      if (!title && !desc) {
        return { ok: false, reason: "That edit didn't record what the search listing said before, so I can't put it back." };
      }
      const requested: Record<string, string> = {};
      const changed: { what: string; from: string; to: string }[] = [];
      if (title) {
        requested.seoTitle = title.before ?? "";
        changed.push({ what: "Search title", from: yoast(item, YOAST_TITLE), to: title.before ?? "" });
      }
      if (desc) {
        requested.metaDescription = desc.before ?? "";
        changed.push({ what: "Search description", from: yoast(item, YOAST_DESC), to: desc.before ?? "" });
      }
      return {
        ok: true,
        actionKey: action.actionKey,
        targetRef: action.targetRef,
        targetLabel: label,
        requestedChanges: requested,
        changed,
        // CLEARING IS A REAL WRITE HERE, unlike Shopify's metafields
        // where an empty value is rejected and the undo had to become a
        // delete. WordPress accepts "" for a Yoast override and reads
        // it as "no override", which is exactly the prior state.
        warnings: [],
      };
    },
  };

  async function writeItem(
    creds: WordPressCreds,
    action: PublishActionRecord,
    ref: { kind: WpKind; id: number },
    body: Record<string, unknown>,
    fields: string
  ): Promise<ExecuteResult> {
    publishLog("wordpress.write", { action: action.id, [ref.kind]: ref.id, fields });
    const written = await wordpressRequest<WpItem>(creds, `${route(ref.kind)}/${ref.id}`, { method: "POST", body }, fetchImpl);
    if (!written.ok) {
      publishError("wordpress.write_failed", { action: action.id, detail: written.reason });
      return { ok: false, reason: written.reason };
    }
    publishLog("wordpress.write_ok", { action: action.id, [ref.kind]: ref.id });
    return { ok: true, platformResponse: { id: written.data.id, status: written.data.status, link: written.data.link } };
  }
}
