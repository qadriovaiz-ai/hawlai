"use client";

import { useState, useEffect } from "react";
import { Target, Loader2, Sparkles, IndianRupee, Calendar as CalIcon, Lightbulb } from "lucide-react";

const GOALS = ["More leads", "More sales", "Brand awareness", "Website traffic"];

export default function StrategyPage() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [strategy, setStrategy] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategy")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setStrategy(data);
          setBudget(String(data.monthly_budget ?? ""));
          setGoal(data.goal ?? GOALS[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setError(null);
    if (!budget || Number(budget) <= 0) return setError("Enter a monthly budget");
    setGenerating(true);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_budget: Number(budget), goal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setStrategy(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
  }

  const plan = strategy?.plan;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Target className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Marketing Strategy</h1>
          <p className="text-sm text-slate-500">Your monthly roadmap, generated from your brand and budget</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Monthly budget (₹)</label>
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-2.5">
              <IndianRupee className="w-4 h-4 text-slate-400 shrink-0" />
              <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder="30000" className="flex-1 text-sm focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Goal</label>
            <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500">
              {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={handleGenerate} disabled={generating} className="btn-primary text-sm">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {strategy ? "Regenerate Plan" : "Generate Plan"}
        </button>
      </div>

      {plan && (
        <div className="space-y-4">
          <div className="card p-5 bg-purple-50 border-purple-100">
            <p className="text-sm text-purple-900 leading-relaxed">{plan.overview}</p>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3">Budget Allocation</p>
            <div className="space-y-2">
              {plan.budget_allocation?.map((b: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-800">{b.channel}</span>
                    <span className="text-slate-500">{b.percent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${b.percent}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{b.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><CalIcon className="w-4 h-4 text-purple-500" /> This Month</p>
            <div className="space-y-3">
              {plan.monthly_themes?.map((w: any, i: number) => (
                <div key={i} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <span className="text-xs font-semibold text-purple-600 shrink-0 w-16">{w.week}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{w.focus}</p>
                    <p className="text-xs text-slate-500">{w.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Recommended Offers</p>
            <ul className="space-y-1.5">
              {plan.recommended_offers?.map((o: string, i: number) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><span className="text-purple-400 mt-0.5">•</span> {o}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
