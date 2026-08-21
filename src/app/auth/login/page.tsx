"use client";

import Image from "next/image";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // P3 9a — a second step, shown only when the account actually has a
  // verified TOTP factor. Accounts without 2FA see exactly the login
  // they saw before.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // P3 9c — SSO. Structurally complete but INACTIVE until Supabase SSO
  // is enabled on a paid plan and an identity provider is registered
  // for the domain; until then signInWithSSO returns a clear
  // "provider not found" error rather than silently failing.
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoDomain, setSsoDomain] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Password was right — but if this account has 2FA on, the session
    // isn't fully authenticated yet (aal1, not aal2). Check for a
    // verified factor and challenge it before letting them through.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === "verified");
    if (totp) {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challengeError) {
        setError(challengeError.message);
        setLoading(false);
        return;
      }
      setMfaFactorId(totp.id);
      setMfaChallengeId(challenge.id);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId || !mfaChallengeId) return;
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: mfaCode.trim(),
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSso(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithSSO({ domain: ssoDomain.trim() });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image src="/logo-full.png" alt="Hawlai — AI Marketing. Smarter Growth." width={220} height={220} className="mx-auto rounded-2xl" />
        </div>

        {/* Card */}
        <div className="bg-slate-100 rounded-2xl shadow-2xl p-8">
          {mfaChallengeId ? (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">Two-factor verification</h2>
              <p className="text-slate-500 text-sm mb-6">Enter the 6-digit code from your authenticator app.</p>

              <form onSubmit={handleVerifyMfa} className="space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  autoFocus
                  required
                  className="input text-center text-lg tracking-[0.4em]"
                />

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-700/50 rounded-lg text-sm text-red-400">{error}</div>
                )}

                <Button type="submit" disabled={loading || mfaCode.length < 6} loading={loading} className="w-full justify-center py-2.5">
                  {loading ? "Verifying..." : "Verify"}
                </Button>
              </form>
            </>
          ) : ssoMode ? (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">Single sign-on</h2>
              <p className="text-slate-500 text-sm mb-6">Sign in with your organization's identity provider.</p>

              <form onSubmit={handleSso} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company domain</label>
                  <input
                    type="text"
                    value={ssoDomain}
                    onChange={(e) => setSsoDomain(e.target.value)}
                    placeholder="yourcompany.com"
                    required
                    className="input"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-700/50 rounded-lg text-sm text-red-400">{error}</div>
                )}

                <Button type="submit" disabled={loading || !ssoDomain.trim()} loading={loading} className="w-full justify-center py-2.5">
                  {loading ? "Redirecting..." : "Continue with SSO"}
                </Button>
              </form>

              <button onClick={() => { setSsoMode(false); setError(""); }} className="w-full text-center text-sm text-slate-500 mt-4 hover:text-slate-700">
                Back to email sign-in
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">Welcome back</h2>
              <p className="text-slate-500 text-sm mb-6">Sign in to your account</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@yourbusiness.com"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="input"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-700/50 rounded-lg text-sm text-red-400">
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={loading} loading={loading} className="w-full justify-center py-2.5">
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <button onClick={() => { setSsoMode(true); setError(""); }} className="w-full text-center text-sm text-slate-500 mt-4 hover:text-slate-700">
                Sign in with SSO instead
              </button>

              <p className="text-center text-sm text-slate-500 mt-6">
                Don&apos;t have an account?{" "}
                <Link href="/auth/signup" className="text-brand-400 font-medium hover:underline">
                  Create one
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
        AI marketing that actually does the work
        </p>
      </div>
    </div>
  );
}
