// Which product a post's PHOTO shows — T3 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// Used only when the caption names no product (no #HawlaiTag, T1). The
// post's photo is compared with the catalog's own product photos in one
// AI call through lib/ai/claude.ts.
//
// A GUESS IS NEVER STATED AS FACT (the plan's decision 6). High
// confidence still makes the reply ASK "is it the X?" before any price;
// low confidence asks which product. The answer must be one of the names
// the model was shown, or it is no answer at all.
//
// CACHED PER POST (migration 248): the same post is not paid for twice.
// A cache that can't be read means NO model call — cost is not risked on
// a database hiccup. A failed model call is not cached, so it can be
// tried again on the next message.

import { callClaude } from "@/lib/ai/claude";
import { modelForTask } from "@/lib/aiTaskRouter";
import { parseModelJson } from "@/lib/ai/modelJson";

export type PhotoGuess = { product: string | null; confidence: "high" | "low" | "none" };

/** At most this many catalog photos go into one comparison. */
export const MAX_CANDIDATES = 8;

/** The model's answer, accepted only as a name it was shown. */
export function readGuess(value: any, names: string[]): PhotoGuess | null {
  if (!value || typeof value !== "object") return null;
  const confidence = value.confidence;
  if (confidence !== "high" && confidence !== "low") return null;
  if (value.product == null) return { product: null, confidence: "none" };
  const wanted = String(value.product).trim().toLowerCase();
  const hit = names.find((n) => n.trim().toLowerCase() === wanted);
  return hit ? { product: hit, confidence } : { product: null, confidence: "none" };
}

export async function guessProductFromPhoto(
  supabase: any,
  dealershipId: string,
  mediaId: string,
  imageUrl: string,
  catalog: { name: string; images?: string[] | null; kind?: string | null; active?: boolean | null }[]
): Promise<PhotoGuess> {
  const none: PhotoGuess = { product: null, confidence: "none" };

  const { data: cached, error: cacheError } = await supabase
    .from("instagram_post_guesses")
    .select("product_name, confidence")
    .eq("dealership_id", dealershipId)
    .eq("media_id", mediaId)
    .maybeSingle();
  if (cacheError) {
    console.error(`[post-vision] cache unreadable, no comparison made: ${cacheError.message}`);
    return none;
  }
  if (cached) return { product: cached.product_name ?? null, confidence: cached.confidence };

  const candidates = catalog
    .filter((p) => p.active !== false && p.kind !== "service" && Array.isArray(p.images) && p.images[0])
    .slice(0, MAX_CANDIDATES);
  if (!candidates.length) return none;

  const content: any[] = [
    { type: "text", text: "This is a photo from a small shop's Instagram post:" },
    { type: "image", source: { type: "url", url: imageUrl } },
    { type: "text", text: "These are the shop's products, each with its own photo:" },
  ];
  candidates.forEach((p, i) => {
    content.push({ type: "text", text: `Product ${i + 1}: ${JSON.stringify(p.name)}` });
    content.push({ type: "image", source: { type: "url", url: p.images![0] } });
  });
  content.push({
    type: "text",
    text: `Which ONE of these products does the post's photo show? Answer with the exact product name, or null if none clearly matches. "high" only if you are sure it is the same product (same item, colour and design), otherwise "low".
Return JSON only: {"product":"<exact name> or null","confidence":"high|low"}`,
  });

  const r = await callClaude(
    { model: modelForTask("dm_post_vision"), max_tokens: 150, messages: [{ role: "user", content }] },
    { operation: "dm_post_vision", logContext: { supabase, dealershipId } }
  );
  if (!r.ok) return none;
  const parsedReply = parseModelJson(r.text);
  if (!parsedReply.ok) {
    console.error(`[post-vision] ${parsedReply.cause}: ${parsedReply.detail}`);
    return none;
  }
  const guess = readGuess(parsedReply.value, candidates.map((p) => p.name));
  if (!guess) return none;

  const { error: saveError } = await supabase
    .from("instagram_post_guesses")
    .upsert({ dealership_id: dealershipId, media_id: mediaId, product_name: guess.product, confidence: guess.confidence }, { onConflict: "dealership_id,media_id" });
  if (saveError) console.error(`[post-vision] guess not cached: ${saveError.message}`);
  return guess;
}
