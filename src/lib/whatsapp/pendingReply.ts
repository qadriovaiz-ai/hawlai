// One short reply from a phone, pinned to exactly one waiting thing.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THIS IS SHARED AND NOT COPIED
// ─────────────────────────────────────────────────────────────────────
//
// H2 built this for approvals: a 4-character code taken from the row's
// own id, a deliberately narrow parse, and a refusal to guess when a
// message could mean more than one thing. D4 needs exactly the same
// machinery for onboarding suggestions.
//
// Copying it would have been the obvious move and the wrong one, for a
// reason that is not tidiness. TWO SEPARATE RESOLVERS CANNOT SEE EACH
// OTHER. With an approval and a suggestion both waiting, "haan" is
// genuinely ambiguous — and two resolvers each looking at their own
// queue would each find exactly one match and each act on it. The
// approval resolver would approve a spend the owner meant to say about
// a phone number.
//
// So there is ONE POOL. Everything waiting on the owner goes into one
// list, and the ambiguity H2 was built to refuse is still refused when
// the two candidates are different KINDS of thing.

/** How many characters of a row's id identify it in a message. */
export const CODE_CHARS = 4;

/** Anything waiting on a one-word answer from the owner's phone. */
export type Pending = {
  /** The row's own id. Stable, so the code means the same tomorrow. */
  id: string;
  /** Which queue it came from, so the caller knows what to do with it. */
  kind: "approval" | "suggestion";
  /** One line, already in the owner's words. */
  describe: string;
};

/**
 * The short reference the owner types back.
 *
 * TAKEN FROM THE ROW'S OWN ID, so it means the same thing tomorrow, in
 * a different order, after three more arrive. Uppercase because it is
 * read off a phone screen and typed by a person — matching is
 * case-insensitive anyway.
 */
export function shortCode(id: string): string {
  return String(id ?? "").replace(/-/g, "").slice(0, CODE_CHARS).toUpperCase();
}

export type Decision = { decision: "approved" | "rejected"; code: string | null };

// NOT ANCHORED TO THE START, because "A3F2 haan" and "haan A3F2" are
// the same intention and a shopkeeper will write both. The length limit
// below is what keeps this narrow, not where the word happens to sit.
const APPROVE = /\b(?:approve|haan|haa|ha|yes|ok|okay|theek|thik|sahi|done)\b/i;
const REJECT = /\b(?:reject|nahi|nahin|na|no|cancel|mat|ruko|rehne)\b/i;

/**
 * What the owner's message is asking for.
 *
 * DELIBERATELY NARROW. Anything that is not plainly a short decision
 * returns null and the message goes to Master Chat as usual — this
 * must never swallow an ordinary sentence that happens to contain "no".
 *
 * Hindi and English both, because the owner writes both in the same
 * message and a product that only understood one would be telling him
 * which language to decide in.
 */
export function parseDecision(text: string | null | undefined): Decision | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  // ONE SHORT INSTRUCTION, NOT A SENTENCE. "no, the blue one is wrong"
  // is a reply to a conversation, not a rejection, and treating it as
  // one would decide something nobody decided.
  if (raw.split(/\s+/).length > 3) return null;

  const yes = APPROVE.test(raw);
  const no = REJECT.test(raw);
  // BOTH WORDS IN ONE SHORT MESSAGE IS NOT A DECISION. "haan nahi" is
  // somebody changing their mind mid-sentence, and taking whichever
  // the pattern happened to see first would be deciding it for them.
  if (yes === no) return null;

  const code = raw.match(/\b[0-9a-f]{4,8}\b/i);
  return { decision: yes ? "approved" : "rejected", code: code ? code[0].toUpperCase() : null };
}

/** Why a message could not be pinned to exactly one waiting thing. */
export type UnresolvedReason = "none_pending" | "ambiguous" | "unknown_code" | "many_match";

export type Resolution = { ok: true; row: Pending } | { ok: false; reason: UnresolvedReason };

/**
 * Which one the message means, or why that cannot be said.
 *
 * NEVER RETURNS A BEST GUESS. Every failure here becomes a question
 * back to the owner, which costs him one message; the alternative costs
 * him whatever the wrong one did.
 */
export function resolvePending(pending: Pending[] | null | undefined, reply: Decision): Resolution {
  const rows = (pending ?? []).filter((r) => r && typeof r.id === "string" && r.id);
  if (!rows.length) return { ok: false, reason: "none_pending" };

  if (!reply.code) {
    // THE ONE-PENDING EXCEPTION, and it counts ACROSS BOTH KINDS. An
    // approval and a suggestion both waiting is two things, however
    // different they are, and "haan" does not say which.
    if (rows.length === 1) return { ok: true, row: rows[0] };
    return { ok: false, reason: "ambiguous" };
  }

  const code = reply.code.toUpperCase().slice(0, CODE_CHARS);
  const matches = rows.filter((r) => shortCode(r.id) === code);
  if (!matches.length) return { ok: false, reason: "unknown_code" };
  // TWO ROWS SHARING A PREFIX IS RARE AND NOT IMPOSSIBLE, and a coin
  // toss between them is exactly what this file exists to avoid.
  if (matches.length > 1) return { ok: false, reason: "many_match" };
  return { ok: true, row: matches[0] };
}

/**
 * What to say when the message could not be pinned to one.
 *
 * IT ALWAYS SAYS WHAT TO TYPE NEXT. "I'm not sure which" with no way
 * forward is the kind of dead end that sends somebody back to a laptop,
 * which is the whole thing this feature exists to avoid.
 */
export function cannotTell(reason: UnresolvedReason, pending: Pending[]): string {
  if (reason === "none_pending") return "Nothing is waiting for you right now.";
  const list = pending.map((p) => `• ${shortCode(p.id)}: ${p.describe}`).join("\n");
  const example = `Reply with the code, like "haan ${shortCode(pending[0].id)}".`;
  if (reason === "unknown_code" || reason === "many_match") {
    return `I couldn't match that code. Here's what's waiting:\n\n${list}\n\n${example}`;
  }
  return `${pending.length} things are waiting, so I don't want to guess which one you mean:\n\n${list}\n\n${example}`;
}
