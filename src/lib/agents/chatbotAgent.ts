// ------------------------------------------------------------------
// Chatbot Agent — Phase 8
// ------------------------------------------------------------------
// Answers visitor questions on a dealership's public landing page,
// using the dealership's own brand profile + page content as context.
// Purely informational/conversational — it does not capture or save
// leads itself (the page's existing lead form does that); it nudges
// interested visitors toward that form rather than trying to parse
// contact details out of free-form chat, which would be unreliable.
// ------------------------------------------------------------------

interface DealershipContext {
  dealershipName: string;
  city?: string | null;
  headline?: string | null;
  offerText?: string | null;
  toneOfVoice?: string | null;
  messagingPillars?: string[] | null;
}

export async function answerVisitorQuestion(
  context: DealershipContext,
  history: { role: "user" | "assistant"; content: string }[],
  message: string
): Promise<string> {
  const fallback = "Thanks for your question! Please leave your name and number in the form below and our team will get back to you shortly.";

  const contextBlock = `Dealership: ${context.dealershipName}${context.city ? `, ${context.city}` : ""}.
${context.headline ? `Tagline: ${context.headline}` : ""}
${context.offerText ? `Current offer: ${context.offerText}` : ""}
${context.toneOfVoice ? `Tone to use: ${context.toneOfVoice}` : "Tone: friendly and helpful"}
${context.messagingPillars?.length ? `Key points: ${context.messagingPillars.join("; ")}` : ""}`;

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
        system: `You are a helpful assistant on ${context.dealershipName}'s website, answering visitor questions about the dealership.
${contextBlock}

Rules: Keep answers short (2-4 sentences), warm, and honest. If you don't know something specific (exact pricing, exact stock), say so plainly and suggest they leave their number in the form below for a call back — don't make up specifics you don't have. Never claim to be human. Don't discuss anything unrelated to this dealership/cars.`,
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
    return text.trim() || fallback;
  } catch (err: any) {
    console.error("[chatbot-agent] answerVisitorQuestion error:", err.message);
    return fallback;
  }
}
