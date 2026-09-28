// The video marketing tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface VideoTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const VIDEO_TASKS: VideoTaskMeta[] = [
  { key: "video_ideas", label: "Video Ideas", instructions: "5 distinct short-form video concept ideas for this business, each with a one-line concept, target platform, and why it'd work." },
  { key: "reel_script", label: "Reel Script", instructions: "A 15-30 second Instagram Reel script: on-screen hook text, spoken line, 2-3 quick beats, closing CTA. Fast-paced." },
  { key: "shorts_script", label: "Shorts Script", instructions: "A 30-45 second YouTube Shorts script: hook (first 2 seconds), body beats, closing line — written for vertical, fast-cut delivery." },
  { key: "tiktok_script", label: "TikTok Script", instructions: "A TikTok-native script: trend-aware hook, casual spoken tone (not ad-like), 3-4 beats, natural sign-off — should feel native to the platform, not a repurposed ad." },
  { key: "captions", label: "Captions", instructions: "3 caption variants for a short-form video on this topic, each under 100 characters, punchy, with 1-2 relevant emoji and no hashtags (hashtags handled separately)." },
  { key: "subtitles", label: "Subtitles", instructions: "SRT-style subtitle lines for a 30-second video script on this topic: return as an array of {time, text} objects, 5-7 short lines timed roughly every 4-5 seconds starting at 00:00." },
  { key: "video_editing", label: "Video Editing Notes", instructions: "An editing shot list / cut plan for a 30-45 second video on this topic: return as an array of {shot, description, duration} — pacing notes, suggested cuts, text overlay timing, music mood suggestion." },
  { key: "broll", label: "B-Roll Suggestions", instructions: "8 B-roll shot ideas relevant to this business/topic, each a short concrete visual description (e.g. 'close-up hands typing on laptop') that could be filmed easily on a phone." },
  { key: "animation", label: "Animation Concepts", instructions: "3 short animation/motion-graphics concepts suited to a small business budget (e.g. animated text reveals, simple icon animations, kinetic typography), each with a one-line concept and where it'd be used." },
];
