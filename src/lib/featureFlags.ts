// ------------------------------------------------------------------
// Global feature kill switches.
// ------------------------------------------------------------------
// These are NOT plan gating, and the distinction matters for what the
// customer is told. Plan gating answers "has this business paid for
// it" — the honest response is an upgrade prompt. A kill switch
// answers "does Hawlai ship this at all right now" — and telling an
// Agency customer to "upgrade to Agency" for something we switched off
// would send them chasing a purchase that changes nothing.
//
// Default is OFF. An absent, empty, or misspelled variable reads as
// disabled, so a missing env var can never silently leave a retired
// feature live. Only the exact string "true" enables one.
//
// Re-enabling needs no code change — set the variable and redeploy.
// The redeploy is unavoidable regardless of prefix: Vercel resolves env
// vars at build time for both server and client. NEXT_PUBLIC_ is used
// because the Tools catalog filters in a client component and has to
// reach the same verdict as the server, otherwise a tool card would
// offer a page the API refuses to serve.
// ------------------------------------------------------------------

export type KillSwitchFeature = "videoGeneration" | "studio3d";

/**
 * Each branch names its variable as a literal `process.env.NEXT_PUBLIC_*`
 * expression. Next.js only inlines the literal form into the client
 * bundle — a computed lookup like `process.env[key]` resolves to
 * undefined in the browser, which would read as "disabled" here and
 * quietly disagree with the server once a flag is turned back on.
 */
export function isFeatureEnabled(feature: KillSwitchFeature): boolean {
  switch (feature) {
    case "videoGeneration":
      return process.env.NEXT_PUBLIC_VIDEO_GENERATION_ENABLED === "true";
    case "studio3d":
      return process.env.NEXT_PUBLIC_STUDIO_3D_ENABLED === "true";
  }
}

export const KILL_SWITCH_LABELS: Record<KillSwitchFeature, string> = {
  videoGeneration: "AI Video Generation",
  studio3d: "3D Studio",
};

/**
 * Shown wherever a switched-off feature would otherwise appear.
 *
 * Says nothing about plans or upgrading, and explicitly reassures that
 * past work still exists — nothing was deleted, and a customer who
 * generated thirty videos last month should not be left wondering.
 */
export function unavailableMessage(feature: KillSwitchFeature): string {
  return `${KILL_SWITCH_LABELS[feature]} isn't part of Hawlai right now. Anything you already created with it is safe and still in your library.`;
}
