"use client";

import Image from "next/image";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { ensureBusinessForOwner } from "@/lib/onboarding/createBusiness";
import {
  RESEND_COOLDOWN_SECONDS,
  cleanOtpInput,
  isAlreadyRegistered,
  isCompleteOtp,
  otpFailureMessage,
} from "@/lib/onboarding/otp";

// SIGNUP, IN TWO SCREENS — Q2.
//
// Three fields, then a six-digit code from the email. Email and not
// SMS: the founder's call, because SMS costs money per message and
// email does not.
//
// THE ORDER OF THE WRITES IS THE WHOLE CHANGE. This page used to create
// the dealership immediately after `signUp`, using the session that
// call returned. With verification on, `signUp` returns a user and NO
// session — `auth.uid()` is null, the RLS policy refuses the row, and
// the new customer gets a policy error on the one screen he cannot get
// past. So the record is created after `verifyOtp`, which is the call
// that hands back a session, and `ensureBusinessForOwner` makes that
// idempotent because a screen in the middle gives a refresh more time
// to happen.
//
// A REFRESH ON THE CODE SCREEN IS NOT A DEAD END. Signing up again with
// the same address returns "User already registered", which reads as
// "go and log in" — except an unconfirmed account cannot log in. That
// is a trap built out of two correct error messages, so it is
// recognised and turned into a resend.

type Stage = "form" | "code" | "done";

export default function SignupPage() {
  const router = useRouter();
  // THREE FIELDS. The business name is collected by onboarding step 3,
  // which shows the owner what the analysis worked out and lets him
  // correct it — asking for it twice made the first answer the one
  // nobody checked. The city is not asked at all: plenty of businesses
  // are not in one place, and `dealerships.city` is nullable, so
  // nothing stands in for it.
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [stage, setStage] = useState<Stage>("form");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  // The resend cooldown, ticking down. Supabase rate-limits resends per
  // project, so a second press a moment later costs the owner his code
  // rather than getting him a new one.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (stage === "code") codeInput.current?.focus();
  }, [stage]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function toCodeScreen() {
    setStage("code");
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const supabase = createClient();
    const email = form.email.trim();

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: { data: { full_name: form.fullName.trim() } },
    });

    if (signupError) {
      // Started before and came back: resend rather than send them to a
      // login they cannot complete.
      if (isAlreadyRegistered(signupError.message)) {
        const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
        if (resendError) {
          setError(otpFailureMessage(resendError.message));
          setLoading(false);
          return;
        }
        setNotice("You had already started — I have sent a fresh code.");
        toCodeScreen();
        setLoading(false);
        return;
      }
      setError(signupError.message);
      setLoading(false);
      return;
    }

    // NOTHING IS WRITTEN YET. There is no session until the code is
    // verified, so there is nothing this page could write even if it
    // wanted to.
    toCodeScreen();
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isCompleteOtp(code)) return;
    setLoading(true);
    setError("");
    setNotice("");

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: form.email.trim(),
      token: cleanOtpInput(code),
      type: "signup",
    });

    if (verifyError || !data.user) {
      setError(otpFailureMessage(verifyError?.message));
      setLoading(false);
      return;
    }

    // THE SESSION EXISTS NOW, so the business record can be created
    // under the owner's own RLS policy — and only now.
    const result = await ensureBusinessForOwner(supabase, {
      id: data.user.id,
      fullName: form.fullName.trim(),
    });
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setStage("done");
    setTimeout(() => router.push("/dashboard"), 1500);
    setLoading(false);
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: form.email.trim() });
    if (resendError) setError(otpFailureMessage(resendError.message));
    else setNotice("Sent. It can take a minute to arrive.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setLoading(false);
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-full.png" alt="Hawlai — AI Marketing. Smarter Growth." width={220} height={220} className="mx-auto rounded-2xl" />
        </div>
        <div className="bg-slate-100 rounded-2xl shadow-2xl p-8">{children}</div>
      </div>
    </div>
  );

  if (stage === "done") {
    return shell(
      <div className="text-center">
        <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✅</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Email confirmed</h2>
        <p className="text-slate-500 text-sm">Setting up your business...</p>
      </div>
    );
  }

  if (stage === "code") {
    return shell(
      <>
        <h2 className="text-xl font-semibold text-slate-900 mb-1">Check your email</h2>
        {/* NO DIGIT COUNT. Supabase's OTP length is a project setting
            (6-10) and the client cannot read it, so a number here would
            be a guess shown to the owner as a fact — which is how the
            box came to cut an 8-digit code down to 6 on 3 November. */}
        <p className="text-slate-500 text-sm mb-6">
          I sent a code to <span className="text-slate-800 font-medium">{form.email.trim()}</span>.
          Type the whole code.
        </p>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-slate-700 mb-1">
              Code
            </label>
            <input
              ref={codeInput}
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(cleanOtpInput(e.target.value))}
              placeholder="Enter the code"
              className="input text-center text-lg tracking-[0.3em] font-medium tabular-nums"
            />
          </div>

          {notice && (
            <div className="p-3 bg-brand-500/10 border border-brand-700/40 rounded-lg text-sm text-brand-400">{notice}</div>
          )}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-700/50 rounded-lg text-sm text-red-400">{error}</div>
          )}

          <Button
            type="submit"
            disabled={loading || !isCompleteOtp(code)}
            loading={loading}
            className="w-full justify-center py-2.5"
          >
            {loading ? "Confirming..." : "Confirm email"}
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || loading}
            className="text-slate-500 hover:text-slate-700 disabled:text-slate-400 disabled:hover:text-slate-400"
          >
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStage("form");
              setError("");
              setNotice("");
            }}
            className="text-slate-500 hover:text-slate-700"
          >
            Wrong email?
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      <h2 className="text-xl font-semibold text-slate-900 mb-1">Create account</h2>
      <p className="text-slate-500 text-sm mb-6">Takes a minute — we&apos;ll set your business up next</p>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
          <input name="fullName" type="text" value={form.fullName} onChange={handleChange} placeholder="Rajesh Sharma" required className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@yourbusiness.com" required className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Min 8 characters" required minLength={8} className="input" />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-700/50 rounded-lg text-sm text-red-400">{error}</div>
        )}

        <Button type="submit" disabled={loading} loading={loading} className="w-full justify-center py-2.5">
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-brand-400 font-medium hover:underline">Sign in</Link>
      </p>
    </>
  );
}
