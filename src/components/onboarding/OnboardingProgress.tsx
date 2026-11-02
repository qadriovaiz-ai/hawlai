"use client";

// THE PROGRESS BAR, and the number on it is never written by hand.
//
// The redesign puts "Step X of 5" at the top of every screen. The flow
// is not five steps — the founder kept the four brand-voice questions
// after the five design screens — so both numbers come from
// lib/onboarding/steps.ts, which owns the order. A literal total here
// would tell a new customer the setup was nearly over four screens
// before it was, and tests/onboardingSteps.test.ts fails if one
// appears.
//
// RESPONSIVE FROM THE START, on the founder's instruction of
// 2 November: the reference design is 390px wide and the dashboard it
// hands over to is desktop-first, so this is built for both rather
// than widened later.
//
// COLOURS COME FROM THE APP'S OWN TOKENS, not the mockup's. The
// mockup is a light theme (#FAFAF9); this app is dark — the slate
// scale in tailwind.config.ts is inverted, so slate-900 is near-white
// text and slate-200 is a border. Matching the mockup's hexes would
// have made onboarding look like a different product from the
// dashboard the owner lands on two seconds later. Structure, hierarchy
// and copy are the design's; the palette is the app's.

import { stepNumber, totalSteps, type StepAnswers, type StepKey } from "@/lib/onboarding/steps";

export default function OnboardingProgress({
  step,
  answers = {},
}: {
  step: StepKey;
  answers?: StepAnswers;
}) {
  const current = stepNumber(step, answers);
  const total = totalSteps(answers);

  // NOT A COUNTED STEP, SO NO BAR. "done" is the end screen, and a
  // skipped conditional step is not in the list either. Rendering
  // nothing is right: a bar reading "Step 0 of 9" is worse than no bar.
  if (current === null || total < 1) return null;

  const percent = Math.round((current / total) * 100);

  return (
    <div className="w-full">
      <div
        className="w-full h-1 rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${current} of ${total}`}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] sm:text-xs font-medium text-slate-500 tabular-nums">
        Step {current} of {total}
      </p>
    </div>
  );
}
