import Link from "next/link";
import { MessageCircle, ArrowRight } from "lucide-react";

export default function WhatsAppPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">WhatsApp</h1>
          <p className="text-sm text-slate-500">Free click-to-send — no paid WhatsApp Business API needed</p>
        </div>
      </div>

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">How WhatsApp works in Hawlai</p>
        <p className="text-xs text-slate-400">
          WhatsApp Business API requires a paid account, so instead every drafted message gets a "Send via WhatsApp" button — it opens WhatsApp with the message pre-filled, you just tap Send. Genuinely free, works with your existing WhatsApp.
        </p>
      </div>

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">Where to find it</p>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>• Call Queue — overnight AI-drafted follow-ups</li>
          <li>• Any lead's page — generate a WhatsApp message on demand</li>
          <li>• Retention — service reminders for past customers</li>
        </ul>
        <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:underline mt-2">
          Go to Leads to send a WhatsApp message <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
