// Real per-unit provider pricing, used to compute EXACT cost from
// exact usage (tokens/duration the provider actually returned) —
// not a round-number guess. USD rates are converted to INR at an
// approximate FX rate; update PRICING.usdToInr if it drifts far from
// reality.

export const PRICING = {
  usdToInr: 87,

  // Claude Sonnet 4.6 — $3.00 input / $15.00 output per million tokens.
  anthropic: {
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
  },

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

export function costOfClaudeCallInr(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens / 1_000_000) * PRICING.anthropic.inputPerMillionUsd + (outputTokens / 1_000_000) * PRICING.anthropic.outputPerMillionUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
}

export function costOfVapiCallInr(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  const usd = minutes * PRICING.vapi.perMinuteUsd;
  return Math.round(usd * PRICING.usdToInr * 10000) / 10000;
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
