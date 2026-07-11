// ------------------------------------------------------------------
// Voiceover Agent — Phase 4 (ElevenLabs)
// ------------------------------------------------------------------
// Text-to-speech via ElevenLabs. Synchronous and fast (unlike video),
// so no job-tracking needed — just call and get audio bytes back.
// ------------------------------------------------------------------

// A solid default multilingual voice suitable for Hindi/Hinglish —
// dealers can't pick a custom voice yet (would need to list/preview
// ElevenLabs' voice library, a nice follow-up), this ships with one
// good default to start.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" — widely available default voice

export async function generateVoiceover(text: string, voiceId: string = DEFAULT_VOICE_ID): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  if (!text || text.trim().length < 1) throw new Error("No text to read");
  if (text.length > 2000) throw new Error("Text is too long (max 2000 characters)");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.trim(),
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    let message = `ElevenLabs returned ${res.status}`;
    try {
      const errData = await res.json();
      message = errData?.detail?.message ?? errData?.detail ?? message;
    } catch {
      // response wasn't JSON, keep the generic message
    }
    throw new Error(message);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
