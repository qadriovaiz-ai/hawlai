// Social Media Management Agent — covers the tasks not already
// handled by the existing Social Media page (captions, posting,
// scheduling, influencer outreach) or /dashboard/insights (analytics/
// engagement numbers): reply suggestions, DM automation templates,
// comment replies, community management guidelines, growth strategy,
// and viral trend detection (uses Claude's web_search tool so trends
// are actually current instead of guessed from training data).

export interface SocialTaskMeta {
  key: string;
  label: string;
  needsInput: boolean; // whether this task takes a message/comment to reply to
  instructions: string;
}

export const SOCIAL_TASKS: SocialTaskMeta[] = [
  { key: "reply_suggestions", label: "Reply Suggestions", needsInput: true, instructions: "Given an incoming DM from a customer, write 3 reply variants (short, medium, and one with a follow-up question), friendly and on-brand, ready to send." },
  { key: "comment_replies", label: "Comment Replies", needsInput: true, instructions: "Given a public comment on a post, write 3 public-facing reply variants — warm, brief, and appropriate for a public audience (not just the commenter)." },
  { key: "dm_automation", label: "DM Automation Templates", needsInput: false, instructions: "5 auto-reply templates for common DM scenarios (greeting/first contact, pricing inquiry, availability/hours question, complaint, thank-you-for-purchase), each with {scenario, template} — template should have a natural placeholder like {name} where personalization fits." },
  { key: "community_management", label: "Community Management", needsInput: false, instructions: "A short community management playbook: 4 response-tone guidelines (do's/don'ts) and 3 example scenarios of when to take a conversation to DM instead of replying publicly. Return {guidelines: [], escalateToDm: []}." },
  { key: "growth_strategy", label: "Growth Strategy", needsInput: false, instructions: "A 5-tactic organic social growth strategy tailored to this business type and India, each with {tactic, howTo}, realistic for a small business with no ad budget." },
  { key: "engagement_analysis", label: "Engagement Analysis", needsInput: false, instructions: "6 practical tips to improve engagement on organic posts for this business type, each with {tip, why}." },
  { key: "viral_trends", label: "Viral Trend Detection", needsInput: false, instructions: "Search for current trending Instagram Reels/YouTube Shorts formats, audio, or hashtags in India relevant to this business category (this month). Return 5 trends as {trend, howToUse} — howToUse should explain how this specific business could adapt the trend. Base this on what you actually find via search, not guesses." },
];

// Single-reply generator for the REAL auto-reply pipeline (webhook ->
// generate -> send, no human review). Deliberately separate from
// generateSocialTask's reply_suggestions (which gives 3 variants for
// a human to pick from) — auto-send needs exactly one confident,
// safe reply, and a tighter prompt that explicitly avoids committing
// to anything risky (prices, promises, complaint resolutions) since
// nobody reviews this before it goes out.
export async function generateAutoReply(
  channel: "dm" | "comment",
  incomingText: string,
  dealershipName: string,
  businessCategory: string,
  brandProfile?: BrandProfile | null
): Promise<string | null> {
  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "Keep it warm and natural.";
  const safety = channel === "comment"
    ? "This reply is PUBLIC on a comment thread — keep it brief, warm, and generic. Never share prices, personal details, or specific commitments publicly; if the comment needs specifics, invite them to DM instead."
    : "This is a private DM auto-reply sent with NO human review before sending. If the message is a complaint, a complex question, or anything you're not confident about, reply with acknowledgement + 'our team will get back to you shortly' rather than guessing or promising something specific.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are auto-replying as "${dealershipName}", a ${businessCategory} business in India, to a ${channel === "dm" ? "private DM" : "public comment"}.
${brandContext}
${safety}
Incoming message: "${incomingText}"

Return JSON only: {"reply":"the reply text, under 200 characters, no markdown"}`,
        }],
      }),
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText.trim()) return null;
    const data = JSON.parse(bodyText);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return null;
    const parsed = JSON.parse(clean);
    return parsed.reply ?? null;
  } catch (err: any) {
    console.error("[auto-reply] error:", err.message);
    return null;
  }
}

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateSocialTask(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  inputText: string,
  brandProfile?: BrandProfile | null
): Promise<{ output: any; _fallback?: boolean }> {
  const meta = SOCIAL_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `${meta.label} draft for ${dealershipName}. Regenerate once the API is available for a tailored version.` },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it natural, warm, and specific to the business.";
  const isTrends = taskKey === "viral_trends";

  try {
    const body: any = {
      model: "claude-sonnet-4-6",
      max_tokens: isTrends ? 3000 : 1600,
      messages: [{
        role: "user",
        content: `You are a social media manager for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}
${meta.needsInput ? `Incoming message to respond to: "${inputText || "(no message provided — write generic examples)"}"` : ""}

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above. Be specific to this business — never generic filler.`,
      }],
    };
    if (isTrends) {
      body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    const text = (data.content ?? [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[social-management-agent] error:", err.message);
    return fallback;
  }
}
