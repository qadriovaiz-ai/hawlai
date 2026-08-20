// ------------------------------------------------------------------
// Content Agent — Phase 1 expansion
// ------------------------------------------------------------------
// So far Content Agent only wrote ad copy (inside adlaunch/route.ts).
// This adds a second capability: personalized WhatsApp / email
// follow-up messages for a specific lead, using the same Brand
// Profile so tone stays consistent across every piece of copy the
// dealership sends out.
//
// This does NOT send anything — no WhatsApp Business API or email
// service is connected yet. It generates text the sales team can
// review and copy-paste. Actual sending is a separate, later piece
// (the Email & WhatsApp Agent).
// ------------------------------------------------------------------

interface LeadInfo {
  name: string;
  vehicle?: string | null;
  budget?: number | null;
  lead_temperature?: string | null;
  status?: string | null;
  // P3 — real signals that already existed on the leads row but were
  // never actually read by this generator; personalization before
  // this was brand-voice + {name}/{vehicle}/{temperature} substitution
  // only, identical for every lead regardless of what was actually said.
  qualification_reason?: string | null;
}

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export interface GeneratedMessage {
  subject?: string;
  message: string;
}

import { logClaudeUsage } from "../usage/logUsage";
import { getModel } from "../models";

export async function generateFollowUpMessage(
  lead: LeadInfo,
  brandProfile: BrandProfile | null,
  channel: "whatsapp" | "email",
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string },
  // P3 — this lead's own business_memory history (getLeadMemory,
  // P1 4a) — real cross-interaction memory, not just this one row's
  // flat fields. Was already built and wired into live calls; this is
  // the first async/messaging generator to use it too.
  pastInsights?: string[]
): Promise<GeneratedMessage> {
  const brandContext = brandProfile
    ? `Brand tone to match: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to weave in if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";

  const channelInstructions =
    channel === "whatsapp"
      ? `Write a short WhatsApp message (2-4 sentences, casual, can use 1 emoji max, no formal greeting like "Dear"). Return JSON only: {"message":"the whatsapp text"}`
      : `Write a short professional email (greeting, 2-3 short paragraphs, sign-off). Return JSON only: {"subject":"email subject line","message":"the full email body"}`;

  const leadContext = `Lead name: ${lead.name}. ${lead.vehicle ? `Interested in: ${lead.vehicle}.` : ""} ${lead.budget ? `Budget: ₹${lead.budget}.` : ""} Lead temperature: ${lead.lead_temperature ?? "unknown"}. Current stage: ${lead.status ?? "new"}.${lead.qualification_reason ? ` What we know from the last real conversation: ${lead.qualification_reason}` : ""}${pastInsights && pastInsights.length > 0 ? `\nWhat's happened with this lead before, from past interactions (reference this naturally, don't repeat something they already said no to):\n${pastInsights.map((i) => `- ${i}`).join("\n")}` : ""}`;

  const fallback: GeneratedMessage =
    channel === "whatsapp"
      ? { message: `Hi ${lead.name}, thanks for your interest${lead.vehicle ? ` in the ${lead.vehicle}` : ""}! Would you like to book a free test drive this week?` }
      : {
          subject: `Following up on your enquiry${lead.vehicle ? ` — ${lead.vehicle}` : ""}`,
          message: `Hi ${lead.name},\n\nThank you for your interest${lead.vehicle ? ` in the ${lead.vehicle}` : ""}. We'd love to help you find the right fit — would you be available for a quick call or a test drive this week?\n\nLooking forward to hearing from you.`,
        };

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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `You are writing a follow-up ${channel} message for an Indian ${businessCategory} business's sales team to send to a lead.
${leadContext}
${brandContext}
${channelInstructions}
The goal: get them to book an appointment/demo/visit or reply. No markdown, no explanation, JSON only.`,
          },
        ],
      }),
    });

    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "follow_up_message", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return {
      subject: parsed.subject,
      message: parsed.message ?? fallback.message,
    };
  } catch (err: any) {
    console.error("[content-agent] generateFollowUpMessage error:", err.message);
    return fallback;
  }
}
