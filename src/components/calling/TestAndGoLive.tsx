"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneCall, Check, AlertCircle, Trash2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/Button";

// UX Transformation, piece 5c — the mandatory test experience and the
// go-live moment.
//
// The activation event for calling mode is "first successful test
// call" — onboarding isn't complete because forms were filled, it's
// complete when the owner hears their AI employee actually work.

interface TestResult {
  call: { status: string; summary: string | null; durationSeconds: number; hasTranscript: boolean };
  learned: { temperature: string; score: number; reason: string | null; status: string } | null;
  appointmentsBooked: number;
}

const POLL_INTERVAL_MS = 5000;
// Vapi calls end and the webhook writes back well within this; past
// it, something is wrong and saying so is better than spinning.
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default function TestAndGoLive({ initialLive }: { initialLive: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const [live, setLive] = useState(initialLive);
  const [goingLive, setGoingLive] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const startedAt = useRef<number>(0);

  // Poll for the result. The Vapi webhook writes the transcript,
  // summary and score when the call ends — the same records a real
  // call produces — so this waits on the real pipeline, not a mock.
  useEffect(() => {
    if (!callId || result) return;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        setCalling(false);
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(`/api/calling/test-call?callId=${callId}`);
        const d = await res.json();
        if (!res.ok) return;
        // A call only counts as finished once the webhook has written
        // a summary — status alone flips before the analysis lands.
        if (d.call?.summary || d.call?.hasTranscript) {
          setResult(d);
          setCalling(false);
          clearInterval(timer);
        }
      } catch {
        // Transient — keep polling until the timeout decides.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [callId, result]);

  async function startTest() {
    setCalling(true);
    setError(null);
    setResult(null);
    setTimedOut(false);
    startedAt.current = Date.now();
    try {
      const res = await fetch("/api/calling/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't start the call");
      setCallId(d.callId);
    } catch (err: any) {
      setError(err.message);
      setCalling(false);
    }
  }

  async function goLive() {
    setGoingLive(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/auto-call", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoCallNewLeads: !live }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't update");
      setLive(!live);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGoingLive(false);
    }
  }

  async function cleanUp() {
    setCleaning(true);
    try {
      await fetch("/api/calling/test-call", { method: "DELETE" });
      setResult(null);
      setCallId(null);
      router.refresh();
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ---- Test ---- */}
      <div className="card p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Test your AI employee</p>
          <p className="text-xs text-slate-400 mt-0.5">
            It will call you exactly the way it calls a real customer — same script, same knowledge, same limits.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            disabled={calling}
            className="input text-sm flex-1"
          />
          <Button onClick={startTest} loading={calling} disabled={!phone.trim() || calling}>
            {!calling && <PhoneCall className="w-3.5 h-3.5" />} Call my phone
          </Button>
        </div>

        {calling && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Calling you now — pick up, have a normal conversation, then hang up.
          </p>
        )}

        {timedOut && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              The call didn&apos;t report back in time. It may still have connected — check Call history. If nothing is there, calling isn&apos;t fully set up yet.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-500/5 border border-red-300/50 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ---- Result ---- */}
      {result && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-500/15 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700">How it went</p>
          </div>

          {result.call.summary && (
            <div>
              <p className="text-[10.5px] font-medium text-slate-400 uppercase tracking-wide mb-1">What happened</p>
              <p className="text-sm text-slate-600">{result.call.summary}</p>
            </div>
          )}

          {result.learned && (
            <div>
              <p className="text-[10.5px] font-medium text-slate-400 uppercase tracking-wide mb-1">What it worked out</p>
              <p className="text-sm text-slate-600">
                Rated <span className="font-medium">{result.learned.temperature}</span>
                {typeof result.learned.score === "number" && ` (${result.learned.score}/100)`}
                {result.learned.reason ? ` — ${result.learned.reason}` : ""}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{Math.round(result.call.durationSeconds)}s call</span>
            <span>·</span>
            <span>{result.appointmentsBooked} appointment{result.appointmentsBooked === 1 ? "" : "s"} booked</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => router.push("/dashboard/calling/setup")} variant="secondary" size="sm">
              Change something
            </Button>
            <Button onClick={cleanUp} loading={cleaning} variant="secondary" size="sm">
              {!cleaning && <Trash2 className="w-3.5 h-3.5" />} Remove test record
            </Button>
          </div>
          <p className="text-[10.5px] text-slate-400">
            The test created a lead named after what you entered so it could run through the real pipeline. Removing it deletes that lead and its call history.
          </p>
        </div>
      )}

      {/* ---- Go live ---- */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Rocket className="w-4 h-4 text-slate-400" /> {live ? "Your AI employee is live" : "Go live"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {live
                ? "It calls every new lead automatically as they come in."
                : "Turn this on and it starts calling new leads automatically as they arrive."}
            </p>
          </div>
          <Button onClick={goLive} loading={goingLive} variant={live ? "secondary" : "primary"}>
            {live ? "Pause calling" : "Go live"}
          </Button>
        </div>

        {!live && (
          <ul className="text-xs text-slate-500 space-y-1 pt-1 border-t border-slate-100">
            <li>· Only new leads are called — nothing in your existing list is contacted.</li>
            <li>· Anyone marked do-not-contact is never called.</li>
            <li>· Calls use your included minutes; anything beyond is charged at cost plus your plan&apos;s per-minute rate.</li>
            <li>· You can pause this at any time.</li>
          </ul>
        )}
      </div>
    </div>
  );
}
