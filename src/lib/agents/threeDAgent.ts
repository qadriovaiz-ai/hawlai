// Real interactive 3D generation — Opus writes a complete, self-
// contained Three.js scene as raw HTML, rendered live in a sandboxed
// iframe. This is genuinely generative code (not deterministic, built
// code like the Canvas Editor), so it's wrapped with real validation
// and honest failure reporting rather than assuming every generation
// succeeds.

import { logClaudeUsage } from "../usage/logUsage";

export interface ThreeDResult {
  html: string | null;
  error: string | null;
}

export async function generate3DScene(
  prompt: string,
  dealershipName: string,
  businessCategory: string,
  logContext?: { supabase: any; dealershipId: string }
): Promise<ThreeDResult> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        // Opus — this is genuinely creative, non-deterministic code
        // generation (real WebGL/Three.js), the same category of task
        // Claude Design uses its most capable model for. A cheaper
        // model would produce noticeably buggier 3D scenes.
        model: "claude-opus-4-8",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: `Write a single, complete, self-contained HTML file that renders an interactive 3D scene using Three.js, for "${dealershipName}" (a ${businessCategory} business).

What to build: ${prompt}

Hard technical requirements — the output must actually run without errors:
- Load Three.js r160+ from a CDN: <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
- Load OrbitControls from: <script src="https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
- Full scene setup: Scene, PerspectiveCamera, WebGLRenderer (antialias: true, sized to window), at least one ambient light and one directional/point light so materials are actually visible
- OrbitControls attached to the camera so the person can drag to rotate, scroll to zoom
- A slow auto-rotation on the main object by default (rotate it slightly each frame in the animation loop) so it looks alive even before anyone interacts, but OrbitControls should still let manual rotation override/pause it naturally
- A proper requestAnimationFrame render loop
- A window resize handler that updates camera aspect and renderer size
- Set renderer background to a dark, elegant color (something like #0a0a0f or similar) unless the prompt implies otherwise
- No external image/texture files — build everything from Three.js primitives (BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, ConeGeometry, etc.), MeshStandardMaterial/MeshPhysicalMaterial with color/metalness/roughness for visual richness instead of textures
- All CSS and JS inline in the one HTML file — <style> and <script> tags, nothing external except the two Three.js CDN script tags above
- body/html should have margin:0, overflow:hidden, and the canvas should fill the viewport
- Do NOT add a large business-name/tagline text overlay covering the viewport — the 3D object described in the prompt is the entire point of this page and must be the dominant, clearly visible thing on screen. If any text is added at all, keep it small (under 24px), positioned in a corner, and never on top of or blocking the 3D object.
- Position the camera and the main object so the object is actually centered and clearly framed in view on first load — never build a scene where the object is too small, too far away, positioned outside the camera's view, or hidden behind another element.
- Wrap all Three.js setup and the render loop in try/catch. If anything throws, catch it and render a visible, readable error directly on the page (e.g. a fixed-position div with red text on a dark background showing the error message) instead of a blank or broken-looking page — a visible error is far more useful than a silent failure that looks identical to "nothing went wrong."

Respond with ONLY the raw HTML — no markdown code fences, no explanation before or after, starting with <!DOCTYPE html> and nothing else.`,
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return { html: null, error: `Generation service returned an error (${response.status}): ${errBody.slice(0, 200)}` };
    }
    const data = await response.json();
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "3d_scene_generation", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0, "claude-opus-4-8");

    const text = data.content?.[0]?.text ?? "";
    const htmlMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
    const html = htmlMatch ? htmlMatch[0] : (text.includes("<html") ? text : null);

    if (!html) return { html: null, error: "The generated response wasn't a valid HTML page — try rephrasing the request." };
    return { html, error: null };
  } catch (err: any) {
    return { html: null, error: err.message ?? "3D scene generation failed" };
  }
}
