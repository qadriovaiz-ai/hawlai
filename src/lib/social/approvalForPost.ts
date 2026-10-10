// The record beside the card, for the one endpoint whose card is better
// than a generic approval row.
//
// G-3 STEP 4. Every other endpoint in this initiative had its card
// REPLACED by a pending_approvals row. /api/social/post does not,
// deliberately: its card already resolves the destination before the
// button exists, shows no button at all when the destination is not
// connected, names the Page in the confirm, carries `expect_text`, and
// the endpoint reads the post back afterwards. A generic approval row
// does none of that, so converting it would have reduced safety.
//
// So the card stays and the record is added beside it. What that buys,
// precisely:
//
//   - the confirm sentence, the destination and the exact text are on
//     the server, so "who approved this and what did it say" is
//     answerable from the row rather than from a browser string;
//   - the row is SINGLE-USE, so the chat card's request cannot be
//     replayed;
//   - the text in the request must match the text on the row, so a
//     replay with different words is refused.
//
// WHAT IT DOES NOT BUY, stated plainly because the alternative is
// implying otherwise: a crafted request that simply OMITS the approval
// id is treated like the Social page's own request and goes through.
// The endpoint cannot require a row, because the Social page
// legitimately posts without one and a press there IS the owner's
// decision. Requiring one would mean breaking that page or adding a
// bypass flag, and a bypass flag in an authorisation check is how
// authorisation checks die. Threat T1 therefore closes for the CHAT
// card, not for the endpoint.

import { samePostText } from "@/lib/chat/socialPost";

export type PostApprovalCheck =
  | { ok: true; approvalId: string | null }
  | { ok: false; status: number; error: string };

/**
 * Validate the approval row a chat card's request carries, if it carries one.
 *
 * No id means the Social page, which has always posted directly — that
 * path is unchanged and must stay that way.
 */
export async function checkPostApproval(
  service: any,
  dealershipId: string,
  approvalId: unknown,
  caption: string
): Promise<PostApprovalCheck> {
  const id = typeof approvalId === "string" && approvalId.trim() ? approvalId.trim() : null;
  if (!id) return { ok: true, approvalId: null };

  const { data: row, error } = await service
    .from("pending_approvals")
    .select("id, dealership_id, status, action_type, action_details")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: "Couldn't check the approval for this post, so nothing was posted." };
  }
  // Scoped to THIS business, not merely found. An id is a value from a
  // request body, and the row it names may belong to someone else.
  if (!row || row.dealership_id !== dealershipId || row.action_type !== "publish_social_post") {
    return { ok: false, status: 400, error: "That post has no approval on record, so nothing was posted." };
  }
  // SINGLE USE. This is what stops the card's request being replayed:
  // the first press moves the row off "pending" and the second finds
  // nothing to use.
  if (row.status !== "pending") {
    return { ok: false, status: 409, error: "That post was already approved once, so nothing was posted again." };
  }
  // The words on the row are the words the owner agreed to. Compared
  // with the same function the endpoint uses for expect_text, so a
  // trailing newline is not treated as a different post.
  const agreed = String((row.action_details as any)?.expect_text ?? "");
  if (agreed && !samePostText(agreed, caption)) {
    return {
      ok: false,
      status: 400,
      error: "The text being posted isn't the text that was approved, so nothing was posted.",
    };
  }
  return { ok: true, approvalId: row.id };
}

/**
 * Spend the row, once the post is actually out.
 *
 * Marked AFTER posting rather than before: a row moved to "approved" for
 * a post that then failed would leave the owner unable to try again, and
 * the whole point of the record is that it describes what happened.
 *
 * A conditional UPDATE on status, so two requests racing cannot both
 * spend it — the same row mutex the approvals route uses.
 */
export async function spendPostApproval(service: any, approvalId: string | null): Promise<void> {
  if (!approvalId) return;
  try {
    const { error } = await service
      .from("pending_approvals")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", approvalId)
      .eq("status", "pending");
    if (error) console.error("[social-post] couldn't mark the approval used:", error.message);
  } catch (err: any) {
    console.error("[social-post] couldn't mark the approval used:", err?.message);
  }
}
