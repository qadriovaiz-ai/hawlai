// What the owner has already settled in this conversation.
//
// THE INCIDENT, 21 November 2026, and it took two turns to go wrong.
// Asked to edit a collection without naming one, the tool returned
// "which collection?" with all three of the store's real collections
// attached. The owner answered "Home page" — a real collection,
// Shopify's own default, handle `frontpage`. The model then told him
// "Home page is not a collection, it's a regular website page",
// contradicting a tool result it already held.
//
// NOTHING HAD RECORDED THAT THE OWNER CHOSE IT. The model's entire
// view of the conversation is `[...history.slice(-10), message]`, and
// that history arrives from the browser as prose. There was no
// conversational state of any kind: a decision made two turns ago
// existed only as a sentence to be re-read and re-interpreted, and the
// model's prior about what a name "sounds like" competed with it on
// equal terms.
//
// Classical task-oriented dialogue has the structure for this — a
// dialogue state of (slot, value) pairs, where INFORMABLE slots are
// the ones the user provides. The owner informed one. Nobody wrote it
// down. This module writes it down.
//
// WHAT THIS IS NOT, and this is the important line. A settled slot
// NEVER fills in a tool argument. It is rendered into the model's
// context as something the owner has already answered, and that is
// all. Acting on a remembered target without being told to is how the
// wrong page gets edited, and this product's whole resolver design —
// no "fuzzy" path, a loose match goes to the owner — exists to stop
// exactly that. A memory that can act is a different and much larger
// decision than a memory that can inform.

/** One answer the owner gave, and when he gave it. */
export type SettledSlot = {
  /** What a tool call needs: a handle, a slug, an id. */
  value: string;
  /** What the owner called it, so the chat can answer in his words. */
  label: string;
  /** ISO timestamp. */
  at: string;
};

export type Settled = Record<string, SettledSlot>;

/**
 * The slots this product can settle.
 *
 * Deliberately narrow, and deliberately NOT including `surface` (which
 * of Shopify or the Hawlai site). A surface is almost never something
 * the owner states outright — it would have to be inferred from which
 * tool ran, and a slot inferred from our own behaviour is a decision
 * the owner never made. Recording one and then skipping a question
 * because of it would be the invention this module exists to prevent.
 */
const SLOT_NAMES = ["page", "collection", "blog", "product"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

export function isSlotName(name: string): name is SlotName {
  return (SLOT_NAMES as readonly string[]).includes(name);
}

/**
 * How long a settled answer still counts as settled.
 *
 * A STALE SLOT IS WORSE THAN NO SLOT. Conversations here are threads:
 * one is created on a fresh chat screen and can be reopened from the
 * sidebar days later. "The collection you picked" meaning yesterday's
 * choice is not what the owner would expect on reopening, and a
 * confident reminder of a decision he has forgotten making is worse
 * than asking him again.
 *
 * Twelve hours: long enough that a working session with a break in it
 * keeps its answers, short enough that tomorrow starts clean.
 */
export const SLOT_TTL_HOURS = 12;

/**
 * The slots that are still valid, read defensively.
 *
 * The column is jsonb written by code that will change, so every field
 * is re-checked here rather than trusted: an unknown slot name, a
 * missing value, or an unparseable timestamp is dropped rather than
 * rendered into a prompt as though it were a fact.
 */
export function freshSlots(raw: unknown, now: Date = new Date()): Settled {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Settled = {};
  for (const [name, slot] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSlotName(name)) continue;
    if (!slot || typeof slot !== "object") continue;
    const { value, label, at } = slot as Record<string, unknown>;
    if (typeof value !== "string" || !value.trim()) continue;
    if (typeof at !== "string") continue;
    const when = Date.parse(at);
    if (!Number.isFinite(when)) continue;
    const ageHours = (now.getTime() - when) / 3_600_000;
    // A timestamp from the future is a clock problem, not a fresh
    // slot, and treating it as fresh would make it immortal.
    if (ageHours < 0 || ageHours > SLOT_TTL_HOURS) continue;
    out[name] = {
      value: value.trim(),
      label: typeof label === "string" && label.trim() ? label.trim() : value.trim(),
      at,
    };
  }
  return out;
}

