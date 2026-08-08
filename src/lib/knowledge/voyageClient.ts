// Voyage AI embeddings — Anthropic's recommended embedding provider
// for RAG alongside Claude. MongoDB acquired Voyage AI, so keys are
// now issued through MongoDB Atlas ("Model API Keys" under AI Model
// APIs) rather than dash.voyageai.com — and Atlas-issued keys only
// authenticate against ai.mongodb.com, NOT the legacy
// api.voyageai.com endpoint. Requires VOYAGE_API_KEY in the
// environment (an Atlas Model API key, format starting "al-").
//
// input_type matters for retrieval quality: "document" when embedding
// something going INTO the knowledge base, "query" when embedding a
// person's message to search AGAINST it — using the wrong one doesn't
// error, it just quietly makes retrieval worse.

const VOYAGE_ENDPOINT = "https://ai.mongodb.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-4-lite";
const VOYAGE_DIMENSION = 1024; // must match the `embedding vector(1024)` column in migration 090

export async function embedText(text: string, inputType: "document" | "query"): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null; // not configured yet — callers must handle this gracefully, not throw

  try {
    const response = await fetch(VOYAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: VOYAGE_MODEL,
        input_type: inputType,
        output_dimension: VOYAGE_DIMENSION,
      }),
    });
    if (!response.ok) {
      console.error("[voyage] embedding request failed:", response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (err: any) {
    console.error("[voyage] embedding error:", err.message);
    return null;
  }
}
