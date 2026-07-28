// Veo, direct via Gemini — thin wrapper around the existing
// videoAgent.ts functions so it fits the shared VideoModelAdapter
// shape used by the model picker. This path is already configured
// (same GEMINI_API_KEY used elsewhere) and unchanged in behavior.

import { startVideoGeneration, checkVideoOperation } from "@/lib/agents/videoAgent";
import type { VideoModelAdapter } from "./types";

export const veoDirectAdapter: VideoModelAdapter = {
  async start(prompt: string): Promise<string> {
    return startVideoGeneration(prompt);
  },
  async check(taskId: string, _modelKey: string, logContext?: { supabase: any; dealershipId: string }) {
    return checkVideoOperation(taskId, logContext);
  },
};

export const VEO_CONFIGURED = Boolean(process.env.GEMINI_API_KEY);
