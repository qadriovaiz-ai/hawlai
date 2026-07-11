// ------------------------------------------------------------------
// Customer Retention Agent — Phase 3 basic version
// ------------------------------------------------------------------
// Targets leads already at the "converted" pipeline stage — i.e.
// actual customers — and generates re-engagement content (service
// reminders, referral asks, upsell nudges) rather than the "come buy
// a car" tone Content Agent uses for fresh leads. Reuses the same
// Brand Profile so tone stays consistent.
// ------------------------------------------------------------------

interface CustomerInfo {
  name: string;
  vehicle?: string | null;
}

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export async function generateRetentionMessage(
  customer: CustomerInfo,
  brandProfile: BrandProfile | null,
  angle: "service_reminder" | "referral" | "upsell",
  businessCategory: string = "car dealership"
): Promise<string> {
  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "Default to a warm, professional tone in Hinglish.";

  const angleInstructions: Record<string, string> = {
    service_reminder: "Remind them it may be time for a follow-up service, check-up, or renewal, if relevant to what they bought. Warm, not pushy.",
    referral: "Ask them to refer a friend or family member, mention any referral benefit if relevant to the brand pillars.",
    upsell: "Let them know about upgrade options, add-ons, or a trade-in/exchange offer, in a low-pressure way.",
  };

  const fallback = `Hi ${customer.name}, hope you're loving your${customer.vehicle ? ` ${customer.vehicle}` : " purchase"}! Just checking in — let us know if there's anything we can help with.`;

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
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Write a short WhatsApp-style message for an Indian ${businessCategory} business to send an EXISTING CUSTOMER (already made a purchase), not a new lead.
Customer: ${customer.name}${customer.vehicle ? `, bought/has: ${customer.vehicle}` : ""}.
Goal: ${angleInstructions[angle]}
${brandContext}
2-4 sentences, casual, max 1 emoji. Return JSON only: {"message":"the text"}`,
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
    return parsed.message ?? fallback;
  } catch (err: any) {
    console.error("[retention-agent] generateRetentionMessage error:", err.message);
    return fallback;
  }
}
