// The content types, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface ContentTypeMeta {
  key: string;
  label: string;
  group: "Social Posts" | "Long-form" | "Email & Sales Copy" | "Video" | "Quick Wins";
  instructions: string; // tells Claude the exact output shape/style for this type
}

export const CONTENT_TYPES: ContentTypeMeta[] = [
  { key: "instagram_post", label: "Instagram Post", group: "Social Posts", instructions: "A single Instagram feed post caption, under 150 words. Emoji only where they fit the brand voice. End however this piece actually ends — a question or a call to action is one option, not a requirement. Then 3-5 hashtags specific to this piece (what it's about, what it is), never generic filler or a location tag added by habit. Links aren't clickable in Instagram captions — point to the link in bio instead of writing a URL." },
  { key: "carousel", label: "Carousel", group: "Social Posts", instructions: "A 6-8 slide Instagram/LinkedIn carousel. Return slides as an array, each slide has a short punchy headline (under 10 words) and one supporting line." },
  { key: "linkedin_post", label: "LinkedIn Post", group: "Social Posts", instructions: "A LinkedIn post, 100-200 words, professional but human, short paragraphs with line breaks. End where the thought ends — a discussion question is one option, not a requirement. 0-3 hashtags, only if they're specific to the piece." },
  { key: "twitter_post", label: "Twitter / X Post", group: "Social Posts", instructions: "A single post under 280 characters, specific rather than punchy-for-its-own-sake; suggest a short thread (2-3 posts) only if the topic genuinely needs it. At most 1-2 hashtags, and only specific ones." },
  { key: "facebook_post", label: "Facebook Post", group: "Social Posts", instructions: "A Facebook post, a little longer and more conversational than Instagram, 80-150 words, community-toned. End however the piece ends — no compulsory question. 0-3 hashtags, specific to the piece." },
  { key: "threads_post", label: "Threads Post", group: "Social Posts", instructions: "A Threads post, casual and conversational, under 100 words, feels like a real opinion not an ad." },
  { key: "pinterest_pin", label: "Pinterest Pin", group: "Social Posts", instructions: "A Pinterest pin title (under 100 characters, with the words people would search for) and description (under 500 characters, searchable and specific). A call to action only if it fits." },
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
