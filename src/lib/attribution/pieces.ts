// Giving a published thing one identity, whichever department wrote it
// (migration 197).
//
// A content piece, an email and a WhatsApp draft each live in their own
// table. Attribution needs one id it can hang a foreign key off and one
// static query to check ownership with, so each of them registers here
// when it is published and carries the registry's id from then on.
//
// Registering is idempotent: publishing the same draft twice is the same
// piece, not two.

import { isPieceId } from "./contentLink";

export type PieceKind = "content" | "email" | "whatsapp" | "autopilot";

export const SOURCE_TABLE: Record<PieceKind, string> = {
  content: "content_pieces",
  autopilot: "content_pieces",
  email: "email_marketing_pieces",
  whatsapp: "whatsapp_marketing_pieces",
};

/**
 * This piece's registry id, creating the row the first time.
 *
 * Returns null rather than throwing: attribution is never worth failing
 * a send or a post over. A caller that gets null simply publishes
 * unmarked, exactly as it did before any of this existed.
 */
export async function registerPiece(
  client: any,
  params: { dealershipId: string; kind: PieceKind; sourceId: string; label?: string | null }
): Promise<string | null> {
  if (!params.dealershipId || !isPieceId(params.sourceId)) return null;
  const sourceTable = SOURCE_TABLE[params.kind];
  if (!sourceTable) return null;

  try {
    const { data: existing } = await client
      .from("marketing_pieces")
      .select("id")
      .eq("dealership_id", params.dealershipId)
      .eq("source_table", sourceTable)
      .eq("source_id", params.sourceId)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await client
      .from("marketing_pieces")
      .insert({
        dealership_id: params.dealershipId,
        kind: params.kind,
        source_table: sourceTable,
        source_id: params.sourceId,
        label: params.label ? String(params.label).slice(0, 200) : null,
      })
      .select("id")
      .single();
    if (error) {
      // Two publishes at once: the unique index won, so read the winner.
      const { data: raced } = await client
        .from("marketing_pieces")
        .select("id")
        .eq("dealership_id", params.dealershipId)
        .eq("source_table", sourceTable)
        .eq("source_id", params.sourceId)
        .maybeSingle();
      return raced?.id ?? null;
    }
    return data?.id ?? null;
  } catch (err: any) {
    console.error("[attribution] registerPiece failed:", err?.message);
    return null;
  }
}

/**
 * A registry id confirmed to belong to this business.
 *
 * The id arrives in a request body or a public URL, so it proves nothing
 * on its own. One static table, one query — never a lookup on a table
 * named by the request.
 */
export async function ownedPieceId(client: any, dealershipId: string, pieceId: unknown): Promise<string | null> {
  if (!dealershipId || !isPieceId(pieceId)) return null;
  try {
    const { data } = await client
      .from("marketing_pieces")
      .select("id")
      .eq("id", pieceId)
      .eq("dealership_id", dealershipId)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}
