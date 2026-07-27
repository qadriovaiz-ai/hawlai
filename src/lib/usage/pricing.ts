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
