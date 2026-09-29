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
      .select("id, website_id, slug, title, seo_title, meta_description, og_image_url")
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

  return {
    id: "hawlai_site",
    supports: ["update_page_meta"] as const,

    async isConnected(dealershipId: string): Promise<boolean> {
      const { data, error } = await deps.supabase.from("websites").select("id").eq("dealership_id", dealershipId).limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },

    async preview(action: PublishActionRecord): Promise<PreviewResult> {
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
