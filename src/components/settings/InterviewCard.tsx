"use client";

// THE RESUMABLE INTERVIEW (I5 of docs/PLAN-AUTO-INTERVIEW.md).
//
// ONE QUESTION AT A TIME, AND LEAVING IS ALLOWED. That is the whole
// shape: every question's state is its own row (migration 222), so
// closing this card half-way through leaves a KNOWN half rather than a
// silent one. §2.1 of the plan is that a half-filled record looks
// complete to a generator — `knownText` reads what is present and
// cannot know what the owner never reached — so the count this card
// shows is the same count the facts layer states in every prompt.
//
// HERE RATHER THAN IN ONBOARDING, deliberately. These are the questions
// an owner answers well when he has seen what Hawlai does with an
// answer, and badly when a form demands them at minute one. Onboarding
// asks the four boring ones (I4); these twenty-one live where the data
// already lives.
//
// NOT ONE PROMPT IS WRITTEN HERE. Every word comes from the registry
// (lib/onboarding/interview.ts), served by /api/interview, where the
// rule-3 test holds that none of it names a trade.

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";

type Question = {
  key: string;
  prompt: string;
  help?: string;
  kind: string;
};

type Progress = { answered: number; total: number };

export default function InterviewCard() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState<Progress>({ answered: 0, total: 0 });
  const [answer, setAnswer] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thin, setThin] = useState(false);
  // WHY THIS QUESTION, when the product is asking because a line it
  // wrote was deleted for want of the answer (Tier 3 / I6). Null for an
  // ordinary question from the list: the card must not invent a reason
  // for a question that does not have one.
  const [because, setBecause] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/interview");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setQuestion(data.next ?? null);
      setProgress(data.progress ?? { answered: 0, total: 0 });
      setBecause(typeof data.because === "string" && data.because.trim() ? data.because : null);
    } catch {
      // Nothing is invented on a failed read: the card simply does not
      // offer a question.
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send(body: Record<string, unknown>) {
    if (!question) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: question.key, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save that just now.");
        setSaving(false);
        return;
      }
      // ASKED BACK ONCE. The follow-up names the owner's own word and
      // offers the way out, so nobody is stuck on a question.
      if (data.followUp) {
        setFollowUp(data.followUp);
        setSaving(false);
        return;
      }
      setFollowUp(null);
      setThin(data.weak === true);
      setAnswer("");
      setQuestion(data.next ?? null);
      if (data.progress) setProgress(data.progress);
      if (data.skipped) await load();
      setSaving(false);
    } catch {
      setError("Could not save that just now.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  // EVERYTHING ANSWERED IS SAID, not left blank. A card that vanishes
  // looks like a card that broke.
  if (!question) {
    return (
      <div className="card p-5">
        <p className="text-sm text-slate-600">
          {progress.total > 0 && progress.answered >= progress.total
            ? "You've answered everything Hawlai asks about how your business works."
            : "No questions waiting right now."}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">A question about your business</h2>
        </div>
        {/* THE COUNT, FROM THE SAME SOURCE THE PROMPT READS. A number
            typed here could disagree with what the generators are told. */}
        <span className="text-xs text-slate-500 tabular-nums">
          {progress.answered} of {progress.total} answered
        </span>
      </div>

      {/* THE REASON COMES FIRST, because it is what makes the question
          worth answering: "I had to cut a line twice because I do not
          have your price range" is a different request from "what is
          your price range". */}
      {because && <p className="text-sm text-amber-500 mb-2">{because}</p>}
      <p className="text-base font-medium text-slate-900">{question.prompt}</p>
      {question.help && <p className="text-sm text-slate-500 mt-1">{question.help}</p>}
      {followUp && <p className="text-sm text-amber-500 mt-3">{followUp}</p>}
      {thin && <p className="text-sm text-slate-500 mt-3">Saved as you wrote it, marked as thin.</p>}

      {question.kind === "yes_no" ? (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => send({ answer: "Yes" })}
            disabled={saving}
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Yes
          </button>
          <button
            onClick={() => send({ answer: "No" })}
            disabled={saving}
            className="rounded-lg bg-slate-200 text-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={question.kind === "long_text" ? 4 : 2}
          className="w-full mt-3 rounded-lg bg-slate-200 border border-slate-300 px-3 py-2 text-slate-900"
        />
      )}

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

      <div className="flex items-center gap-3 mt-4">
        {question.kind !== "yes_no" && (
          <button
            onClick={() => send({ answer })}
            disabled={saving || !answer.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        )}
        {/* SKIPPING IS RECORDED AS SKIPPED, not as an answer — so this
            question is not asked again and the facts layer never counts
            it as a fact that exists. */}
        <button
          onClick={() => send({ skip: true })}
          disabled={saving}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          I don't have an answer for this
        </button>
      </div>
    </div>
  );
}
