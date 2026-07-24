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
