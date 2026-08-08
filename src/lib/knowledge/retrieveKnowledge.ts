import { embedText } from "./voyageClient";

export interface RetrievedKnowledge {
  category: string;
  title: string;
  content: string;
  similarity: number;
}

// Real semantic retrieval — embeds the person's message and finds the
// most relevant marketing knowledge via cosine similarity, instead of
// keyword matching. Returns [] (not an error) whenever anything in the
// chain isn't available yet (no VOYAGE_API_KEY, no seeded knowledge,
// a failed embed) — RAG is an enhancement, Master Chat must keep
// working normally without it.
export async function retrieveRelevantKnowledge(supabase: any, query: string, matchCount = 3): Promise<RetrievedKnowledge[]> {
  const queryEmbedding = await embedText(query, "query");
  if (!queryEmbedding) return [];

  try {
    const { data, error } = await supabase.rpc("match_marketing_knowledge", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
    });
    if (error) {
      console.error("[knowledge-retrieval] rpc error:", error.message);
      return [];
    }
    // A low similarity score means nothing in the knowledge base is
    // actually relevant — better to inject nothing than to force-feed
    // a barely-related framework into context just because it was the
    // "closest" of a bad set of matches.
    return (data ?? []).filter((r: RetrievedKnowledge) => r.similarity > 0.5);
  } catch (err: any) {
    console.error("[knowledge-retrieval] error:", err.message);
    return [];
  }
}
