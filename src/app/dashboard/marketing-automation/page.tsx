import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Workflow, ArrowRight, Users2, MessageCircle, Mail, MessageSquareOff, Clock } from "lucide-react";
import WorkflowBuilder from "@/components/automation/WorkflowBuilder";
import CalendarSyncCard from "@/components/automation/CalendarSyncCard";

export default async function MarketingAutomationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Workflow className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Marketing Automation</h1>
          <p className="text-sm text-slate-500">Build trigger-based, multi-step email sequences. Reminders, lead nurturing, and CRM sync already run elsewhere — linked below.</p>
        </div>
      </div>

      <WorkflowBuilder />
      <CalendarSyncCard />

      {/* Orchestration status — honest about what's automated vs manual vs not connected */}
      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">Email + WhatsApp + SMS Orchestration</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between bg-slate-100 rounded-lg p-2.5">
            <span className="text-sm text-slate-700 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-purple-400" /> Email</span>
            <span className="text-xs text-green-500 font-medium">Automated — Workflow Builder above</span>
          </div>
          <div className="flex items-center justify-between bg-slate-100 rounded-lg p-2.5">
            <span className="text-sm text-slate-700 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-green-500" /> WhatsApp</span>
            <span className="text-xs text-amber-500 font-medium">Tap-to-send only — no paid Business API</span>
          </div>
          <div className="flex items-center justify-between bg-slate-100 rounded-lg p-2.5">
            <span className="text-sm text-slate-700 flex items-center gap-1.5"><MessageSquareOff className="w-3.5 h-3.5 text-slate-400" /> SMS</span>
            <span className="text-xs text-slate-400 font-medium">Not connected — needs a paid gateway</span>
          </div>
        </div>
      </div>

      {/* Links to everything that already exists elsewhere */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/dashboard/crm-marketing" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Clock className="w-4 h-4 text-purple-400" /> Auto Reminders</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
        <Link href="/dashboard/whatsapp" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><MessageCircle className="w-4 h-4 text-purple-400" /> Lead Nurturing (WhatsApp)</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
        <Link href="/dashboard/email" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Mail className="w-4 h-4 text-purple-400" /> Lead Nurturing (Email)</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
        <Link href="/dashboard/leads-hub" className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Users2 className="w-4 h-4 text-purple-400" /> CRM Sync — all sources, one CRM</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Link>
      </div>
    </div>
  );
}
