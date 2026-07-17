// ------------------------------------------------------------------
// AI Sales Agent — upgraded from the original FAQ-only chatbot.
// ------------------------------------------------------------------
// Covers all 7 requested tasks in one conversational turn:
//   1. Talks to website visitors (was already here)
//   2. Answers FAQs (was already here)
//   3. Handles objections (new — explicit prompt instruction)
//   4. Recommends based on what the visitor describes (new — reasons
//      over the dealership's offer/messaging context, doesn't invent
//      a product catalog that doesn't exist)
//   5. Qualifies leads (new — asks naturally for name + phone once
//      genuine interest is shown, doesn't force it upfront)
//   6. Books meetings (new — points to the REAL public booking page
//      already built in CRM Marketing, /book/[slug], rather than
//      faking a booking inside the chat)
//   7. Updates CRM (new — when the visitor volunteers name + phone,
//      the API layer creates/updates a real lead row; this agent only
//      decides WHEN that's appropriate, it never writes to the DB
//      itself)
//
// Also fixes a leftover bug: the previous version hardcoded "cars" in
// its system prompt ("Don't discuss anything unrelated to this
// dealership/cars") — a leftover from the AutoPilot AI era, same
// category as other car-specific text fixed earlier this session.
// Now uses the dealership's actual business_category.
// ------------------------------------------------------------------

interface DealershipContext {
  dealershipName: string;
  city?: string | null;
  businessCategory?: string | null;
  headline?: string | null;
  offerText?: string | null;
  toneOfVoice?: string | null;
  messagingPillars?: string[] | null;
  hasBookingLink: boolean;
}

export interface SalesAgentResult {
  reply: string;
  leadCapture: { name: string; phone: string; email?: string; interest?: string } | null;
  suggestBooking: boolean;
}

export async function runSalesAgentTurn(
  context: DealershipContext,
  history: { role: "user" | "assistant"; content: string }[],
  message: string
): Promise<SalesAgentResult> {
  const fallback: SalesAgentResult = {
    reply: "Thanks for your question! Please leave your name and number in the form below and our team will get back to you shortly.",
    leadCapture: null,
    suggestBooking: false,
  };

  const category = context.businessCategory || "business";
  const contextBlock = `Business: ${context.dealershipName}${context.city ? `, ${context.city}` : ""} (${category}).
${context.headline ? `Tagline: ${context.headline}` : ""}
${context.offerText ? `Current offer: ${context.offerText}` : ""}
${context.toneOfVoice ? `Tone to use: ${context.toneOfVoice}` : "Tone: friendly and helpful"}
${context.messagingPillars?.length ? `Key points: ${context.messagingPillars.join("; ")}` : ""}
${context.hasBookingLink ? "A booking page exists — you may suggest booking a meeting when the visitor seems ready." : "No booking page exists yet — don't offer to book a meeting."}`;

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
        max_tokens: 500,
        system: `You are an AI sales agent on ${context.dealershipName}'s website (a ${category} business). You chat with visitors like a helpful, knowledgeable salesperson would — not a generic FAQ bot.
${contextBlock}

Your job in this conversation, as relevant to what the visitor says:
- Answer questions honestly using the context above. If you don't know something specific (exact pricing, exact stock/availability), say so plainly and don't invent numbers.
- Recommend what fits their stated needs, based only on the context you have — don't invent products/features that weren't mentioned.
- Handle objections (price, trust, timing) empathetically and honestly — acknowledge the concern before responding to it, never dismiss it.
- Once the visitor shows genuine interest (not just browsing), naturally ask for their name and phone number so the team can follow up — don't demand this on the first message.
- If a booking page exists and the visitor seems ready to move forward (wants to visit, talk to someone, see it in person), suggest booking a meeting.
- Never claim to be a human. Keep replies short (2-4 sentences) and conversational, not corporate.
- Only discuss things relevant to this business — politely redirect anything unrelated.

Return JSON only, no markdown: {"reply": "your conversational reply", "leadCapture": {"name": "...", "phone": "...", "email": "... or omit", "interest": "one short phrase on what they're interested in"} or null if they haven't given both a name and phone number yet in this conversation, "suggestBooking": true or false}`,
        messages: [
          ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: message },
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
    return {
      reply: parsed.reply ?? fallback.reply,
      leadCapture: parsed.leadCapture && parsed.leadCapture.name && parsed.leadCapture.phone ? parsed.leadCapture : null,
      suggestBooking: !!parsed.suggestBooking && context.hasBookingLink,
    };
  } catch (err: any) {
    console.error("[ai-sales-agent] error:", err.message);
    return fallback;
  }
}
