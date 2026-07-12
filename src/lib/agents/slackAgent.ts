// ------------------------------------------------------------------
// Slack Agent — free, self-serve, no approval process
// ------------------------------------------------------------------
// The dealer creates their own Slack Incoming Webhook (Slack's own
// free self-serve flow at their workspace's App settings) and pastes
// the URL in. No OAuth app registration or approval needed on
// Hawlai's side at all.
// ------------------------------------------------------------------

export async function sendSlackNotification(webhookUrl: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: body || `Slack returned ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
