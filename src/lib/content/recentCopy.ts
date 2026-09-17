// What this business's copy has said lately, so the next piece doesn't
// repeat it.
//
// WHY (approved 2026-09-18): every generation started from an identical
// prompt with no memory of the last one, so the model reached for the same
// opening, rhythm and closing move every time. Social Management already
// showed its last posts to the generator; this brings Content Marketing
// and auto-posting up to the same thing.

/** The words out of a generated piece, whatever shape it came back in. */
export function copyTextOf(output: unknown): string {
  if (typeof output === "string") return output.trim();
  if (!output || typeof output !== "object") return "";
  const o = output as Record<string, unknown>;
  for (const key of ["caption", "text", "post", "message", "body", "headline", "hook"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      const nested = copyTextOf(v);
      if (nested) return nested;
    }
  }
  for (const [key, v] of Object.entries(o)) {
    if (key.startsWith("_")) continue;
    if (typeof v === "string" && v.trim().length > 20) return v.trim();
  }
  return "";
}

/**
 * The last few pieces written for this business. Best-effort: nothing to
 * show is the normal state for a new business, and a failed read must
 * never stop a generation.
 */
export async function recentCopy(supabase: any, dealershipId: string, limit = 5): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("content_pieces")
      .select("output, created_at")
      .eq("dealership_id", dealershipId)
      .order("created_at", { ascending: false })
      .limit(limit * 2);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of data ?? []) {
      const text = copyTextOf((row as Record<string, unknown>).output);
      const key = text.slice(0, 60).toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
