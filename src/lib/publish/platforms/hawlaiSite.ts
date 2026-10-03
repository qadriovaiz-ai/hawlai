// The business's own website — the website_pages rows behind
// /site/{slug} — as a publish platform.
//
// WHY THIS EXISTS: chat could write a meta title and description and
// then tell the owner they were set. They were not. generate_seo saved a
// suggestion to a list; the two lines Google reads live in
// website_pages, which only Website Builder ever wrote. An owner was
// told their site had changed when it had not (2026-09-28).
//
// Same contract as the other platform modules:
//   - preview() reads the CURRENT title and description, so the card
//     shows what is really on the page, not what the chat phrase implied;
//   - execute() RE-READS before writing and refuses if either value moved
//     since the preview;
//   - already-at-target is checked BEFORE staleness, so a retry after a
//     timeout reports success instead of demanding re-approval.
//
// One thing it does that no other platform does: after writing, it
// FETCHES THE LIVE PAGE and reads the rendered <title> and
// <meta name="description"> back. A database row is not what a stranger
// sees, and "we wrote the row" is exactly the claim that caused the
// original failure. Reading back can only downgrade the message — the
// write already happened — so a failed check never reports a failed
// write, it reports an unconfirmed one.

import { publishLog, publishError } from "../log";
import { readLiveMeta, verifyAgainst, type MetaVerification } from "@/lib/seo/liveMeta";
import type { ExecuteResult, FieldChange, PreviewResult, PublishActionRecord, PublishPlatform } from "../types";

/** What Google shows before it cuts the line off. Advisory, never enforced. */
export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 160;

type PageRow = {
  id: string;
  website_id: string;
  slug: string;
  title: string | null;
  seo_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  /** The block tree. Read for update_page_text; untouched by the meta action. */
  sections?: unknown;
  page_type?: string | null;
  content_source?: string | null;
};

type SiteRow = { id: string; slug: string; published: boolean | null; dealership_id: string };

type ReadResult = { ok: true; page: PageRow | null; site: SiteRow | null } | { ok: false; reason: string };

function sameText(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

/** The value asked for, or undefined when this card doesn't touch that field. */
function requested(changes: Record<string, unknown>, key: "seoTitle" | "metaDescription" | "ogImageUrl"): string | undefined {
  const raw = changes[key];
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw);
  // NOT trimmed to empty and NOT truncated. An owner's own wording goes
  // in exactly as they wrote it; length is a warning on the card, never
  // a silent edit (2026-09-28: a model shortened a 150-character line
  // and told the owner a limit required it).
  return text.trim() === "" ? undefined : text;
}

