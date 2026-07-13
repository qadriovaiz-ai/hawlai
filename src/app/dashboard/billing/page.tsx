import { CreditCard } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Billing</h1>
          <p className="text-sm text-slate-500">Not live yet</p>
        </div>
      </div>
      <div className="card p-8 text-center space-y-2">
        <p className="text-sm text-slate-500">
          Hawlai doesn't charge for usage yet — you're not on a paid plan, and there's nothing to manage here right now.
        </p>
        <p className="text-xs text-slate-400">This page is a placeholder for when subscription billing is added.</p>
      </div>
    </div>
  );
}
