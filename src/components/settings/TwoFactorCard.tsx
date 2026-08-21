"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

// P3 9a — TOTP two-factor, built on Supabase Auth's own MFA (no
// custom crypto, no new tables — Supabase manages the factors). Real
// value here because one account controls real ad spend.
export default function TwoFactorCard() {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    setEnrolled(!!verified);
    setFactorId(verified?.id ?? null);
  }
  useEffect(() => { refresh(); }, []);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // Clean up any half-finished enrollment first — an unverified
      // factor left over from an abandoned attempt otherwise blocks a
      // new one with a confusing "factor already exists" error.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw new Error(error.message);
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw new Error(challengeError.message);
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw new Error(verifyError.message);
      setQrSvg(null);
      setSecret(null);
      setCode("");
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (enrolled === null) {
    return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-brand-500/20 rounded-lg flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-brand-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Two-factor authentication</p>
          <p className="text-xs text-slate-400">A code from your phone, on top of your password</p>
        </div>
      </div>

      {enrolled ? (
        <>
          <p className="flex items-center gap-1.5 text-xs text-green-500"><ShieldCheck className="w-3.5 h-3.5" /> Enabled</p>
          <Button onClick={disable} loading={busy} variant="secondary" size="sm" className="text-red-400 border-red-700/50 hover:bg-red-500/10">
            {!busy && <X className="w-3.5 h-3.5" />} Turn off
          </Button>
        </>
      ) : qrSvg ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Scan this with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code it shows.</p>
          <div className="bg-white rounded-lg p-3 w-fit" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          {secret && (
            <p className="text-[10.5px] text-slate-400 break-all">
              Can&apos;t scan? Enter this key manually: <span className="font-mono text-slate-600">{secret}</span>
            </p>
          )}
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="input text-center tracking-[0.3em]"
          />
          <div className="flex gap-2">
            <Button onClick={confirmEnroll} loading={busy} disabled={code.length < 6} size="sm" className="flex-1 justify-center">
              Confirm
            </Button>
            <Button onClick={() => { setQrSvg(null); setSecret(null); setCode(""); }} variant="secondary" size="sm">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={startEnroll} loading={busy} size="sm">Turn on 2FA</Button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
