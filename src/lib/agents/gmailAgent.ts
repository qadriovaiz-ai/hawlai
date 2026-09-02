// ------------------------------------------------------------------
// Gmail Agent — real email sending via the dealer's own Gmail
// ------------------------------------------------------------------
// The dealer connects their own Gmail (OAuth, same pattern as
// Facebook Connect) — emails send FROM their real Gmail address,
// through Google's own servers. No paid email service, no new
// account beyond the free Google sign-in they already have.
// ------------------------------------------------------------------

import { tokenSelect, readToken, tokenWrite } from "@/lib/crypto/oauthSecrets";

async function getValidAccessToken(supabase: any, dealershipId: string): Promise<string> {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select(`${tokenSelect("gmail")}, gmail_token_expiry`)
    .eq("id", dealershipId)
    .single();

  const refreshToken = readToken(dealership, "gmail", "refresh_token");
  if (!refreshToken) {
    throw new Error("Gmail isn't connected yet. Go to Settings and connect your Gmail account first.");
  }

  const expiresAt = dealership.gmail_token_expiry ? new Date(dealership.gmail_token_expiry).getTime() : 0;
  const isExpired = Date.now() > expiresAt - 60_000; // refresh a minute early

  if (!isExpired) {
    const accessToken = readToken(dealership, "gmail", "access_token");
    // An unreadable stored token falls through to a refresh rather
    // than crashing the caller with a decryption error.
    if (accessToken) return accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? "Couldn't refresh Gmail access — try reconnecting in Settings.");

  await supabase
    .from("dealerships")
    // Encrypted on write, plaintext nulled in the same statement — a
    // refreshed token is never stored in the clear again, whenever the
    // backfill happens to run.
    .update({ ...tokenWrite("gmail", "access_token", data.access_token), gmail_token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString() })
    .eq("id", dealershipId);

  return data.access_token;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendEmail(
  supabase: any,
  dealershipId: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getValidAccessToken(supabase, dealershipId);
    const { data: dealership } = await supabase.from("dealerships").select("gmail_email, dealership_name").eq("id", dealershipId).single();

    const fromLine = dealership?.gmail_email
      ? `${dealership.dealership_name ?? "Hawlai"} <${dealership.gmail_email}>`
      : dealership?.dealership_name ?? "Hawlai";

    const mimeMessage = [
      `From: ${fromLine}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64UrlEncode(mimeMessage) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Gmail API error");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
