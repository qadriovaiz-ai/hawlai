// Voyage AI reranker — takes a query + a set of candidate documents
// (already retrieved via vector + keyword search) and returns them
// re-scored by actual relevance, which is more precise than either
// search method alone. Same MongoDB Atlas endpoint/auth as the
// embeddings client, since Atlas-issued keys only work against
// ai.mongodb.com, not api.voyageai.com.

const RERANK_ENDPOINT = "https://ai.mongodb.com/v1/rerank";
const RERANK_MODEL = "rerank-2.5-lite"; // cost-effective tier, matches voyage-4-lite's "lite" choice for embeddings

export interface RerankCandidate {
  id: string;
  text: string; // what actually gets scored against the query
}

// Returns candidate ids in best-to-worst relevance order. Returns
// null (not an empty array) on any failure, so callers can
// distinguish "reranking unavailable, fall back to raw search order"
// from "reranking ran and found nothing relevant."
export async function rerank(query: string, candidates: RerankCandidate[]): Promise<string[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey || candidates.length === 0) return null;

  try {
    const response = await fetch(RERANK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        documents: candidates.map((c) => c.text),
        model: RERANK_MODEL,
      }),
    });
    if (!response.ok) {
      console.error("[voyage-rerank] request failed:", response.status, await response.text());
      return null;
    }
    const data = await response.json();
    // Voyage returns { data: [{ index, relevance_score }, ...] } sorted best-first.
    const ordered = (data?.data ?? []).map((r: { index: number }) => candidates[r.index]?.id).filter(Boolean);
    return ordered.length > 0 ? ordered : null;
  } catch (err: any) {
    console.error("[voyage-rerank] error:", err.message);
    return null;
  }
}
