// Runway adapter — Runway's own developer API is a multi-model
// aggregator (their July 2026 update added Veo 3/3.1, and their
// unified video endpoint also serves Kling, Sora, Seedance, and
// Runway's own Gen-4 family), so ONE Runway account/API key unlocks
// this whole part of the catalog rather than needing a separate
// account per provider.
//
// Requires RUNWAY_API_KEY — not set yet, so `configured` is false and
// every call fails clearly rather than faking a result. Once a real
// account exists, double-check the exact request/response shape
// against https://docs.dev.runwayml.com/ before relying on this in
// production — API surfaces on fast-moving aggregators like this
// shift often.

import type { VideoModelAdapter } from "./types";

const API_BASE = "https://api.dev.runwayml.com/v1";
const API_VERSION = "2024-11-06";

export const RUNWAY_CONFIGURED = Boolean(process.env.RUNWAY_API_KEY);

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
    "X-Runway-Version": API_VERSION,
    "Content-Type": "application/json",
  };
}

// Runway model identifiers this app exposes in its picker. Runway's
// catalog changes frequently — these are the ones documented as of
// mid-2026; confirm current availability before going live.
export const RUNWAY_MODELS = {
  "runway:gen4_turbo": { label: "Runway Gen-4 Turbo", description: "Fast, general-purpose — good default for quick social clips." },
  "runway:gen4.5": { label: "Runway Gen-4.5", description: "Runway's top-tier model — best motion/temporal consistency." },
  "runway:veo3.1": { label: "Veo 3.1 (via Runway)", description: "Google's Veo, native audio — heavier/slower than the direct Veo option." },
  "runway:kling3": { label: "Kling 3.0", description: "Strong for character-driven, dialogue-style shots." },
  "runway:sora2": { label: "Sora 2", description: "OpenAI's model — strong general realism." },
  "runway:seedance2": { label: "Seedance 2.0", description: "Multi-shot, picture+sound together in one pass." },
} as const;

function runwayModelParam(modelKey: string): string {
  // "runway:gen4_turbo" -> "gen4_turbo"
  return modelKey.split(":")[1] ?? modelKey;
}

export const runwayAdapter: VideoModelAdapter = {
  async start(prompt: string, modelKey: string): Promise<string> {
    if (!RUNWAY_CONFIGURED) throw new Error("Runway isn't connected yet — RUNWAY_API_KEY is not set.");
    const res = await fetch(`${API_BASE}/text_to_video`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: runwayModelParam(modelKey),
        promptText: prompt,
        ratio: "1280:720",
        duration: 8,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Couldn't start Runway video generation");
    if (!data.id) throw new Error("Runway didn't return a task to track");
    return data.id as string;
  },

  async check(taskId: string) {
    if (!RUNWAY_CONFIGURED) return { done: true, error: "Runway isn't connected yet." };
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return { done: true, error: data?.error ?? "Couldn't check Runway task status" };

    if (data.status === "FAILED") return { done: true, error: data?.failure ?? "Runway generation failed" };
    if (data.status !== "SUCCEEDED") return { done: false };

    const videoUrl = data?.output?.[0];
    if (!videoUrl) return { done: true, error: "Runway finished but returned no video" };

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return { done: true, error: "Video finished but couldn't be downloaded" };
    const arrayBuffer = await videoRes.arrayBuffer();
    return { done: true, videoBuffer: Buffer.from(arrayBuffer) };
  },
};
