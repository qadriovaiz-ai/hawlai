// Post-call lead scoring — the authoritative score. The blind,
// pre-call heuristic in ai-engine.ts (vehicle age/budget) still runs
// the moment a lead comes in, purely so something reasonable shows up
// immediately (e.g. for a "hot lead" notification before anyone's
// talked to them) — but once a real conversation has happened, what
// was actually said is a far better signal than guessed demographics,
// so this overwrites that guess.

export interface CallScoreResult {
  score: number; // 0-100
  temperature: "hot" | "warm" | "cold";
  reason: string;
}

const FALLBACK: CallScoreResult = {
  score: 30,
  temperature: "cold",
  reason: "Couldn't analyze the call transcript automatically — review manually.",
};

export async function scoreLeadFromCall(transcript: string, leadName: string): Promise<CallScoreResult> {
  if (!transcript || transcript.trim().length < 10) {
    return { score: 10, temperature: "cold", reason: "Call had no meaningful conversation (no answer, hang-up, or voicemail)." };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `You just read the transcript of a sales follow-up phone call with a lead named ${leadName}. Score how promising this lead is based ONLY on what was actually said in the call — their interest level, urgency, objections, budget signals, and whether they agreed to a next step.

Respond with ONLY a JSON object, no markdown, no preamble:
{"score": <0-100 integer>, "temperature": "<hot|warm|cold>", "reason": "<one sentence, specific to what was said in this call>"}

Transcript:
${transcript.slice(0, 8000)}`,
        }],
      }),
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.max(0, Math.min(100, Number(parsed.score)));
    const temperature = ["hot", "warm", "cold"].includes(parsed.temperature) ? parsed.temperature : "cold";
    return { score, temperature, reason: String(parsed.reason ?? FALLBACK.reason) };
  } catch {
    return FALLBACK;
  }
}
