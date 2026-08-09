import { embedText } from "./voyageClient";
import { rerank } from "./rerankClient";

export interface RetrievedKnowledge {
  category: string;
  title: string;
  content: string;
  similarity: number;
}

// Real hybrid search: vector similarity (catches conceptual/semantic
// matches) combined with keyword full-text search (catches exact
// terms the embedding might not weight highly enough), then both
// candidate sets are reranked together by Voyage's reranker for the
// final precision pass. This two-stage pattern (broad retrieval, then
// precise reranking) is the standard way production RAG systems
// improve on single-method retrieval — each stage optimizes for a
// different thing (recall, then precision).
//
// Every stage degrades gracefully: no Voyage key → returns [].
// Reranker unavailable → falls back to the vector-search similarity
// order rather than failing the whole request. Master Chat must never
// break because a knowledge-retrieval enhancement had a hiccup.
export async function retrieveRelevantKnowledge(supabase: any, query: string, matchCount = 3): Promise<RetrievedKnowledge[]> {
  const queryEmbedding = await embedText(query, "query");
  if (!queryEmbedding) return [];

  let vectorResults: any[] = [];
  let keywordResults: any[] = [];

  try {
    const { data, error } = await supabase.rpc("match_marketing_knowledge", {
      query_embedding: queryEmbedding,
      match_count: 8, // wider net than before — reranking narrows it back down to matchCount
    });
    if (!error) vectorResults = (data ?? []).filter((r: any) => r.similarity > 0.4); // slightly relaxed threshold since reranking will filter more precisely afterward
  } catch (err: any) {
    console.error("[knowledge-retrieval] vector search error:", err.message);
  }

  try {
    const { data, error } = await supabase.rpc("keyword_search_marketing_knowledge", {
      search_query: query,
      match_count: 8,
    });
    if (!error) keywordResults = data ?? [];
  } catch (err: any) {
    // websearch_to_tsquery throws on some malformed inputs (e.g. lone
    // punctuation) — keyword search failing is not worth breaking
    // retrieval over, vector search alone still works.
    console.error("[knowledge-retrieval] keyword search error:", err.message);
  }

  // Merge and de-duplicate by id — a document found by both methods
  // only appears once going into reranking.
  const byId = new Map<string, any>();
  for (const r of [...vectorResults, ...keywordResults]) byId.set(r.id, r);
  const candidates = Array.from(byId.values());
  if (candidates.length === 0) return [];

  const rerankedIds = await rerank(
    query,
    candidates.map((c) => ({ id: c.id, text: `${c.title}\n${c.content}` }))
  );

  const ordered = rerankedIds
    ? rerankedIds.map((id) => candidates.find((c) => c.id === id)).filter(Boolean)
    : candidates; // reranker unavailable — fall back to vector-search's own order (candidates already skews vector-first since it's merged first)

  return ordered.slice(0, matchCount).map((r: any) => ({
    category: r.category,
    title: r.title,
    content: r.content,
    similarity: r.similarity ?? 1, // keyword-only matches don't have a vector similarity score — treated as fully relevant since the reranker already vetted them
  }));
}
