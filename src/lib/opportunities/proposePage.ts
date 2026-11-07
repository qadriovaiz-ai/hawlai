// Turning a search gap into a card the owner can say yes to (G3).
//
// THE HOP ITSELF. `marketOpportunities.ts` already finds the gap and
// puts it in the opportunity feed, where it ends as a link for the owner
// to click. This takes the same gap and proposes the page, through the
// approval registry, so that saying yes is one press rather than an
// afternoon of working out what to write.
//
// ASKED ONCE PER SEARCH, EVER. The same rule the interview follows (the
// founder's decision of 7 November): a product that proposes the same
// page every week is a product the owner stops reading. A card already
// raised for a search — pending, approved or rejected — stops another.
// Rejected counts: "no" is an answer.
//
// NOTHING IS WRITTEN WITHOUT A REGISTRY ENTRY. `create_page_draft` is
// classified in executionPolicy.ts and carried out by a branch in the
// approvals route; `requestApproval` refuses an action nobody
// classified, so this cannot act by naming something new.

import { requestApproval } from "@/lib/chat/requestApproval";
import { readProgress } from "@/lib/onboarding/interviewProgress";
import { PAGE_WORTH_IT, proposalConfirm, proposalFor, type GapQuery, type PageProposal } from "./pageProposal";

export type ProposeResult = {
  /** Cards raised in this run. */
  proposed: PageProposal[];
  /** Searches that were not proposed, and why — for the log, not the owner. */
  skipped: { query: string; why: string }[];
};

/** More than this in one run and it is a to-do list, not a suggestion. */
export const MAX_PER_RUN = 1;

/**
 * Propose the best unproposed page, if there is one worth proposing.
 *
 * ONE AT A TIME, deliberately. Three cards saying "write a page" is a
 * backlog, and a backlog is what the owner closes without reading. The
 * strongest gap goes first and the next one waits until this is decided.
 */
export async function proposePages(
  supabase: any,
  dealershipId: string,
  gaps: GapQuery[]
): Promise<ProposeResult> {
  const out: ProposeResult = { proposed: [], skipped: [] };
  const worthIt = (gaps ?? [])
    .filter((g) => Number(g?.impressions ?? 0) >= PAGE_WORTH_IT)
    .sort((a, b) => b.impressions - a.impressions);
  if (worthIt.length === 0) return out;

  // WHAT THE SITE ALREADY HAS, so a page the owner has written is never
  // proposed again. A failed read means no proposal rather than a
  // proposal that might duplicate one — the cautious direction, because
  // the cost of staying quiet is one missed card and the cost of being
  // wrong is a duplicate page on a real site.
  const { data: website, error: siteError } = await supabase
    .from("websites")
    .select("id")
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (siteError || !website) {
    out.skipped.push({ query: worthIt[0].query, why: siteError ? `could not read the site: ${siteError.message}` : "no site yet" });
    return out;
  }

  const { data: pages, error: pageError } = await supabase
    .from("website_pages")
    .select("slug")
    .eq("website_id", website.id);
  if (pageError) {
    out.skipped.push({ query: worthIt[0].query, why: `could not read the existing pages: ${pageError.message}` });
    return out;
  }
  const existingSlugs = (pages ?? []).map((p: any) => String(p?.slug ?? ""));

  // ASKED ONCE, EVER: every card ever raised for this action, whatever
  // the owner decided.
  const { data: raised, error: raisedError } = await supabase
    .from("pending_approvals")
    .select("action_details")
    .eq("dealership_id", dealershipId)
    .eq("action_type", "create_page_draft");
  if (raisedError) {
    out.skipped.push({ query: worthIt[0].query, why: `could not read what has already been proposed: ${raisedError.message}` });
    return out;
  }
  const alreadyAsked = new Set(
    (raised ?? []).map((r: any) => String(r?.action_details?.query ?? "").toLowerCase()).filter(Boolean)
  );

  const [{ data: notes }, { data: progressRows }] = await Promise.all([
    supabase.from("business_knowledge").select("title, content").eq("dealership_id", dealershipId).eq("is_active", true),
    supabase.from("interview_answers").select("question_key, status, attempts, weak").eq("dealership_id", dealershipId),
  ]);
  const answered = readProgress(progressRows).answered;

  for (const gap of worthIt) {
    if (out.proposed.length >= MAX_PER_RUN) break;
    if (alreadyAsked.has(gap.query.toLowerCase())) {
      out.skipped.push({ query: gap.query, why: "already proposed once" });
      continue;
    }
    const proposal = proposalFor(gap, {
      allGaps: worthIt,
      existingSlugs,
      recorded: (notes ?? []).map((n: any) => ({ title: String(n?.title ?? ""), content: String(n?.content ?? "") })),
      answered,
    });
    if (!proposal) {
      out.skipped.push({ query: gap.query, why: "nothing worth proposing for it" });
      continue;
    }

    const result = await requestApproval(supabase, dealershipId, {
      actionType: "create_page_draft",
      // ONLY WHAT THE ROUTE NEEDS, AND THE ROUTE RE-DERIVES THE SLUG
      // FROM THE TITLE RATHER THAN TRUSTING THIS. A stored
      // action_details is still a value the server should not act on
      // blindly — the lesson the toggle and the autonomy branches both
      // record.
      details: { query: proposal.query, title: proposal.title, slug: proposal.slug, impressions: proposal.impressions, missing: proposal.missing },
      confirm: proposalConfirm(proposal),
      requestedBy: "growth loop (G3)",
    });
    // ApprovalResult is a union: either a card was raised, or an error
    // was returned. Narrowed rather than cast, so a third shape added
    // later fails the type-check here instead of being ignored.
    if ("error" in result) {
      out.skipped.push({ query: gap.query, why: String(result.error) });
      continue;
    }
    out.proposed.push(proposal);
  }

  return out;
}
