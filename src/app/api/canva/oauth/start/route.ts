import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl, generateCodeVerifier, codeChallengeFor, isCanvaConfigured } from "@/lib/canva/client";
import { isTokenCryptoConfigured } from "@/lib/canva/tokenCrypto";
import crypto from "crypto";

// Begins the Canva OAuth handshake.
//
// The PKCE verifier and CSRF state are held in httpOnly cookies rather
// than a database table: they live for one redirect round-trip, belong
// to one browser, and a table would mean rows to expire and clean up
// for no benefit.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Checked before redirecting anywhere. Sending someone to Canva,
  // having them approve access, and only then failing on our own
  // missing key would waste their time and look like Canva broke.
  if (!isCanvaConfigured()) {
    return NextResponse.json({ error: "Canva isn't set up on this server yet." }, { status: 503 });
  }
  if (!isTokenCryptoConfigured()) {
    return NextResponse.json(
      { error: "Canva can't be connected until token encryption is configured on this server." },
      { status: 503 }
    );
  }

  const verifier = generateCodeVerifier();
  const state = crypto.randomBytes(16).toString("base64url");

  const jar = await cookies();
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Long enough to read a consent screen and decide, short enough
    // that an abandoned attempt doesn't linger.
    maxAge: 10 * 60,
  };
  jar.set("canva_code_verifier", verifier, common);
  jar.set("canva_oauth_state", state, common);

  return NextResponse.json({ url: buildAuthorizeUrl(state, codeChallengeFor(verifier)) });
}