export function createHawlaiSitePlatform(deps: { supabase: any; fetchImpl?: typeof fetch; baseUrl?: string | null }): PublishPlatform {
  async function readPage(dealershipId: string, pageId: string): Promise<ReadResult> {
    const { data: page, error } = await deps.supabase
      .from("website_pages")
      .select("id, website_id, slug, title, seo_title, meta_description, og_image_url, sections, page_type, content_source")
      .eq("id", pageId)
      .maybeSingle();

    // A failed READ is not a missing page — collapsing the two would
    // tell an owner their page was deleted because the database hiccuped.
    if (error) {
      publishError("hawlai_site.read_failed", { dealership: dealershipId, page: pageId, detail: error.message });
      return { ok: false, reason: "Couldn't read your website just now — nothing was changed. Try again in a moment." };
    }
    if (!page) return { ok: true, page: null, site: null };

    const { data: site, error: siteError } = await deps.supabase
      .from("websites")
      .select("id, slug, published, dealership_id")
      .eq("id", (page as PageRow).website_id)
      // SCOPED TO THIS BUSINESS in the query itself. The page id came
      // through an approval record; this is what stops one business's
      // approval ever resolving to another's website.
      .eq("dealership_id", dealershipId)
      .maybeSingle();
    if (siteError) {
      publishError("hawlai_site.site_read_failed", { dealership: dealershipId, page: pageId, detail: siteError.message });
      return { ok: false, reason: "Couldn't read your website just now — nothing was changed. Try again in a moment." };
    }
    if (!site) return { ok: true, page: null, site: null };
    return { ok: true, page: page as PageRow, site: site as SiteRow };
  }

  /**
   * One line's current text on the page, for the staleness check.
   *
   * The baseline for a body edit cannot be a column — it is one prop of
   * one block inside a JSON tree. So execute re-reads the tree and looks
   * the block up again by id, which is also what makes "someone changed
   * this in Website Builder while the card was open" detectable.
   */
  function lineNow(sections: unknown, blockId: string, prop: string): string | null {
    let found: string | null = null;
    const walk = (node: unknown): void => {
      if (found !== null || !node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== "object") return;
      const b = node as Record<string, any>;
      if (b.id === blockId && b.props && typeof b.props === "object" && typeof b.props[prop] === "string") {
        found = String(b.props[prop]).replace(/<[^>]*>/g, "").trim();
        return;
      }
      walk(b.children);
    };
    walk(sections);
    return found;
  }

  /** The body-text edits a card carries, as the chat tool recorded them. */
  function textEdits(changes: Record<string, unknown>): { blockId: string; prop: string; blockType: string; before: string; after: string; source: string }[] {
    const raw = changes.edits;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e: any) => e && typeof e.blockId === "string" && typeof e.prop === "string" && typeof e.after === "string")
      .map((e: any) => ({
        blockId: String(e.blockId),
        prop: String(e.prop),
        blockType: String(e.blockType ?? "block"),
        before: String(e.before ?? ""),
        after: String(e.after),
        source: e.source === "edited" ? "edited" : "generated",
      }));
  }

  async function previewText(action: PublishActionRecord): Promise<PreviewResult> {
    if (!action.targetRef) return { ok: false, reason: "No page was specified." };
    const read = await readPage(action.dealershipId, action.targetRef);
    if (!read.ok) return { ok: false, reason: read.reason };
    if (!read.page || !read.site) return { ok: false, reason: "That page is no longer on your website." };
    const { page, site } = read;

    const edits = textEdits(action.requestedChanges);
    if (edits.length === 0) return { ok: false, reason: "Nothing to change — tell me which line to change and what it should say." };

    // WHAT IT SAYS NOW, re-read from the page rather than trusted from
    // the card. The whole value of a preview is that it shows the
    // approver the page's real current wording, not the wording the chat
    // message happened to quote.
    const changes: FieldChange[] = [];
    const vanished: string[] = [];
    for (const edit of edits) {
      const now = lineNow(page.sections, edit.blockId, edit.prop);
      if (now === null) {
        vanished.push(edit.before || edit.blockId);
        continue;
      }
      changes.push({ field: `${edit.blockId}:${edit.prop}`, before: now, after: edit.after });
    }
    if (changes.length === 0) {
      return { ok: false, reason: "The lines I was going to change aren't on the page any more — ask me to read the page again and we'll start from what's there now." };
    }

    const warnings: string[] = [];
    if (vanished.length > 0) {
      warnings.push(`${vanished.length === 1 ? "One line has" : `${vanished.length} lines have`} been changed or removed on the page since I read it, so ${vanished.length === 1 ? "it isn't" : "they aren't"} included: "${vanished.slice(0, 2).join('", "')}".`);
    }
    for (const change of changes) {
      if (sameText(change.before, change.after)) warnings.push(`"${change.after.slice(0, 50)}" is already what that line says — approving will change nothing.`);
    }
    // Claims, contact details and the legal-page notice, raised when the
    // action was created. Shown, never enforced: the approver decides.
    for (const warning of Array.isArray(action.requestedChanges.claimWarnings) ? action.requestedChanges.claimWarnings : []) {
      if (typeof warning === "string" && warning.trim()) warnings.push(warning);
    }
    // There is no draft layer: website_pages IS what /site/{slug}
    // renders, so this says which of the two situations the owner is in
    // rather than one vague sentence for both.
    warnings.push(
      site.published === false
        ? "This website isn't published, so nothing becomes public until you publish it in Website Builder."
        : `This changes your LIVE page straight away — anyone visiting /site/${site.slug}${page.slug === "home" ? "" : `/${page.slug}`} sees the new wording immediately.`
    );

    const shown = (value: string | null) => (value && value.trim() ? `"${value.length > 70 ? `${value.slice(0, 70)}…` : value}"` : "(empty)");
    return {
      ok: true,
      preview: {
        summary: `${page.title ?? page.slug} page — ${changes.map((c) => `${shown(c.before)} → ${shown(c.after)}`).join("  ·  ")}`,
        target: {
          title: `${page.title ?? page.slug} (/site/${site.slug}${page.slug === "home" ? "" : `/${page.slug}`})`,
          variantTitle: null,
          currentPrice: null,
          currency: null,
          currencyLabel: null,
          imageUrl: null,
          resolutionPath: action.resolutionPath ?? undefined,
        },
        changes,
        warnings,
      },
    };
  }

  async function executeText(action: PublishActionRecord): Promise<ExecuteResult> {
    if (!action.targetRef) return { ok: false, reason: "No page was specified." };
    if (!action.preview) return { ok: false, reason: "This action was never previewed." };

    const read = await readPage(action.dealershipId, action.targetRef);
    if (!read.ok) return { ok: false, reason: read.reason };
    if (!read.page || !read.site) return { ok: false, reason: "That page is no longer on your website." };
    const { page, site } = read;

    const expected = action.preview.changes.filter((c) => c.field.includes(":"));
    if (expected.length === 0) return { ok: false, reason: "The preview did not record anything to verify against." };

    // ALREADY AT THE TARGET before STALE, same order as the meta action
    // and for the same reason: a successful write followed by a timeout
    // and a retry would otherwise compare the new text against the
    // recorded before and demand re-approval for something that worked.
    const atTarget = expected.every((c) => sameText(lineNow(page.sections, c.field.split(":")[0], c.field.split(":")[1]), c.after));
    const moved = expected.filter((c) => {
      const now = lineNow(page.sections, c.field.split(":")[0], c.field.split(":")[1]);
      return now !== null && !sameText(now, c.before) && !sameText(now, c.after);
    });
    if (!atTarget && moved.length > 0) {
      publishError("hawlai_site.text_stale", { action: action.id, page: page.id, fields: moved.map((c) => c.field).join(", ") });
      return {
        ok: false,
        stale: true,
        changed: moved.map((c) => ({ field: c.field, before: c.before, after: String(lineNow(page.sections, c.field.split(":")[0], c.field.split(":")[1]) ?? "") })),
      };
    }

    const edits = textEdits(action.requestedChanges);
    if (!atTarget) {
      // Re-applied to the tree AS IT IS NOW, not to the copy taken at
      // preview time — an unrelated block someone edited in Website
      // Builder meanwhile must not be rolled back by this save.
      const { applyEdits, contentSourceAfter } = await import("@/lib/pages/editPage");
      const result = applyEdits(
        page.sections,
        // Already guarded when the card was built; re-guarding here with
        // no facts would be a second, different answer. The text that was
        // APPROVED is what goes on the page.
        expected.map((c) => {
          const [blockId, prop] = c.field.split(":");
          const edit = edits.find((e) => e.blockId === blockId && e.prop === prop);
          return { blockId, prop: prop as any, text: c.after, writtenByOwner: edit?.source === "edited" };
        }),
        null
      );
      if (result.applied.length === 0) {
        publishError("hawlai_site.text_matched_nothing", { action: action.id, page: page.id });
        return { ok: false, reason: "The lines I was going to change aren't on the page any more, so nothing was saved." };
      }

      const update: Record<string, unknown> = { sections: result.sections, updated_at: new Date().toISOString() };
      // ONLY WHEN THE OWNER WROTE THE WORDS. Approving a draft Hawlai
      // wrote is approving its publication, not vouching for it — and a
      // line Hawlai wrote must never become the evidence that the same
      // line is true. The page endpoint flipped this on any word change,
      // which reopened exactly that loop.
      const nextSource = contentSourceAfter(result.applied);
      if (nextSource) update.content_source = nextSource;

      publishLog("hawlai_site.text_write", { action: action.id, page: page.id, lines: result.applied.length, owner: Boolean(nextSource) });
      const { data: updated, error } = await deps.supabase
        .from("website_pages")
        .update(update)
        .eq("id", page.id)
        .eq("website_id", site.id)
        .select("id")
        .maybeSingle();
      if (error) {
        publishError("hawlai_site.text_write_failed", { action: action.id, page: page.id, detail: error.message });
        return { ok: false, reason: `Couldn't save the change to your website: ${error.message}` };
      }
      if (!updated) {
        publishError("hawlai_site.text_write_matched_nothing", { action: action.id, page: page.id });
        return { ok: false, reason: "The change matched no page on your website, so nothing was saved." };
      }
    }

    // THE READ-BACK. The write is above; this is the only part that can
    // honestly use the word "live". A failed read downgrades the
    // message — it never reports a failed write.
    const { readLiveText, verifyTextLive } = await import("@/lib/seo/liveText");
    const verification =
      site.published === false
        ? { verified: false, url: "", message: "Saved. Your site isn't published yet, so nothing is public — publish it and the new wording goes live.", missing: [] }
        : verifyTextLive(expected.map((c) => c.after), await readLiveText(site.slug, page.slug, { fetchImpl: deps.fetchImpl, baseUrl: deps.baseUrl }));

    publishLog("hawlai_site.text_write_ok", { action: action.id, page: page.id, verified: verification.verified, url: verification.url });
    return {
      ok: true,
      platformResponse: {
        pageId: page.id,
        fields: expected.map((c) => c.field),
        skipped: atTarget ? "already at the requested wording" : undefined,
        verification,
      },
    };
  }

  return {
    id: "hawlai_site",
    supports: ["update_page_meta", "update_page_text"] as const,

    async isConnected(dealershipId: string): Promise<boolean> {
      const { data, error } = await deps.supabase.from("websites").select("id").eq("dealership_id", dealershipId).limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },

    async preview(action: PublishActionRecord): Promise<PreviewResult> {
      if (action.actionKey === "update_page_text") return previewText(action);
      if (action.actionKey !== "update_page_meta") return { ok: false, reason: `Your website can't do "${action.actionKey}".` };
      if (!action.targetRef) return { ok: false, reason: "No page was specified." };

      const read = await readPage(action.dealershipId, action.targetRef);
      if (!read.ok) return { ok: false, reason: read.reason };
      if (!read.page || !read.site) return { ok: false, reason: "That page is no longer on your website." };
      const { page, site } = read;

      const wantTitle = requested(action.requestedChanges, "seoTitle");
      const wantDescription = requested(action.requestedChanges, "metaDescription");
      const wantImage = requested(action.requestedChanges, "ogImageUrl");
      if (wantTitle === undefined && wantDescription === undefined && wantImage === undefined) {
        return { ok: false, reason: "Nothing to change — give me a title, a description, a share image, or any of them together." };
      }

      // What the browser tab says today. A page with no seo_title has no
      // title of its own — it borrows the business name — and saying
      // that plainly is more use to the approver than printing a value
      // that isn't stored anywhere.
      const currentTitle = String(page.seo_title ?? "").trim() || "(none yet — your business name is used)";

      const changes: FieldChange[] = [];
      if (wantTitle !== undefined) changes.push({ field: "seoTitle", before: page.seo_title ?? null, after: wantTitle });
      if (wantDescription !== undefined) changes.push({ field: "metaDescription", before: page.meta_description ?? null, after: wantDescription });
      if (wantImage !== undefined) changes.push({ field: "ogImageUrl", before: page.og_image_url ?? null, after: wantImage });

      // Warnings inform the decision and never block it. Over-long is a
      // real thing to know — Google cuts the line off — and it is the
      // owner's call, not a reason to rewrite their sentence.
      const warnings: string[] = [];
      if (wantTitle !== undefined && wantTitle.length > TITLE_LIMIT) {
        warnings.push(`The title is ${wantTitle.length} characters — Google usually shows about ${TITLE_LIMIT}, so the end may be cut off in search results. Saved exactly as written.`);
      }
      if (wantDescription !== undefined && wantDescription.length > DESCRIPTION_LIMIT) {
        warnings.push(`The description is ${wantDescription.length} characters — Google usually shows about ${DESCRIPTION_LIMIT}, so the end may be cut off. Saved exactly as written.`);
      }
      if (wantTitle !== undefined && sameText(page.seo_title, wantTitle)) warnings.push("The title is already this — approving will change nothing.");
      if (wantDescription !== undefined && sameText(page.meta_description, wantDescription)) warnings.push("The description is already this — approving will change nothing.");
      if (wantImage !== undefined && sameText(page.og_image_url, wantImage)) warnings.push("The share image is already this one — approving will change nothing.");
      // Raised by the claims check before this action was created: a
      // claim removed from Hawlai's own wording, or one the owner wrote
      // themselves that their Business Story doesn't back up. Shown, not
      // enforced — the person approving decides.
      for (const warning of Array.isArray(action.requestedChanges.claimWarnings) ? action.requestedChanges.claimWarnings : []) {
        if (typeof warning === "string" && warning.trim()) warnings.push(warning);
      }
      if (site.published === false) {
        warnings.push("This website isn't published, so the change won't be visible to anyone until you publish it in Website Builder.");
      }
      if (wantTitle !== undefined && page.slug === "home") {
        warnings.push(`Your menu link stays "${page.title ?? "Home"}" — this changes the browser tab and the search result, not the navigation.`);
      }

      const shown = (value: string | null) => (value && value.trim() ? `"${value.length > 90 ? `${value.slice(0, 90)}…` : value}"` : "(empty)");
      const summary = changes
        .map((c) => `${c.field === "seoTitle" ? "Search title" : c.field === "ogImageUrl" ? "Share image" : "Search description"}: ${shown(c.before)} → ${shown(c.after)}`)
        .join("  ·  ");

      return {
        ok: true,
        preview: {
          summary: `${page.title ?? page.slug} page — ${summary}`,
          target: {
            title: `${page.title ?? page.slug} (/site/${site.slug}${page.slug === "home" ? "" : `/${page.slug}`})`,
            variantTitle: currentTitle || null,
            currentPrice: null,
            currency: null,
            currencyLabel: null,
            imageUrl: null,
            resolutionPath: action.resolutionPath ?? undefined,
          },
          changes,
          warnings,
        },
      };
    },

    async execute(action: PublishActionRecord): Promise<ExecuteResult> {
      if (action.actionKey === "update_page_text") return executeText(action);
      if (action.actionKey !== "update_page_meta") return { ok: false, reason: `Execute for "${action.actionKey}" is not built yet.` };
      if (!action.targetRef) return { ok: false, reason: "No page was specified." };
      if (!action.preview) return { ok: false, reason: "This action was never previewed." };

      const read = await readPage(action.dealershipId, action.targetRef);
      if (!read.ok) return { ok: false, reason: read.reason };
      if (!read.page || !read.site) return { ok: false, reason: "That page is no longer on your website." };
      const { page, site } = read;

      const expected = action.preview.changes.filter((c) => c.field === "seoTitle" || c.field === "metaDescription" || c.field === "ogImageUrl");
      if (expected.length === 0) return { ok: false, reason: "The preview did not record anything to verify against." };

      const currentOf = (field: string) => (field === "seoTitle" ? page.seo_title : field === "ogImageUrl" ? page.og_image_url : page.meta_description);

      // ALREADY AT THE TARGET — checked BEFORE staleness, because a
      // successful write followed by a timeout and a retry would
      // otherwise compare the new value against the recorded before and
      // report STALE for an action that succeeded.
      const atTarget = expected.every((c) => sameText(currentOf(c.field), c.after));
      const moved = expected.filter((c) => !sameText(currentOf(c.field), c.before) && !sameText(currentOf(c.field), c.after));

      if (!atTarget && moved.length > 0) {
        publishError("hawlai_site.stale", { action: action.id, page: page.id, fields: moved.map((c) => c.field).join(", ") });
        return { ok: false, stale: true, changed: moved.map((c) => ({ field: c.field, before: c.before, after: String(currentOf(c.field) ?? "") })) };
      }

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const COLUMN: Record<string, string> = { seoTitle: "seo_title", metaDescription: "meta_description", ogImageUrl: "og_image_url" };
      for (const change of expected) update[COLUMN[change.field]] = change.after;

      if (!atTarget) {
        publishLog("hawlai_site.write", { action: action.id, page: page.id, fields: expected.map((c) => c.field).join(", ") });
        const { data: updated, error } = await deps.supabase
          .from("website_pages")
          .update(update)
          .eq("id", page.id)
          .eq("website_id", site.id)
          .select("id")
          .maybeSingle();

        if (error) {
          publishError("hawlai_site.write_failed", { action: action.id, page: page.id, detail: error.message });
          return { ok: false, reason: `Couldn't save the change to your website: ${error.message}` };
        }
        // Supabase reports an update matching ZERO rows as success with
        // error: null — the shape that once made a tool claim a change
        // nobody could see.
        if (!updated) {
          publishError("hawlai_site.write_matched_nothing", { action: action.id, page: page.id });
          return { ok: false, reason: "The change matched no page on your website, so nothing was saved." };
        }
      }

      // THE READ-BACK. Everything above this line is the write; this is
      // the only part that can honestly use the word "live".
      const titleChange = expected.find((c) => c.field === "seoTitle");
      const descriptionChange = expected.find((c) => c.field === "metaDescription");
      const imageChange = expected.find((c) => c.field === "ogImageUrl");
      const verification: MetaVerification = verifyAgainst(
        {
          // For a non-home page the rendered title is "<page> | <business>",
          // so what is compared is what the page will actually serve.
          title: titleChange ? titleChange.after : undefined,
          description: descriptionChange ? descriptionChange.after : undefined,
          // Verified as SERVED, not as stored: a share image only exists
          // once the page emits og:image, which is what WhatsApp reads.
          image: imageChange ? imageChange.after : undefined,
        },
        await readLiveMeta(site.slug, page.slug, { fetchImpl: deps.fetchImpl, baseUrl: deps.baseUrl })
      );

      publishLog("hawlai_site.write_ok", { action: action.id, page: page.id, verified: verification.verified, url: verification.url });
      return {
        ok: true,
        platformResponse: {
          pageId: page.id,
          fields: expected.map((c) => c.field),
          skipped: atTarget ? "already at the requested values" : undefined,
          verification,
        },
      };
    },
  };
}
