import type { VideoModelAdapter, VideoModelOption } from "./types";
import { veoDirectAdapter, VEO_CONFIGURED } from "./veoDirectAdapter";
import { runwayAdapter, RUNWAY_CONFIGURED, RUNWAY_MODELS } from "./runwayAdapter";

export function listVideoModels(): VideoModelOption[] {
  return [
    {
      key: "veo",
      label: "Veo 3.1",
      description: "Google's video model — direct, no extra account needed.",
      provider: "veo-direct",
      configured: VEO_CONFIGURED,
    },
    ...Object.entries(RUNWAY_MODELS).map(([key, meta]) => ({
      key,
      label: meta.label,
      description: meta.description,
      provider: "runway" as const,
      configured: RUNWAY_CONFIGURED,
    })),
  ];
}

export function getVideoAdapter(modelKey: string): VideoModelAdapter {
  if (modelKey === "veo") return veoDirectAdapter;
  return runwayAdapter;
}

export function isModelConfigured(modelKey: string): boolean {
  return listVideoModels().find((m) => m.key === modelKey)?.configured ?? false;
}

/**
 * Section 21 — provider failover for video.
 *
 * DELIBERATELY DIFFERENT from research failover, because the situation
 * is different: with research the customer asks "research my
 * competitors" and genuinely doesn't care which provider answers, so
 * substituting silently is correct. With video the customer EXPLICITLY
 * PICKED a model from a dropdown — Kling and Veo produce visibly
 * different output. Silently handing them a different model's video
 * and calling it what they asked for would be quietly dishonest.
 *
 * So video failover still happens (better than a dead end), but the
 * substitution is RECORDED — video_generations.model_key is updated to
 * whatever actually ran, and the caller surfaces it. Section 21's rule
 * is that the customer never sees provider plumbing or a technical
 * failure; it is not a licence to misreport which model made their video.
 *
 * Returns null when no configured alternative exists.
 */
export function getFallbackModelKey(modelKey: string): string | null {
  // Veo and Runway are the only two providers, so the fallback is
  // simply "the other one, if its key is present".
  if (modelKey === "veo") {
    const runwayAlternative = listVideoModels().find((m) => m.provider === "runway" && m.configured);
    return runwayAlternative?.key ?? null;
  }
  return isModelConfigured("veo") ? "veo" : null;
}
