// Content Marketing Agent — covers all 20 tasks in one flexible
// generator instead of 20 separate agents: Instagram/LinkedIn/Twitter/
// Facebook/Threads posts, carousels, Pinterest pins, blog + SEO blog,
// email newsletters, product descriptions, landing/website copy, video/
// YouTube/Shorts scripts, reel ideas, hook generation, CTA generation,
// content calendar. Same Claude call pattern as the other agents:
// generous max_tokens, JSON-only response, full fallback, never cache
// a fallback in the API layer.

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
  { key: "hooks", label: "Hook Generation", group: "Quick Wins", instructions: "8 scroll-stopping opening hooks (first-line only) for social posts or videos, varied in style (question, bold claim, stat, story-opener)." },
  { key: "ctas", label: "CTA Generation", group: "Quick Wins", instructions: "10 varied call-to-action lines, mixing urgency, curiosity, and direct-offer styles, suitable for ads, posts and emails." },
  { key: "content_calendar", label: "Content Calendar", group: "Quick Wins", instructions: "A 7-day content calendar. Return an array of 7 items, each with day, contentType (pick from Instagram/LinkedIn/Reel/Blog/Email etc.), topic, and a 1-line angle." },
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
  brandProfile?: BrandProfile | null
): Promise<{ output: any; _fallback?: boolean }> {
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
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are a senior content marketer writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}
Topic/product/context: "${topic || "general brand content, use good judgement for this business type"}"

Content type: ${meta.label}
Output requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON sensibly for this content type (e.g. use "slides" array for carousels, "days" array for a content calendar, "hooks" array for hook generation, "ctas" array for CTA generation, otherwise a "text" field or clearly-named fields matching the requirements above). Be specific to this business and topic — never generic filler.`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return { output: parsed };
  } catch (err: any) {
    console.error("[content-marketing-agent] error:", err.message);
    return fallback;
  }
}
