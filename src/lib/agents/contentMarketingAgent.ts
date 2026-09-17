// Content Marketing Agent — covers all 20 tasks in one flexible
// generator instead of 20 separate agents: Instagram/LinkedIn/Twitter/
// Facebook/Threads posts, carousels, Pinterest pins, blog + SEO blog,
// email newsletters, product descriptions, landing/website copy, video/
// YouTube/Shorts scripts, reel ideas, hook generation, CTA generation,
// content calendar. Same Claude call pattern as the other agents:
// generous max_tokens, JSON-only response, full fallback, never cache
// a fallback in the API layer.

import { logClaudeUsage } from "../usage/logUsage";
import { getModel } from "../models";
import { formatFactsForCopy, COPY_TRUTH_RULES, type BusinessFacts } from "@/lib/claims/businessFacts";
import { guardGenerated, type ClaimsMode } from "@/lib/claims/claimCheck";
import { resolveFestiveTopic } from "@/lib/expertise/seasonalCalendar";
import { STORY_CATEGORY } from "@/lib/business/businessStory";

// WHY THIS EXISTS (approved 2026-09-18): every caption came out in the
// same shape — hook line, product line, price, CTA, question — whatever
// was being promoted, and read as if it could belong to any business in
// the same category. Three causes, all addressed here:
//   1. the per-type instructions prescribed that shape;
//   2. nothing told the model to commit to ONE angle, so it covered
//      every base and landed on the safe average;
//   3. nothing showed it what it had already written, so it reached for
//      the same moves every time.
// The cure is never invention: specificity comes from the owner's own
// story facts (lib/business/businessStory.ts), which the claims guard
// already treats as verified.

/** One piece, one angle — committed to, not blended with the others. */
const ANGLES = [
  "the making — one real step of how this is made or done, in detail",
  "the material or ingredient — what it is, where it comes from, why this one",
  "the slow part — what takes longest or goes wrong, and why it's still done that way",
  "the person — the owner's own reason for doing this, in their words",
  "a customer moment — something a customer actually said or did",
  "the detail people notice — the small thing customers ask about",
  "what people get wrong — a misunderstanding about this kind of work, corrected plainly",
  "the use — what it's actually like to live with, on an ordinary day",
  "what we refuse to do — a shortcut not taken, and the cost of not taking it",
  "the occasion — why now, if today's date genuinely makes it relevant",
];

/** Openings and phrasings a reader has seen a thousand times. */
const TIRED_MOVES = [
  "Looking for X? Look no further",
  "Introducing / Meet the ...",
  "Elevate your ...",
  "Transform your ...",
  "Say goodbye to X, say hello to Y",
  "Perfect for ...",
  "Indulge in ...",
  "the perfect blend of X and Y",
  "crafted with love / made with love",
  "a touch of luxury / a slice of heaven",
  "Because you deserve ...",
  "Tag someone who ...",
  "Which one is your favourite? / Drop a ❤️ if ...",
  "Experience the difference",
  "Not just a X — it's a Y",
];

function angleFor(topic: string, recent: string[]): string {
  // Rotated, not random: successive pieces on the same topic get
  // different angles instead of the model's default favourite.
  const seed = `${topic}|${recent.length}`.split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100000, 7);
  const order = ANGLES.map((a, i) => ANGLES[(i + seed) % ANGLES.length]);
  return order.slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join("\n");
}

/** The part of the prompt that asks for one committed angle and real specifics. */
export function craftSection(topic: string, recent: string[], hasStory: boolean): string {
  return `
## How to write this (this matters more than the format)
- Pick ONE angle and commit to it for the whole piece. Choose from these three, or a better one the facts suggest:
${angleFor(topic, recent)}
- Use at least one CONCRETE, specific detail from the verified facts — a step, a material, a place, a length of time, something a customer said. ${
    hasStory
      ? "The owner's own story is in the facts above: use it. That detail is the whole point of the piece."
      : "The owner hasn't written their story down yet, so specifics are thin — write only what the facts support, stay plain, and don't pad with adjectives to fill the gap."
  }
- Write it as one person telling another something true. No stacked adjectives, no rented enthusiasm.
- These openings and phrasings are worn out — never use them or anything close to them:
${TIRED_MOVES.map((m) => `  - ${m}`).join("\n")}
- Mention the price only if this particular piece needs it. A price is not a closing move.
- End the way this piece actually ends. A question is one option, not the default.${
    recent.length
      ? `\n- Recent pieces for this business — do NOT repeat their openings, rhythm or closing moves:\n${recent.map((r) => `  - "${r.replace(/\s+/g, " ").slice(0, 160)}"`).join("\n")}`
      : ""
  }`;
}

export interface ContentTypeMeta {
  key: string;
  label: string;
  group: "Social Posts" | "Long-form" | "Email & Sales Copy" | "Video" | "Quick Wins";
  instructions: string; // tells Claude the exact output shape/style for this type
}

