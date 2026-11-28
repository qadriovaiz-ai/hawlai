// Approving from WhatsApp, without ever guessing which one — H2.
//
// The owner asked to approve from his phone, and decided — with the
// trade in front of him — that this includes the critical tier:
// spending, sending, publishing. That decision is what makes
// everything below a safety control rather than a convenience.
//
// ─────────────────────────────────────────────────────────────────────
// A BARE "YES" MUST NEVER DECIDE SOMETHING WE PICKED
// ─────────────────────────────────────────────────────────────────────
//
// On the dashboard the owner presses a button attached to a card: the
// thing he is approving is the thing under his finger. A WhatsApp
// message has no such attachment, and "haan" arriving two minutes after
// two notifications is a sentence, not a choice.
//
// A POSITION WOULD NOT FIX IT. "APPROVE 2" looks unambiguous and is
// not: the second item in a list he saw this morning is a different row
// by lunchtime, and with the critical tier included that difference
// spends money. So the reference is the approval's OWN identity, which
// nothing can reorder.
//
// ONE EXCEPTION, AND IT IS STRUCTURAL RATHER THAN LENIENT. When exactly
// ONE approval is pending there is nothing to confuse it with, so a
// bare yes is as attached as a button press. With two or more, a bare
// yes gets the list back and decides nothing — the product asks rather
// than guesses, which is the same rule the rest of it follows.
//
// ─────────────────────────────────────────────────────────────────────
// SAYING NO IS NEVER THE SLOW PATH
// ─────────────────────────────────────────────────────────────────────
//
// Switching an automation OFF is ungated throughout this codebase
// because the safe direction must not be the difficult one. Rejecting
// follows it: it needs no authority check, it is accepted in the same
// breath as an approval, and an ambiguous rejection is still refused
// only because rejecting the WRONG thing is its own harm.

/** How many characters of an approval's id identify it in a message. */
export const CODE_CHARS = 4;

/** One pending approval, as far as this file cares. */
export type PendingApproval = {
  id: string;
  action_type?: string | null;
  amount?: number | null;
};

/**
 * The short reference the owner types back.
 *
 * TAKEN FROM THE ROW'S OWN ID, so it means the same thing tomorrow, in
 * a different order, after three more arrive. Uppercase because it is
 * read off a phone screen and typed by a person — and matching is
 * case-insensitive anyway.
 */
export function approvalCode(id: string): string {
  return String(id ?? "").replace(/-/g, "").slice(0, CODE_CHARS).toUpperCase();
}

/**
 * The approval cards a chat turn created, as WhatsApp can show them —
 * E2 of docs/PLAN-INSTAGRAM-STORE-AND-PRODUCT-EDITS.md, 28 Nov 2026.
 *
 * THE GAP THIS CLOSES. On the web a card sits in the chat with its
 * buttons. WhatsApp has no card: the chat's reply ("approve it on the
 * card") arrived alone, and the owner had no CODE to type — so a price
 * change asked for over WhatsApp could never be approved from WhatsApp,
 * though "haan CODE" was built for exactly that. Each card now becomes
 * one line with its code and what it will do, in the card's own words.
 *
 * Null when the turn made no card.
 */
export function cardsForWhatsApp(artifacts: { approval?: { id: string } | null; confirm?: string | null; label?: string | null }[]): string | null {
  const cards = (artifacts ?? []).filter((a) => a?.approval?.id);
  if (!cards.length) return null;
  const lines = cards.map((a) => {
    const what = String(a.confirm || a.label || "the change above").replace(/\s+/g, " ").trim();
    return `• ${approvalCode(a.approval!.id)}: ${what.length > 300 ? `${what.slice(0, 299)}…` : what}`;
  });
  const code = approvalCode(cards[0].approval!.id);
  return `Waiting for your OK:\n${lines.join("\n")}\n\nReply "haan ${code}" to approve, or "nahi ${code}" to reject. Nothing changes until you do.`;
}

/**
 * What the owner's message is asking for.
 *
 * DELIBERATELY NARROW. Anything that is not plainly an approval
 * instruction returns null and the message goes to Master Chat as
 * usual — this must never swallow an ordinary sentence that happens to
 * contain "no".
 *
 * Hindi and English both, because the owner writes both in the same
 * message and a product that only understood one would be telling him
 * which language to approve in.
 */
export type ApprovalReply = { decision: "approved" | "rejected"; code: string | null };

