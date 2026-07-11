import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Minimal scope — only permission to SEND email as this user, nothing
// else (can't read their inbox, contacts, etc).
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.redirect(new URL("/dashboard", request.url));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/gmail/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId ?? "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline"); // needed to get a refresh_token
  authUrl.searchParams.set("prompt", "consent"); // forces refresh_token on every connect, not just the first
  authUrl.searchParams.set("state", dealershipId);

  return NextResponse.redirect(authUrl.toString());
}
