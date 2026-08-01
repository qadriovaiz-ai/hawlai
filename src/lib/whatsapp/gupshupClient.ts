// Gupshup WhatsApp send-message client. Only session messages are
// used here (replying within the 24-hour window after the person has
// messaged first) — this app never needs to message someone who
// hasn't messaged Hawlai's WhatsApp number first, so no template
// message approval is required anywhere in this flow.

const GUPSHUP_API_URL = "https://api.gupshup.io/sm/api/v1/msg";

function getConfig() {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const source = process.env.GUPSHUP_SOURCE_NUMBER; // Hawlai's own WhatsApp Business number
  if (!apiKey || !source) throw new Error("WhatsApp isn't set up yet — GUPSHUP_API_KEY and GUPSHUP_SOURCE_NUMBER aren't configured.");
  return { apiKey, source };
}

export async function sendWhatsAppText(destination: string, text: string) {
  const { apiKey, source } = getConfig();
  const res = await fetch(GUPSHUP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: apiKey },
    body: new URLSearchParams({
      channel: "whatsapp",
      source,
      destination,
      message: JSON.stringify({ type: "text", text }),
      "src.name": "Hawlai",
    }),
  });
  if (!res.ok) throw new Error(`Gupshup send failed (${res.status})`);
  return res.json();
}

export async function sendWhatsAppImage(destination: string, imageUrl: string, caption?: string) {
  const { apiKey, source } = getConfig();
  const res = await fetch(GUPSHUP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: apiKey },
    body: new URLSearchParams({
      channel: "whatsapp",
      source,
      destination,
      message: JSON.stringify({ type: "image", originalUrl: imageUrl, previewUrl: imageUrl, caption: caption ?? "" }),
      "src.name": "Hawlai",
    }),
  });
  if (!res.ok) throw new Error(`Gupshup send failed (${res.status})`);
  return res.json();
}

// Normalizes numbers to Gupshup's expected format — digits only, no
// +, no leading 00. WhatsApp payloads and phone-number entry forms
// are inconsistent about this, so every call site funnels through
// here rather than each doing its own ad-hoc cleanup.
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^00/, "");
}