// NOT ANCHORED TO THE START, because "A3F2 haan" and "haan A3F2" are
// the same intention and a shopkeeper will write both. The length limit
// above is what keeps this narrow, not where the word happens to sit.
const APPROVE = /\b(?:approve|haan|haa|ha|yes|ok|okay|theek|thik|sahi|done)\b/i;
const REJECT = /\b(?:reject|nahi|nahin|na|no|cancel|mat|ruko|rehne)\b/i;

export function parseApprovalReply(text: string | null | undefined): ApprovalReply | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  // ONE SHORT INSTRUCTION, NOT A SENTENCE. "no, the blue one is wrong"
  // is a reply to a conversation, not a rejection of an approval, and
  // treating it as one would decide something nobody decided.
  if (raw.split(/\s+/).length > 3) return null;

  const yes = APPROVE.test(raw);
  const no = REJECT.test(raw);
  // BOTH WORDS IN ONE SHORT MESSAGE IS NOT A DECISION. "haan nahi" is
  // somebody changing their mind mid-sentence, and taking whichever the
  // pattern happened to see first would be deciding it for them.
  if (yes === no) return null;
  const decision = yes ? "approved" : "rejected";

  // A code if one was given — anywhere in the message, because "haan
  // A3F2" and "A3F2 haan" are the same intention.
  const code = raw.match(/\b[0-9a-f]{4,8}\b/i);
  return { decision, code: code ? code[0].toUpperCase() : null };
}

/** Why a message could not be pinned to exactly one approval. */
export type UnresolvedReason = "none_pending" | "ambiguous" | "unknown_code" | "many_match";

export type Resolution =
  | { ok: true; approval: PendingApproval }
  | { ok: false; reason: UnresolvedReason };

/**
 * Which approval the message means, or why that cannot be said.
 *
 * NEVER RETURNS A BEST GUESS. Every failure here becomes a question
 * back to the owner, which costs him one message; the alternative costs
 * him whatever the wrong approval did.
 */
export function resolveApproval(
  pending: PendingApproval[] | null | undefined,
  reply: ApprovalReply
): Resolution {
  const rows = (pending ?? []).filter((r) => r && typeof r.id === "string" && r.id);
  if (!rows.length) return { ok: false, reason: "none_pending" };

  if (!reply.code) {
    // THE ONE-PENDING EXCEPTION. Nothing to confuse it with.
    if (rows.length === 1) return { ok: true, approval: rows[0] };
    return { ok: false, reason: "ambiguous" };
  }

  const code = reply.code.toUpperCase();
  const matches = rows.filter((r) => approvalCode(r.id) === code.slice(0, CODE_CHARS));
  if (!matches.length) return { ok: false, reason: "unknown_code" };
  // TWO ROWS SHARING A PREFIX IS RARE AND NOT IMPOSSIBLE, and a coin
  // toss between them is exactly what this file exists to avoid.
  if (matches.length > 1) return { ok: false, reason: "many_match" };
  return { ok: true, approval: matches[0] };
}

/** How one pending approval reads in a message. */
export function describeApproval(approval: PendingApproval): string {
  const what = String(approval.action_type ?? "")
    .replace(/_/g, " ")
    .trim();
  const amount =
    approval.amount !== null && approval.amount !== undefined && Number.isFinite(Number(approval.amount))
      ? ` — ₹${Number(approval.amount)}`
      : "";
  return `${approvalCode(approval.id)}: ${what || "an action"}${amount}`;
}

/**
 * What to say when the message could not be pinned to one approval.
 *
 * IT ALWAYS SAYS WHAT TO TYPE NEXT. "I'm not sure which" with no way
 * forward is the kind of dead end that sends somebody back to a laptop,
 * which is the whole thing this feature exists to avoid.
 */
export function cannotTell(reason: UnresolvedReason, pending: PendingApproval[]): string {
  if (reason === "none_pending") return "Nothing is waiting for your approval right now.";
  const list = pending.map((p) => `• ${describeApproval(p)}`).join("\n");
  if (reason === "unknown_code" || reason === "many_match") {
    return `I couldn't match that code. Here's what's waiting:\n\n${list}\n\nReply with the code, like "haan ${approvalCode(pending[0].id)}".`;
  }
  return `${pending.length} things are waiting, so I don't want to guess which one you mean:\n\n${list}\n\nReply with the code, like "haan ${approvalCode(pending[0].id)}".`;
}
