// What the WhatsApp chat remembers — the founder's bug, 28 November 2026.
//
// THE BUG. "haan DD23" approved a price change on WhatsApp. It was
// handled BEFORE Master Chat (an approval is a decision about a record,
// not a sentence for a model), so it never reached the chat's history.
// The chat's memory still read: "I offered a price card" — and nothing
// after it. When the owner then asked to change the stock, the chat told
// him the price card was still waiting for approval and made no card. The
// database was right throughout; only the conversation's memory was not.
//
// SO EVERY EXCHANGE HANDLED OUTSIDE THE CHAT IS WRITTEN INTO IT: the
// owner's own words and the reply he was sent, exactly as sent — an
// approval or rejection, a suggestion answered, a payment button tapped,
// and the line that shows a card's code. What he saw is what the chat
// remembers.
//
// NEVER THROWS: the decision has already been carried out and the reply
// sent; failing to remember it must not turn either into an error.

export type HistoryTurn = { role: "user" | "assistant"; content: string };

/** The longest history kept — the chat reads the last 20 turns. */
export const HISTORY_KEPT = 60;

export async function rememberInWhatsAppChat(supabase: any, dealershipId: string, phone: string, turns: HistoryTurn[]): Promise<void> {
  const clean = turns.filter((t) => String(t.content ?? "").trim());
  if (!clean.length) return;
  try {
    const { data: session, error: readError } = await supabase
      .from("whatsapp_chat_sessions")
      .select("history")
      .eq("phone_number", phone)
      .maybeSingle();
    if (readError) {
      console.error(`[whatsapp-history] couldn't read the chat to remember a decision: ${readError.message}`);
      return;
    }
    const history: HistoryTurn[] = Array.isArray(session?.history) ? session.history : [];
    const next = [...history, ...clean].slice(-HISTORY_KEPT);
    const { error } = await supabase
      .from("whatsapp_chat_sessions")
      .upsert({ dealership_id: dealershipId, phone_number: phone, history: next, updated_at: new Date().toISOString() }, { onConflict: "phone_number" });
    if (error) console.error(`[whatsapp-history] couldn't remember a decision: ${error.message}`);
  } catch (err: any) {
    console.error(`[whatsapp-history] couldn't remember a decision: ${err?.message ?? err}`);
  }
}
