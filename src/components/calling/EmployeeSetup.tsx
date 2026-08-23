"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ArrowLeft, Plus, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  CALLING_JOBS, getJob, resolveJobTools, TOOL_LABELS,
  TONE_OPTIONS, LANGUAGE_OPTIONS,
} from "@/lib/onboarding/callingJobs";

// UX Transformation, piece 5b — hiring an employee, not configuring
// a voice API.
//
// Six steps per the mandate: business → job → knowledge → behaviour →
// permissions → boundaries. "Business" is deliberately NOT re-asked
// here: the brand-voice onboarding already captured it and
// getBusinessContext already feeds it to every call. Re-collecting it
// would be exactly the duplicate the mandate warns against, so step 1
// confirms what Hawlai already knows and links out to edit it.
//
// The word "persona" appears nowhere in this UI. The owner picks a
// JOB; callingJobs.ts maps it to the existing persona internally.

type Step = "business" | "job" | "knowledge" | "behaviour" | "permissions" | "boundaries" | "done";

const STEP_ORDER: Step[] = ["business", "job", "knowledge", "behaviour", "permissions", "boundaries"];

const STEP_TITLES: Record<Step, { title: string; sub: string }> = {
  business: { title: "About your business", sub: "What your AI employee already knows." },
  job: { title: "What's the job?", sub: "Pick what you're hiring this employee to do." },
  knowledge: { title: "What should it know?", sub: "Facts it can state confidently on a call." },
  behaviour: { title: "How should it talk?", sub: "Language and tone your customers will hear." },
  permissions: { title: "What can it do?", sub: "Actions it's allowed to take during a call." },
  boundaries: { title: "What must it never do?", sub: "Hard limits, in your own words." },
  done: { title: "Ready", sub: "" },
};

interface BusinessInfo { name: string; category: string; knowledgeCount: number }

