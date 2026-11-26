// Proposing the page-SEO fixes the audit already finds — S-a/S-b/S-c.
//
// ──────────────────────────────────────────────────────────────────
// L0, AND THAT IS THE OWNER'S DECISION of 24 November 2026: every fix
// is PROPOSED and he approves it. Nothing here changes a live page.
//
// S-d — the same loop running unattended — is explicitly out of scope
// until S-e has produced a measured outcome on a real business. The
// ladder for it already exists (`update_page_meta` is the single entry
// in L2_ALLOWLIST, capped at 3/day) and the evidence does not, which
// is the whole reason this starts at L0.
//
// ──────────────────────────────────────────────────────────────────
// IT GOES THROUGH createPublishAction, NOT requestApproval.
//
// Checked rather than assumed: this is an EDIT TO A RESOURCE ON A
// PLATFORM, which is exactly the shape src/lib/publish describes —
// previewDiff, targetRef, staleness. `requestApproval` exists for
// one-shot sends, which have none of those. And the publish door
// already does three things this loop would otherwise reinvent:
//
//   it refuses a second card for an intent already waiting
//   it retires a card whose values went stale before anyone decided
//   it creates the pending_approvals row itself
//
// ──────────────────────────────────────────────────────────────────
// THREE PER DAY, THE OWNER'S NUMBER.
//
// Not a performance limit. The first run on a neglected site would
// otherwise raise forty cards, he would read none, and the feature
// would be muted in week one. Counted from `publish_actions` rows this
// loop created today rather than from a local tally, so a second
// invocation in the same day cannot double it — the daily run is
// resumed by a 2-minute nudge, so second invocations are normal.
// ──────────────────────────────────────────────────────────────────

import { findMetaGaps, type MetaGap, type PageRow } from "@/lib/seo/metaGaps";
import { inCooldown } from "@/lib/growth/findings";

/** The owner's number, 24 November 2026. */
export const PROPOSALS_PER_DAY = 3;

/**
 * How this loop signs its rows, so its own work is countable.
 *
 * IN `resolution_detail`, NOT `requested_by`, and that is not a
 * preference: `requested_by` is `uuid references auth.users` (migration
 * 170), so a text label there is an invalid insert. Checked rather
 * than assumed, after writing it the wrong way first.
 *
 * `resolution_detail` is jsonb with no constraint and exists to answer
 * "how did it pick that one?" — which is exactly what is being
 * recorded. Using its `query` field for an audit finding rather than a
 * merchant's phrase is a mild stretch of that field's usual meaning,
 * and is written down here rather than left to be discovered.
 *
 * NO MIGRATION, DELIBERATELY. The alternative was a fourth
 * `resolution_path` value, which needs a check-constraint change — and
 * an unapplied migration would make every insert fail the constraint
 * and leave this loop proposing nothing, silently. Migration 140 is
 * this repo's record of that exact shape.
 */
export const AUDIT_SOURCE = "audit:page_meta";

export type FixLoopResult = { proposed: number; skipped: string[] };

/**
 * Has he already said no to this page and field recently?
 *
 * THE COOLDOWN IS THE REASON THIS FEATURE SURVIVES ITS FIRST WEEK.
 * `createPublishAction` refuses a duplicate that is still WAITING, but
 * a rejected intent can be asked again — and a daily loop would ask
 * again every morning, which is how a product teaches somebody to
 * ignore it.
 *
 * REUSED, NOT REWRITTEN: `inCooldown` is the strategist's rule, 30
 * days, and it already decides that an UNREADABLE timestamp counts as
 * inside the cooldown — "the owner said no to this once; a timestamp
 * this code cannot parse is not permission to ask again."
 */
