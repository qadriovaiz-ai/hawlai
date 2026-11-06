"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

// WHAT HAWLAI IS ALLOWED TO DO ON ITS OWN — S7/P6.
//
// A permission the owner cannot see is a permission he cannot withdraw.
// This card is the window: what each action's level is, why it is not
// higher, how many times it has acted alone today against the cap, and
// what the second judge said about what it published.
//
// EVERY NUMBER COMES FROM A ROW. /api/autonomy counts
// `publish_actions`, `claim_checks` and `action_levels`; nothing here
// estimates, averages or forecasts. Same rule the daily email follows.
//
// AND "NOT CHECKED YET" IS ITS OWN WORD, never folded into a clean
// count. The monitor runs the morning after something is published, so
// today's work has no verdict — and showing that as nothing-wrong would
// be the one confusion S7/P2 exists to prevent, on a screen instead of
// in a table.

type Row = {
  actionKey: string;
  label: string;
  level: "L0" | "L1" | "L2";
  why: string | null;
  asked: boolean;
  actedToday: number;
  capPerDay: number;
  published: { checked: number; notCheckedYet: number; failed: number };
};

export default function AutonomyLevelsCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/autonomy")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? "Could not read this.");
        setRows(body.rows ?? []);
        setRemaining(typeof body.remainingToday === "number" ? body.remainingToday : null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-300 rounded-2xl p-5">
        <h2 className="text-base font-semibold text-slate-900">What Hawlai does on its own</h2>
        {/* SAID, NOT HIDDEN. A card that renders nothing on an error
            reads as "there is nothing to see here", which about
            permissions is the wrong thing to imply. */}
        <p className="text-sm text-amber-600 mt-2">I could not read this just now: {error}</p>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="bg-slate-900 border border-slate-300 rounded-2xl p-5 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading what Hawlai is allowed to do…
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-300 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">What Hawlai does on its own</h2>
          <p className="text-sm text-slate-500 mt-1">
            Nothing here spends money, and nothing here can be done without a way to undo it. Hawlai asks you first unless
            you have said otherwise — and it goes back to asking by itself the moment something it published does not match
            your records.
          </p>
        </div>
        {remaining !== null && rows.some((r) => r.level === "L2") ? (
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold text-slate-900 tabular-nums">{remaining}</div>
            <div className="text-xs text-slate-500">left today</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const onItsOwn = row.level === "L2";
          return (
            <div key={row.actionKey} className="border border-slate-300 rounded-xl p-4">
              <div className="flex items-start gap-3">
                {onItsOwn ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{row.label}</span>
                    {/* NEVER "L2". He did not choose a letter. */}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        onItsOwn ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {onItsOwn ? "Runs on its own" : "Asks you first"}
                    </span>
                    {row.asked ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        Waiting for your answer
                      </span>
                    ) : null}
                  </div>

                  {row.why ? <p className="text-sm text-slate-500 mt-1.5">{row.why}</p> : null}

                  {onItsOwn ? (
                    <p className="text-sm text-slate-500 mt-1.5 tabular-nums">
                      Done {row.actedToday} of {row.capPerDay} today without asking.
                    </p>
                  ) : null}

                  {/* WHAT THE SECOND JUDGE SAID. Three numbers, and the
                      middle one is not a kind of clean. */}
                  {row.published.checked + row.published.notCheckedYet + row.published.failed > 0 ? (
                    <p className="text-sm text-slate-500 mt-1.5 tabular-nums">
                      Of what this has published: {row.published.checked} checked and nothing wrong found,{" "}
                      {row.published.notCheckedYet} not checked yet
                      {row.published.failed > 0 ? (
                        <span className="text-amber-600">, {row.published.failed} that did not match your records</span>
                      ) : null}
                      .
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