export default function EmployeeSetup({ business }: { business: BusinessInfo }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("business");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobKey, setJobKey] = useState<string | null>(null);
  const [tone, setTone] = useState("friendly");
  const [language, setLanguage] = useState("english");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [boundaries, setBoundaries] = useState<string[]>([]);
  const [boundaryDraft, setBoundaryDraft] = useState("");

  const job = jobKey ? getJob(jobKey) : undefined;
  const availableTools = job ? resolveJobTools(job) : [];

  // Pre-tick the job's suggested tools when a job is chosen, so the
  // owner adjusts a sensible default instead of starting from nothing.
  useEffect(() => {
    if (job) setAllowedTools(resolveJobTools(job));
  }, [jobKey]);

  const stepIndex = STEP_ORDER.indexOf(step);

  function next() {
    const i = STEP_ORDER.indexOf(step);
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]);
  }
  function back() {
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]);
  }

  function addBoundary() {
    const rule = boundaryDraft.trim();
    if (!rule) return;
    setBoundaries([...boundaries, rule]);
    setBoundaryDraft("");
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/calling/employee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobKey, tone, language, allowedTools, boundaries }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save");
      setStep("done");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (step === "done") {
    return (
      <div className="card p-6 text-center space-y-3">
        <div className="w-12 h-12 bg-green-500/15 rounded-2xl flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Your AI Calling Employee is set up</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          It knows your business, what its job is, and what it can and can&apos;t do. Hear it on a real call before it starts working through your leads.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button onClick={() => router.push("/dashboard/calling/test")}>Test it on a call</Button>
          <Button onClick={() => router.push("/dashboard/calling")} variant="secondary">Go to Calling</Button>
        </div>
      </div>
    );
  }

  const meta = STEP_TITLES[step];

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center gap-1.5">
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-brand-500" : "bg-slate-200"}`}
          />
        ))}
      </div>

      <div>
        <p className="text-[10.5px] text-slate-400 uppercase tracking-wide">
          Step {stepIndex + 1} of {STEP_ORDER.length}
        </p>
        <h2 className="text-lg font-bold text-slate-900 mt-0.5">{meta.title}</h2>
        <p className="text-sm text-slate-500">{meta.sub}</p>
      </div>

      {step === "business" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3 space-y-1">
            <p className="text-sm font-medium text-slate-800">{business.name}</p>
            <p className="text-xs text-slate-400">{business.category}</p>
            <p className="text-xs text-slate-400">
              {business.knowledgeCount > 0
                ? `${business.knowledgeCount} fact${business.knowledgeCount === 1 ? "" : "s"} it can use on calls`
                : "No business facts added yet"}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Your employee uses this on every call. You don&apos;t need to repeat it here — change it in{" "}
            <a href="/dashboard/settings/brand" className="text-brand-500 hover:underline">Brand</a> if it&apos;s wrong.
          </p>
        </div>
      )}

      {step === "job" && (
        <div className="space-y-2">
          {CALLING_JOBS.map((j) => (
            <button
              key={j.key}
              onClick={() => setJobKey(j.key)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                jobKey === j.key ? "border-brand-500/60 bg-brand-500/5" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className={`text-sm font-semibold ${jobKey === j.key ? "text-brand-600" : "text-slate-800"}`}>{j.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{j.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === "knowledge" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {business.knowledgeCount > 0
              ? `Your employee can already state ${business.knowledgeCount} fact${business.knowledgeCount === 1 ? "" : "s"} about your business — hours, pricing notes, policies, common questions.`
              : "Your employee has no business facts yet. Without them it will say “a team member will follow up” to most specific questions."}
          </p>
          <p className="text-xs text-slate-400">
            Anything not added here, it will honestly say it doesn&apos;t know rather than guess — which is what you want on a call with a real customer.
          </p>
          <a href="/dashboard/settings/knowledge-base" target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              {business.knowledgeCount > 0 ? "Add or edit facts" : "Add business facts"}
            </Button>
          </a>
        </div>
      )}

      {step === "behaviour" && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Language</p>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGE_OPTIONS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLanguage(l.key)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    language === l.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Tone</p>
            <div className="flex flex-wrap gap-1.5">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTone(t.key)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    tone === t.key ? "bg-brand-600 border-brand-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "permissions" && (
        <div className="space-y-2">
          {availableTools.length === 0 ? (
            <p className="text-sm text-slate-400">Pick a job first — the actions depend on what it&apos;s doing.</p>
          ) : (
            <>
              {availableTools.map((t) => {
                const meta = TOOL_LABELS[t];
                const on = allowedTools.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => setAllowedTools(on ? allowedTools.filter((x) => x !== t) : [...allowedTools, t])}
                    className={`w-full text-left rounded-lg border p-3 flex items-start gap-3 transition-colors ${
                      on ? "border-brand-500/60 bg-brand-500/5" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${on ? "bg-brand-600 border-brand-600" : "border-slate-300"}`}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{meta?.label ?? t}</p>
                      <p className="text-xs text-slate-400">{meta?.detail}</p>
                    </div>
                  </button>
                );
              })}
              <p className="text-[10.5px] text-slate-400 pt-1">
                Only actions that fit this job are shown. Anything involving money still needs your approval separately.
              </p>
            </>
          )}
        </div>
      )}

      {step === "boundaries" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={boundaryDraft}
              onChange={(e) => setBoundaryDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBoundary(); } }}
              placeholder="e.g. Never promise a discount that isn't already published"
              className="input text-sm flex-1"
            />
            <Button onClick={addBoundary} variant="secondary" size="sm" disabled={!boundaryDraft.trim()}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {boundaries.length > 0 && (
            <div className="space-y-1.5">
              {boundaries.map((b, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 flex-1">{b}</p>
                  <button onClick={() => setBoundaries(boundaries.filter((_, x) => x !== i))} className="text-slate-300 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Stated plainly rather than letting an owner believe a
              typed sentence is a technical control. The real hard
              guarantees are the permissions step above and approvals. */}
          <p className="text-[10.5px] text-slate-400 leading-relaxed">
            These are given to your employee as firm rules and it will refuse and offer a callback instead. They&apos;re instructions though, not a technical lock — for anything that truly must never happen, leave the matching permission switched off in the previous step, since it then can&apos;t be done at all.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={back}
          disabled={stepIndex === 0 || saving}
          className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back
        </button>

        {step === "boundaries" ? (
          <Button onClick={finish} loading={saving}>Save employee</Button>
        ) : (
          <Button onClick={next} disabled={step === "job" && !jobKey}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