export function rejectedRecently(
  rows: { target_ref?: string | null; requested_changes?: any; status?: string | null; updated_at?: string | null }[],
  gap: MetaGap,
  now: Date
): boolean {
  return (rows ?? []).some((row) => {
    if (row?.status !== "rejected") return false;
    if (String(row?.target_ref ?? "") !== gap.pageId) return false;
    // The same FIELD, not merely the same page. Saying no to a title is
    // not saying no to a description.
    if (!(gap.field in (row?.requested_changes ?? {}))) return false;

    // A REJECTED ROW WITH NO TIMESTAMP IS INSIDE THE COOLDOWN, and
    // `inCooldown` cannot decide that for us — it answers `false` for a
    // missing date because in ITS caller a null `rejected_at` means
    // "never rejected". Here the status has already established that he
    // said no, so a missing date means "no, time unknown", and asking
    // again tomorrow would be the wrong reading of it.
    //
    // Caught by this file's own test, not by a mutation run.
    if (!String(row?.updated_at ?? "").trim()) return true;
    return inCooldown(row?.updated_at, now);
  });
}

/**
 * Propose up to three page-SEO fixes, and say what was left out.
 *
 * NOTHING HERE THROWS. It runs inside the daily job list beside
 * subsystems that reach the owner, and a page-SEO proposal is not
 * worth costing him the rest of the run.
 */
