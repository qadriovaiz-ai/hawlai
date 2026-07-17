// Landing-page-specific CRO. The existing croAgent.ts covers general
// ad-campaign conversion signals (SEO page) — this covers the actual
// landing page: its real headline/offer copy and its REAL visitor
// numbers (views, chat opens, form submits) from page_events, so
// suggestions are grounded in what's actually happening on this
// specific page, not generic CRO advice.

export interface CroTaskMeta {
  key: string;
  label: string;
}

export const CRO_TASKS: CroTaskMeta[] = [
  { key: "landing_page", label: "Landing Page Optimization" },
  { key: "cta", label: "CTA Suggestions" },
  { key: "form", label: "Form Optimization" },
  { key: "ux", label: "UX Suggestions" },
];

interface PageContext {
  headline?: string | null;
  subheadline?: string | null;
  offerText?: string | null;
  views: number;
  chatOpens: number;
  formSubmits: number;
}

export async function generateCroSuggestions(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  page: PageContext
): Promise<{ output: any; _fallback?: boolean }> {
  const meta = CRO_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = { output: { text: "Couldn't generate suggestions right now — try again shortly." }, _fallback: true };

  const conversionRate = page.views > 0 ? ((page.formSubmits / page.views) * 100).toFixed(1) : null;
  const engagementRate = page.views > 0 ? (((page.chatOpens + page.formSubmits) / page.views) * 100).toFixed(1) : null;

  const pageContext = `Current landing page:
Headline: ${page.headline ?? "(not set)"}
Subheadline: ${page.subheadline ?? "(not set)"}
Offer text: ${page.offerText ?? "(not set)"}

Real visitor data (last 30 days): ${page.views} views, ${page.chatOpens} chat opens, ${page.formSubmits} leads captured.
${conversionRate ? `Conversion rate (view → lead): ${conversionRate}%` : "Not enough traffic yet to calculate a conversion rate."}
${engagementRate ? `Engagement rate (view → any interaction): ${engagementRate}%` : ""}`;

  const instructions: Record<string, string> = {
    landing_page: `Suggest 4-5 specific improvements to this landing page's headline, subheadline, and offer copy. Return {"suggestions": [{"issue": "...", "fix": "...", "reasoning": "..."}]}. If conversion data is available, reference it directly (e.g. "with only a X% conversion rate, the headline may not be..."); if not, base suggestions on copywriting best practice for this business type.`,
    cta: `Suggest 5 alternative call-to-action button/headline phrasings for this landing page, each with a different angle (urgency, curiosity, value, social proof, direct offer). Return {"ctaOptions": [{"text": "...", "angle": "..."}]}.`,
    form: `Review the lead capture form (name, phone, and one optional interest field) for this business type and suggest concrete improvements — field order, what to make optional vs required, microcopy, trust signals near the submit button. Return {"suggestions": [{"issue": "...", "fix": "..."}]}. Note: this form is the final conversion action on this page (there's no separate checkout flow), so form friction directly affects conversion rate.`,
    ux: `Suggest 5 UX improvements for this landing page relevant to a ${businessCategory} business — layout, trust signals, mobile experience, page speed considerations, visual hierarchy. Return {"suggestions": [{"issue": "...", "fix": "..."}]}.`,
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        messages: [{
          role: "user",
          content: `You are a conversion rate optimization specialist reviewing the real landing page for "${dealershipName}", a ${businessCategory} business in India.

${pageContext}

Task: ${meta.label}
${instructions[taskKey]}

Return JSON only, no markdown, no preamble. Be specific to this page's actual content and real numbers above — never generic filler advice.`,
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
    console.error("[cro-agent-v2] error:", err.message);
    return fallback;
  }
}
