// Multi-model video generation — Higgsfield-style: one picker, several
// underlying models. Two providers back the catalog:
//
// 1. Veo, direct via the Gemini API — already configured (same
//    GEMINI_API_KEY already used for image generation elsewhere), zero
//    extra cost/setup, kept as its own fast path rather than routed
//    through Runway.
// 2. Everything else (Kling, Sora, Seedance, Runway's own Gen-4
//    family) via ONE Runway API account — Runway's developer API is
//    itself a multi-model aggregator (the same idea as Higgsfield),
//    so one new API key unlocks the whole rest of the catalog instead
//    of needing a separate account per provider.
//
// Every entry reports `configured` honestly based on which env vars
// are actually present — nothing here fakes availability.

export interface VideoModelOption {
  key: string;
  label: string;
  description: string;
  provider: "veo-direct" | "runway";
  configured: boolean;
}

export interface VideoOperationStatus {
  done: boolean;
  videoBuffer?: Buffer;
  error?: string;
}

export interface VideoModelAdapter {
  start(prompt: string, modelKey: string): Promise<string>; // returns a task id to poll
  check(taskId: string, modelKey: string): Promise<VideoOperationStatus>;
}