export async function runMetaFixLoop(supabase: any, dealershipId: string, now: Date = new Date()): Promise<FixLoopResult> {
  const skipped: string[] = [];
  try {
    const { data: site } = await supabase
      .from("websites")
      .select("id")
      .eq("dealership_id", dealershipId)
      .limit(1)
      .maybeSingle();
    if (!site?.id) return { proposed: 0, skipped: ["no website"] };

    const [{ data: pages }, { data: business }] = await Promise.all([
      supabase
        .from("website_pages")
        .select("id, slug, title, seo_title, meta_description, sections, is_fallback")
        .eq("website_id", site.id),
      supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).maybeSingle(),
    ]);

    // A FAILED READ IS NOT AN EMPTY SITE. Treating it as one would make
    // every page look like it had no title and propose for all of them.
    if (!Array.isArray(pages)) return { proposed: 0, skipped: ["could not read the pages"] };

    const gaps = findMetaGaps(pages as PageRow[], business?.dealership_name ?? null);

    // Everything this loop has ever done for this business, so both the
    // cooldown and today's cap are answered from the record rather than
    // from memory.
    const { data: mine } = await supabase
      .from("publish_actions")
      .select("target_ref, requested_changes, status, updated_at, created_at, resolution_detail")
      .eq("dealership_id", dealershipId)
      .in("action_key", ["update_page_meta", "add_faq_item"])
      .order("created_at", { ascending: false })
      .limit(200);
    // THIS LOOP'S OWN ROWS ONLY. A card the owner asked for in chat is
    // one he wanted; counting it against this loop's three would
    // punish him for using the product.
    const history = (Array.isArray(mine) ? mine : []).filter(
      (r: any) => String(r?.resolution_detail?.query ?? "") === AUDIT_SOURCE
    );

    const today = now.toISOString().slice(0, 10);
    const todayCount = history.filter((r: any) => String(r?.created_at ?? "").slice(0, 10) === today).length;
    let room = PROPOSALS_PER_DAY - todayCount;
    if (room <= 0) return { proposed: 0, skipped: [`today's ${PROPOSALS_PER_DAY} already proposed`] };

    const { createPublishAction } = await import("@/lib/publish/create");
    const { createPlatformRegistry } = await import("@/lib/publish/registry");
    const platform = createPlatformRegistry(supabase).hawlai_site;
    if (!platform) return { proposed: 0, skipped: ["the site platform is unavailable"] };

    const { gatherBusinessFactsSafely } = await import("@/lib/claims/businessFacts");
    const { guardOrMark } = await import("@/lib/claims/factsGate");
    const facts = await gatherBusinessFactsSafely(supabase, dealershipId);

    let proposed = 0;
    for (const gap of gaps) {
      if (room <= 0) {
        skipped.push(`${gaps.length - proposed} more waiting for tomorrow`);
        break;
      }
      if (rejectedRecently(history, gap, now)) {
        skipped.push(`${gap.slug}: you said no to this recently`);
        continue;
      }

      // THE CLAIMS DOOR, AND COPYING IS NOT NEUTRAL. These words come
      // off the page itself, which feels safe and is not: a claim in a
      // meta description is MORE prominent than the same claim in a
      // paragraph, because it is what the search result shows. Guarded
      // in "publish" mode — the strictest — because this reaches a
      // live search result with nobody reading it again after approval.
      const gated = guardOrMark({ value: gap.value }, facts, "publish");
      const value = String((gated.output as any).value ?? "").trim();
      if (!value) {
        skipped.push(`${gap.slug}: nothing left after the claims check`);
        continue;
      }

      const result = await createPublishAction(supabase, platform, {
        dealershipId,
        platform: "hawlai_site",
        actionKey: "update_page_meta",
        targetRef: gap.pageId,
        targetLabel: gap.label,
        requestedChanges: { [gap.field]: value },
        // NULL, because the column is an auth.users reference and no
        // user asked for this. The provenance is below.
        requestedBy: null,
        resolutionPath: "direct",
        resolutionDetail: { query: AUDIT_SOURCE, candidateCount: 1, matchType: "direct", chosenRef: gap.pageId },
      });

      if (!result.ok) {
        skipped.push(`${gap.slug}: ${result.reason}`);
        continue;
      }
      // Already waiting from an earlier run — not a new proposal, and
      // it must not spend today's room either.
      if ((result as any).alreadyPending) {
        skipped.push(`${gap.slug}: already waiting`);
        continue;
      }
      proposed++;
      room--;
    }

    // ──────────────────────────────────────────────────────────────────
    // AND THE ANSWERS HE HAS ALREADY GIVEN — A6-d.
    //
    // THE SAME SUBSYSTEM AND THE SAME CAP, deliberately. Two subsystems
    // would mean three meta proposals AND three FAQ proposals, which is
    // six a day — and the owner's number is three. One cap means one
    // loop.
    //
    // AFTER THE META GAPS, because a page with no search title is
    // invisible in a result list, and an answer on a page nobody can
    // find helps nobody.
    if (room > 0) {
      const faq = await proposeFaqAnswers(supabase, dealershipId, pages as PageRow[], history, room, now, facts, platform);
      proposed += faq.proposed;
      skipped.push(...faq.skipped);
    }

    return { proposed, skipped };
  } catch (err: any) {
    console.error(`[seo-fix-loop] failed for ${dealershipId}: ${err?.message ?? err}`);
    return { proposed: 0, skipped: ["the loop could not finish"] };
  }
}

/**
 * A stable id for one question's FAQ entry.
 *
 * DERIVED FROM THE INTERVIEW KEY, so it is the same id tomorrow. That
 * matters three times over: `createPublishAction`'s intent key stays
 * stable so a retry does not stack a second card, the platform's
 * already-present check recognises its own work, and the cooldown can
 * tell which question he said no to.
 */
