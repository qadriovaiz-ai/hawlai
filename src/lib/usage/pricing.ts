// Real per-unit provider pricing, used to compute EXACT cost from
// exact usage (tokens/duration the provider actually returned) —
// not a round-number guess. USD rates are converted to INR at an
// approximate FX rate; update PRICING.usdToInr if it drifts far from
// reality.

export const PRICING = {
  usdToInr: 87,

  // Per-model Claude rates — three tiers now used across the app
  // (Haiku for high-frequency/low-complexity work, Sonnet as the
  // default, Opus for infrequent high-stakes reasoning). Keyed by the
  // exact model string sent to the API, so cost is computed from
  // whichever model actually ran, not a single assumed rate.
  anthropic: {
    "claude-opus-4-8": { inputPerMillionUsd: 5.0, outputPerMillionUsd: 25.0 },
    "claude-sonnet-4-6": { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
    "claude-haiku-4-5-20251001": { inputPerMillionUsd: 1.0, outputPerMillionUsd: 5.0 },
  } as Record<string, { inputPerMillionUsd: number; outputPerMillionUsd: number }>,

  // Vapi — ~$0.09/minute blended cost, as shown on the actual Vapi
  // dashboard for the assistant/voice/model combination in use.
  vapi: {
    perMinuteUsd: 0.09,
  },

  // Gemini 2.5 Flash Image ("nano-banana") — standard tier. Google
  // bills this per output image (1290 tokens at $30/million output
  // tokens for images up to 1024x1024), published as a flat $0.039/image.
  geminiImage: {
    perImageUsd: 0.039,
  },

  // Veo 3.1, standard tier, 720p/1080p — $0.40/second. This app's Veo
  // calls don't set an explicit duration, so Veo generates its default
  // clip length (8s, same fixed length Runway's adapter requests too).
  veo: {
    perSecondUsd: 0.4,
    defaultDurationSeconds: 8,
  },

  // ElevenLabs text-to-speech, pay-as-you-go API pricing for the
  // eleven_multilingual_v2 model — $0.10 per 1,000 characters, same
  // rate across subscription tiers.
  elevenlabs: {
    perThousandCharsUsd: 0.1,
  },
};

export function costOfClaudeCallInr(inputTokens: number, outputTokens: number, model: string = "claude-sonnet-4-6"): number {
  const rate = PRICING.anthropic[model] ?? PRICING.anthropic["claude-sonnet-4-6"];
  const usd = (inputTokens / 1_000_000) * rate.inputPerMillionUsd + (outputTokens / 1_000_000) * rate.outputPerMillionUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
}

export function costOfVapiCallInr(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  const usd = minutes * PRICING.vapi.perMinuteUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
}

// What a business is billed for calling minutes beyond their plan's
// free allowance — the real Vapi cost per minute plus plan_limits'
// calling_margin_inr per minute (migration 079).
export function costOfCallingOverageInr(extraMinutes: number, marginInrPerMinute: number): number {
  const vapiCostInr = extraMinutes * PRICING.vapi.perMinuteUsd * PRICING.usdToInr;
  const margin = extraMinutes * marginInrPerMinute;
  return Math.round((vapiCostInr + margin) * 10000) / 10000;
}

export function costOfGeminiImageInr(imageCount: number = 1): number {
  const usd = imageCount * PRICING.geminiImage.perImageUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
}

export function costOfVeoVideoInr(durationSeconds: number = PRICING.veo.defaultDurationSeconds): number {
  const usd = durationSeconds * PRICING.veo.perSecondUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
}

export function costOfElevenLabsInr(characterCount: number): number {
  const usd = (characterCount / 1000) * PRICING.elevenlabs.perThousandCharsUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
}