export const CONTENT_TYPES: ContentTypeMeta[] = [
  { key: "instagram_post", label: "Instagram Post", group: "Social Posts", instructions: "A single Instagram feed post caption, under 150 words, native emoji use, ends with a question or CTA, plus 8-10 relevant hashtags." },
  { key: "carousel", label: "Carousel", group: "Social Posts", instructions: "A 6-8 slide Instagram/LinkedIn carousel. Return slides as an array, each slide has a short punchy headline (under 10 words) and one supporting line." },
  { key: "linkedin_post", label: "LinkedIn Post", group: "Social Posts", instructions: "A LinkedIn post, 100-200 words, professional but human tone, short paragraphs/line breaks, ends with a discussion question." },
  { key: "twitter_post", label: "Twitter / X Post", group: "Social Posts", instructions: "A single tweet under 280 characters, punchy and specific, optionally suggest it as part of a short thread (2-3 tweets) if the topic needs it." },
  { key: "facebook_post", label: "Facebook Post", group: "Social Posts", instructions: "A Facebook post, slightly longer and more conversational than Instagram, 80-150 words, community-toned." },
  { key: "threads_post", label: "Threads Post", group: "Social Posts", instructions: "A Threads post, casual and conversational, under 100 words, feels like a real opinion not an ad." },
  { key: "pinterest_pin", label: "Pinterest Pin", group: "Social Posts", instructions: "A Pinterest pin title (under 100 characters, keyword-rich) and description (under 500 characters, keyword-rich, includes a soft CTA)." },
  { key: "blog_post", label: "Blog Writing", group: "Long-form", instructions: "A blog post outline with title, meta description, and 5-6 section headings each with a 2-sentence summary of what goes there — not the full article, a strong structured outline." },
  { key: "seo_blog", label: "SEO Blog", group: "Long-form", instructions: "An SEO-focused blog outline: title (with primary keyword), meta description (under 160 chars), target keyword, 3-4 secondary keywords, H2 section headings with 1-sentence notes on search intent for each." },
  { key: "email_newsletter", label: "Email Newsletter", group: "Email & Sales Copy", instructions: "An email newsletter with subject line, preview text (under 90 chars), and body (3-4 short sections with a clear CTA at the end)." },
  { key: "product_description", label: "Product Description", group: "Email & Sales Copy", instructions: "A product description, 60-100 words, benefit-led not feature-led, ends with a soft CTA." },
  { key: "landing_page_copy", label: "Landing Page Copy", group: "Email & Sales Copy", instructions: "Landing page copy: headline, subheadline, 3 benefit bullets, and a CTA button text." },
  { key: "website_copy", label: "Website Copy", group: "Email & Sales Copy", instructions: "Homepage website copy: hero headline, hero subline, an 'About' section (2-3 sentences), and 3 short value-proposition blurbs." },
  { key: "video_script", label: "Video Script", group: "Video", instructions: "A 30-60 second video script with a Hook (first 3 seconds), Body (main message), and CTA (closing line), written for spoken delivery." },
  { key: "youtube_script", label: "YouTube Script", group: "Video", instructions: "A YouTube video script outline: title, hook (first 15 seconds), 3-4 main talking-point sections, and an outro CTA." },
  { key: "shorts_script", label: "Shorts / Reels Script", group: "Video", instructions: "A 15-30 second Shorts/Reels script: on-screen hook text, spoken line, 2-3 quick beats, and a closing CTA — punchy, fast-paced." },
  { key: "reel_ideas", label: "Reel Ideas", group: "Quick Wins", instructions: "5 distinct reel/short-form video concept ideas, each with a one-line concept and a one-line hook." },
  { key: "hooks", label: "Hook Generation", group: "Quick Wins", instructions: "8 scroll-stopping opening hooks (first-line only) for social posts or videos, varied in style (question, bold statement, surprising-but-true observation, story-opener) — never an invented statistic." },
  { key: "ctas", label: "CTA Generation", group: "Quick Wins", instructions: "10 varied call-to-action lines, mixing curiosity, benefit-led and direct styles — urgency or an offer only when the facts contain a real one — suitable for ads, posts and emails." },
  { key: "content_calendar", label: "Content Calendar", group: "Quick Wins", instructions: "A 7-day content calendar — but this must be real, ready-to-post content for each day, not just a topic list. Return an array of 7 items, each with day, contentType (pick from Instagram/LinkedIn/Reel/Blog/Email etc.), topic, angle (1 line), AND caption — the full, actual, ready-to-copy-paste caption/post text for that day (write it exactly as it should be posted, including a hook and a natural close — for a Reel/video format, write the actual on-screen hook line and caption, not just a scene description). The person should be able to copy each day's caption straight into the app and post it, not have to write it themselves from the topic/angle." },
];

interface BrandProfile {
  tone_of_voice?: string | null;
  target_persona?: any;
  messaging_pillars?: string[] | null;
}