export function faqItemId(questionKey: string): string {
  const slug = String(questionKey ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // TRIMMED AFTER COMPOSING, not before. A blank key produced "faq-"
  // — a trailing dash, and an id that LOOKS usable for a question that
  // has no key. The loop already refuses a candidate without one, so
  // this is the second line of defence rather than the first.
  return `faq-${slug}`.replace(/-+$/, "");
}

/** Has he said no to this exact FAQ entry recently? */
export function faqRejectedRecently(
  rows: { requested_changes?: any; status?: string | null; updated_at?: string | null }[],
  itemId: string,
  now: Date
): boolean {
  return (rows ?? []).some((row) => {
    if (row?.status !== "rejected") return false;
    if (String(row?.requested_changes?.itemId ?? "") !== itemId) return false;
    // Same reading as the meta half: the status already says he
    // declined, so a date this code cannot read is not permission.
    if (!String(row?.updated_at ?? "").trim()) return true;
    return inCooldown(row?.updated_at, now);
  });
}

/**
 * Propose the answers he has already given, as FAQ entries.
 *
 * NOTHING IS WRITTEN AND NOTHING IS GENERATED. The answer is the
 * sentence he typed into the interview, read back out of
 * `business_knowledge` by `answerDraft`; this only asks whether it may
 * go on the page.
 */
async function proposeFaqAnswers(
  supabase: any,
  dealershipId: string,
  pages: PageRow[],
  history: any[],
  room: number,
  now: Date,
  facts: any,
  platform: any
): Promise<FixLoopResult> {
  const skipped: string[] = [];

  // THE PAGE THAT ALREADY HAS AN FAQ SECTION. Where an FAQ sits on a
  // page is a layout decision and this action does not make it — so a
  // business with no FAQ block is told once, rather than once per
  // question.
  const host = pages.find((p) => !p?.is_fallback && hasFaqBlock(p?.sections));
  if (!host) {
    return { proposed: 0, skipped: ["no FAQ section on any page yet — add one in Website Builder and I can fill it"] };
  }

  const { gatherAnswerGaps } = await import("@/lib/seo/answerPlanner");
  const planned = await gatherAnswerGaps(supabase, dealershipId);
  const answerable = planned.drafted.filter((d) => d.draft.ok && d.key);
  if (!answerable.length) return { proposed: 0, skipped: [] };

  const { createPublishAction } = await import("@/lib/publish/create");
  const { guardOrMark } = await import("@/lib/claims/factsGate");

  let proposed = 0;
  let left = room;
  for (const row of answerable) {
    if (left <= 0) {
      skipped.push(`${answerable.length - proposed} more answers waiting for tomorrow`);
      break;
    }
    const itemId = faqItemId(String(row.key));
    if (faqRejectedRecently(history, itemId, now)) {
      skipped.push(`"${row.question}": you said no to this recently`);
      continue;
    }

    // HIS OWN WORDS, STILL GUARDED. He wrote this into the interview as
    // a note about his business; putting it on a public page makes it
    // an advertising claim, which is a different thing. The
    // site-as-evidence work settled that owner-written is not the same
    // as substantiated. Publish mode, the strictest, because after
    // approval nobody reads it again.
    const answer = (row.draft as any).answer as string;
    const gated = guardOrMark({ value: answer }, facts, "publish");
    const clean = String((gated.output as any).value ?? "").trim();
    if (!clean) {
      skipped.push(`"${row.question}": nothing left after the claims check`);
      continue;
    }

    const result = await createPublishAction(supabase, platform, {
      dealershipId,
      platform: "hawlai_site",
      actionKey: "add_faq_item",
      targetRef: String(host.id),
      targetLabel: `${host.title || host.slug} page`,
      requestedChanges: { itemId, question: row.question, answer: clean },
      requestedBy: null,
      resolutionPath: "direct",
      resolutionDetail: { query: AUDIT_SOURCE, candidateCount: 1, matchType: "direct", chosenRef: String(host.id) },
    });

    if (!result.ok) {
      skipped.push(`"${row.question}": ${result.reason}`);
      continue;
    }
    if ((result as any).alreadyPending) {
      skipped.push(`"${row.question}": already waiting`);
      continue;
    }
    proposed++;
    left--;
  }

  return { proposed, skipped };
}

/** Does this page carry an FAQ container at all? */
export function hasFaqBlock(sections: unknown): boolean {
  let found = false;
  const walk = (node: any): void => {
    if (found || !node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    if (node.type === "faq" && typeof node.id === "string") {
      found = true;
      return;
    }
    walk(node.children);
  };
  walk(sections);
  return found;
}
