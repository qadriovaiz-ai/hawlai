// Email Marketing Agent — covers 7 of the 9 requested tasks as
// content generation: Welcome Emails, Abandoned Cart, Promotional,
// Newsletter, Sales Sequences, Follow-ups, Personalization tips.
// Segmentation is NOT here — it's a real feature that groups actual
// leads from the database (see api/email/segments), not AI-generated
// fake segments. Analytics is also not a generator — the Gmail
// integration only has send scope (gmail.send), no open/click
// tracking, so real analytics isn't available; the Email page shows
// honest guidance instead of fabricating numbers.

export interface EmailTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const EMAIL_TASKS: EmailTaskMeta[] = [
  { key: "welcome_email", label: "Welcome Email", instructions: "A welcome email for a new lead/customer: return {subject, previewText, body} — warm, sets expectations for what happens next, no hard sell." },
  { key: "abandoned_cart", label: "Abandoned Cart", instructions: "An abandoned-cart/inquiry follow-up email for someone who showed interest but didn't convert: return {subject, previewText, body} — gentle nudge, addresses likely hesitation, soft CTA to continue." },
  { key: "promotional", label: "Promotional Email", instructions: "A promotional email for an offer or product: return {subject, previewText, body} — clear offer, urgency where genuine, strong CTA." },
  { key: "newsletter", label: "Newsletter", instructions: "A newsletter email: return {subject, previewText, sections: [{heading, body}]} — 3 short sections (e.g. update, tip, spotlight), casual and value-first, not salesy." },
  { key: "sales_sequence", label: "Sales Sequence", instructions: "A 3-email sales sequence for nurturing a warm lead toward a decision: return {emails: [{step, subject, body}]} — each email should have a distinct angle (value, social proof, urgency) and escalate naturally." },
  { key: "follow_up", label: "Follow-up Email", instructions: "A follow-up email for a lead who went quiet after initial contact: return {subject, previewText, body} — low-pressure, easy to reply to, gives an easy out ('let me know if now isn't the right time')." },
  { key: "personalization", label: "Personalization Tips", instructions: "5 practical personalization tactics for making emails feel individually written rather than mass-blasted, specific to this business type: return {tips: [{tactic, howTo}]}." },
];

interface BrandProfile {
  tone_of_voice?: string | null;
}

export async function generateEmailContent(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  topic: string,
  brandProfile?: BrandProfile | null
): Promise<{ output: any; _fallback?: boolean }> {
  const meta = EMAIL_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: `${meta.label} draft for ${dealershipName}. Regenerate once the API is available for a tailored version.` },
    _fallback: true,
  };

  const brandContext = brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it warm, direct, and specific to the business.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are an email marketer writing for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}
Topic/context: "${topic || "general, use good judgement for this business type"}"

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above exactly. Write real, specific email copy — never generic filler like "check out our amazing products".`,
        }],
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
    return { output: JSON.parse(clean) };
  } catch (err: any) {
    console.error("[email-marketing-agent] error:", err.message);
    return fallback;
  }
}