export async function generateContent(
  contentTypeKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). When given, copy is written from them and checked against them. */
  facts?: BusinessFacts | null,
  /** "draft" when the owner reviews this before it's used: unverified prices are flagged, not removed. */
  claimsMode: ClaimsMode = "publish",
  opts: {
    /** The last few pieces written for this business, so this one doesn't repeat them. */
    recent?: string[];
    /** Second pass that cuts lines any business in the same category could have written. Pages where a human reviews; never the auto-publish path. */
    revise?: boolean;
  } = {}
): Promise<{ output: any; _fallback?: boolean; claimsRemoved?: string[]; priceWarnings?: string[]; revised?: boolean }> {
  const meta = CONTENT_TYPES.find((t) => t.key === contentTypeKey);
  if (!meta) return { output: { text: "Unknown content type." }, _fallback: true };

  const fallback = {
    output: {
      text: `Draft ${meta.label.toLowerCase()} for ${dealershipName} about "${topic || "your business"}". Regenerate once your Anthropic API key/quota is available for a tailored version.`,
    },
    _fallback: true,
  };

  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "not set"}. Messaging pillars: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}.`
    : "No brand voice set yet — keep it natural and honest, avoid generic marketing-speak.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are a senior content marketer writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}${facts ? `\n\n${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}\n` : ""}
Topic/product/context: "${resolveFestiveTopic(topic, facts?.season) || "general brand content, use good judgement for this business type"}"

Content type: ${meta.label}
Output requirements: ${meta.instructions}
${craftSection(topic, opts.recent ?? [], Boolean(facts?.ownerFacts?.some((k) => k.category === STORY_CATEGORY)))}

Return JSON only, no markdown, no preamble. Shape the JSON sensibly for this content type (e.g. use "slides" array for carousels, "days" array for a content calendar, "hooks" array for hook generation, "ctas" array for CTA generation, otherwise a "text" field or clearly-named fields matching the requirements above). Be specific to this business and topic — never generic filler.`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "content_generation", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    let parsed = JSON.parse(clean);
    let revised = false;
    if (opts.revise) {
      const second = await reviseForSpecificity(parsed, meta.label, facts, logContext);
      if (second) {
        parsed = second;
        revised = true;
      }
    }
    if (!facts) return { output: parsed, ...(revised ? { revised } : {}) };
    // Sentences making claims the facts don't support are removed, and
    // the owner is told (output._claimsNote) — never silently kept.
    const guarded = guardGenerated(parsed, facts, claimsMode);
    return { output: guarded.output, claimsRemoved: guarded.removed, priceWarnings: guarded.priceWarnings, ...(revised ? { revised } : {}) };
  } catch (err: any) {
    console.error("[content-marketing-agent] error:", err.message);
    return fallback;
  }
}

/**
 * The second pass: cut every line that any business in the same line of
 * work could have written, and keep only what the verified facts support.
 *
 * Runs only where a person reads the result before it's used (the Content
 * Marketing page, the content queue) — never on the auto-publish path,
 * where a second call's cost buys nothing with no human in the loop.
 *
 * Returns null on any failure: the first draft beats nothing, so a
 * revision that doesn't come back is simply skipped.
 */
export async function reviseForSpecificity(
  draft: any,
  contentLabel: string,
  facts: BusinessFacts | null | undefined,
  logContext?: { supabase: any; dealershipId: string }
): Promise<any | null> {
  if (!facts) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are a ruthless copy editor. Below is a draft ${contentLabel} for a real business, and the verified facts about that business.

THE TEST, line by line: could a competitor in the same line of work publish this exact line about themselves? If yes it is filler — cut it, or replace it with something only THIS business can say, taken from the facts.

Rules:
- Replace only with specifics that are IN the facts: a step, a material, a place, a length of time, something a customer said, the owner's own words. Never invent a detail, number, review, offer or claim — inventing one is worse than leaving the line out.
- Keep the same JSON shape, the same language, and roughly the same length. No preamble.
- Cut stacked adjectives, rented enthusiasm and marketing throat-clearing. Plain and specific beats warm and vague.
- A line already specific to this business stays exactly as it is.

${formatFactsForCopy(facts)}

${COPY_TRUTH_RULES}

Draft JSON:
${JSON.stringify(draft).slice(0, 6000)}

Return the edited JSON only — same shape, no markdown, no commentary.`,
        }],
      }),
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText.trim()) return null;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "content_revision", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    const clean = (match ? match[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return null;
    const revised = JSON.parse(clean);
    // A revision that came back a different shape isn't a revision.
    const sameShape = Object.keys(draft ?? {}).every((k) => k.startsWith("_") || k in revised);
    return sameShape ? revised : null;
  } catch (err: any) {
    console.error("[content-marketing-agent] revision pass failed:", err.message);
    return null;
  }
}
