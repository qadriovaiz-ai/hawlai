// Social Media Management Agent — covers the tasks not already
// handled by the existing Social Media page (captions, posting,
// scheduling, influencer outreach) or /dashboard/insights (analytics/
// engagement numbers): reply suggestions, DM automation templates,
// comment replies, community management guidelines, growth strategy,
// and viral trend detection (uses Claude's web_search tool so trends
// are actually current instead of guessed from training data).

import { logClaudeUsage } from "../usage/logUsage";
import { getModel } from "../models";

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
  brandProfile?: BrandProfile | null,
  productCatalog?: { name: string; price: number; description?: string | null; inventoryCount?: number | null }[],
  // P3 20a — sourced from the shared getBusinessContext() assembler;
  // this surface had zero access to real business_knowledge before,
  // useful for questions ("are you open Sundays") the catalog alone
  // can't answer.
  knowledgeFacts?: { category: string; title: string; content: string }[] | null,
  // P3 (Personalization) — this specific sender's own history
  // (getLeadMemory, P1 4a), only ever present once resolveDmLead has
  // linked this conversation to a real lead.
  pastInsights?: string[] | null,
  // P3 piece 5 — the assigned persona's goals, shaping what this
  // reply is trying to achieve (support vs. sales vs. front-desk).
  personaGoals?: string | null
): Promise<string | null> {
  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "Keep it warm and natural.";

  // Real catalog, when available — this is what turns "I'll get back
  // to you" into an actual instant answer for the very common "how
  // much is this / is this available" DM, without ever inventing a
  // price for something not genuinely in the catalog.
  const catalogContext = productCatalog && productCatalog.length > 0
    ? `\nReal current product catalog (use this for any question about a specific product — price, availability):\n${productCatalog.map((p) => `- ${p.name}: ₹${p.price}${p.inventoryCount !== undefined && p.inventoryCount !== null ? (p.inventoryCount > 0 ? ` (in stock)` : ` (out of stock)`) : ""}${p.description ? ` — ${p.description.slice(0, 80)}` : ""}`).join("\n")}`
    : "";

  const knowledgeContext = knowledgeFacts && knowledgeFacts.length > 0
    ? `\nReal facts about this business you can state with confidence (only these — don't extend or guess beyond them):\n${knowledgeFacts.map((f) => `- ${f.title}: ${f.content}`).join("\n")}`
    : "";

  // Comments are public and effectively anonymous per-thread — past
  // insights only apply to DMs, where a real sender identity exists.
  const insightsContext = channel === "dm" && pastInsights && pastInsights.length > 0
    ? `\nWhat's happened with this person before, from past interactions (reference this naturally if relevant, don't repeat something they already said no to):\n${pastInsights.map((i) => `- ${i}`).join("\n")}`
    : "";

  // P3 piece 5 — what this reply is trying to achieve, per the
  // persona the owner assigned to this channel. Advisory framing on
  // top of the hard safety rules below, never a replacement for them.
  const personaContext = personaGoals?.trim()
    ? `\nWhat you're here to do, in priority order:\n${personaGoals.trim()}`
    : "";

  const safety = channel === "comment"
    ? "This reply is PUBLIC on a comment thread — keep it brief, warm, and generic. Never share prices, personal details, or specific commitments publicly, even if the catalog above has the answer; if the comment needs specifics, invite them to DM instead."
    : `This is a private DM auto-reply sent with NO human review before sending. If the question is about a specific product's price/availability AND it's genuinely in the catalog above, answer it directly and confidently — that's a normal, safe question to answer instantly. For anything else (a complaint, a custom request, a product genuinely not in the catalog, or anything you're not confident about), reply with acknowledgement + "our team will get back to you shortly" rather than guessing or promising something specific. Never invent a price or availability for a product not actually listed above.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        // Haiku — a safe, single, auto-sent reply is a tightly
        // constrained task (explicitly avoids prices/promises/
        // complaint resolution per the prompt below), and this fires
        // on every incoming DM/comment when the toggle is on.
        model: getModel("fast"),
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are auto-replying as "${dealershipName}", a ${businessCategory} business in India, to a ${channel === "dm" ? "private DM" : "public comment"}.
${brandContext}${catalogContext}${knowledgeContext}${insightsContext}${personaContext}
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
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  recentPostsContext?: string | null,
  groundingContext?: string
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
      model: getModel("standard"),
      max_tokens: isTrends ? 3000 : 1600,
      messages: [{
        role: "user",
        content: `You are a social media manager for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}
${recentPostsContext ? `\nActually posted recently (last 10, real — don't repeat these angles/hooks, find fresh ones):\n${recentPostsContext}` : ""}
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
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "social_task", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
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