/** "4 minutes ago" — more use to a model than an ISO timestamp. */
function ago(at: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

/**
 * The context section, or "" when nothing is settled.
 *
 * The instruction half matters as much as the list. The failure was not
 * that the model lacked the answer — the answer was in a tool result it
 * already held. It was that the answer was ADVISORY, so a prior about
 * what a name sounds like could override it.
 */
export function settledSection(settled: Settled, now: Date = new Date()): string {
  const names = Object.keys(settled).sort();
  if (names.length === 0) return "";
  const lines = names.map((name) => {
    const s = settled[name];
    const shown = s.label === s.value ? `"${s.label}"` : `"${s.label}" (${s.value})`;
    return `- ${name}: ${shown} — settled ${ago(s.at, now)}`;
  });
  return (
    `\n\n## Already settled in this conversation\n` +
    `The owner answered these himself, and each one was confirmed against the platform at the time — they are not guesses.\n` +
    `${lines.join("\n")}\n` +
    `Do NOT ask again about anything on this list, and do NOT contradict it. If he picked it, it exists: never tell him a settled answer ` +
    `is "not a collection" or "actually a page" or "something else instead". Your sense of what a name sounds like is not evidence ` +
    `against a list the platform returned.\n` +
    `THIS LIST INFORMS YOU, IT DOES NOT ACT FOR YOU. Still pass the target to the tool explicitly, and when you are working on a settled ` +
    `answer, say which one you are using so he can correct you. If he names something different, that replaces the entry — act on his new words.`
  );
}

/**
 * Read the slots for a conversation.
 *
 * A read failure returns no slots, which degrades to the behaviour this
 * product had before this module existed. It is logged rather than
 * swallowed: a context section that silently stops appearing looks
 * exactly like a model choosing not to use it.
 */
export async function readSettledSlots(
  supabase: { from: (t: string) => any },
  conversationId: string | null | undefined,
  now: Date = new Date()
): Promise<Settled> {
  if (!conversationId) return {};
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("settled")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    console.error("[settledSlots] could not read settled slots:", error.message);
    return {};
  }
  return freshSlots(data?.settled, now);
}

/**
 * Record that the owner settled one slot.
 *
 * ONLY EVER CALLED ON AN EXACT MATCH. A fallback to the first page, or
 * "the only collection there is", is a target this product chose — not
 * an answer the owner gave — and writing one here would let a later
 * turn skip a question on the strength of a decision he never made.
 * The call sites carry that check; this function cannot see it.
 *
 * READ-MODIFY-WRITE, and knowingly. Merging in SQL (`settled ||
 * jsonb_build_object(…)`) would need a database function and so a
 * third migration; two turns writing different slots of the same
 * conversation at the same moment would have the later write win.
 * There is one owner per conversation typing one message at a time, so
 * the window is theoretical — recorded here so it is a known
 * limitation rather than a surprise.
 *
 * NEVER THROWS. A failed slot write must not break the edit the owner
 * actually asked for. It is logged loudly, because a silently swallowed
 * write is how this codebase lost ninety days of cost logging.
 */
export async function settleSlot(
  supabase: { from: (t: string) => any },
  conversationId: string | null | undefined,
  slot: string,
  value: string,
  label?: string | null,
  now: Date = new Date()
): Promise<void> {
  if (!conversationId || !isSlotName(slot)) return;
  const v = String(value ?? "").trim();
  if (!v) return;

  try {
    const current = await readSettledSlots(supabase, conversationId, now);
    const next: Settled = {
      ...current,
      [slot]: { value: v, label: String(label ?? "").trim() || v, at: now.toISOString() },
    };
    const { error } = await supabase
      .from("chat_conversations")
      .update({ settled: next })
      .eq("id", conversationId);
    if (error) console.error(`[settledSlots] could not settle ${slot}:`, error.message);
  } catch (err: any) {
    console.error(`[settledSlots] could not settle ${slot}:`, err?.message ?? err);
  }
}
