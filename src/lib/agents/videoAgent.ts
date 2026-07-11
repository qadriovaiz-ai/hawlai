// ------------------------------------------------------------------
// Video Agent — Phase 4 (Veo)
// ------------------------------------------------------------------
// Uses the SAME Gemini API key already connected for image generation
// — Veo is accessed via the same Gemini API, just needs the Gemini
// project to be on the paid tier (Veo isn't available on the free
// tier). No separate account/key needed for video generation itself.
//
// Video generation is a long-running operation: start it (returns an
// operation name), poll it separately until done, then download the
// result. Split into three functions so the API routes can do the
// "start" and "check status" as two separate, fast requests instead
// of blocking on a multi-minute operation.
// ------------------------------------------------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODEL = "veo-3.1-generate-preview";

export async function startVideoGeneration(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_BASE}/models/${VEO_MODEL}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't start video generation");
  if (!data.name) throw new Error("Gemini didn't return an operation to track");
  return data.name as string;
}

export interface VideoOperationStatus {
  done: boolean;
  videoBuffer?: Buffer;
  error?: string;
}

export async function checkVideoOperation(operationName: string): Promise<VideoOperationStatus> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const statusRes = await fetch(`${GEMINI_BASE}/${operationName}`, {
    headers: { "x-goog-api-key": apiKey },
  });
  const statusData = await statusRes.json();
  if (!statusRes.ok) return { done: true, error: statusData?.error?.message ?? "Couldn't check video status" };
  if (!statusData.done) return { done: false };

  if (statusData.error) {
    return { done: true, error: statusData.error.message ?? "Video generation failed" };
  }

  const videoUri = statusData?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) return { done: true, error: "No video was returned" };

  const videoRes = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
  if (!videoRes.ok) return { done: true, error: "Video finished but couldn't be downloaded" };
  const arrayBuffer = await videoRes.arrayBuffer();
  return { done: true, videoBuffer: Buffer.from(arrayBuffer) };
}
