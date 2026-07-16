"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2, Copy, Check, ArrowRight, Clock, Calendar, Users2, Target,
  Sparkles, Kanban, MessageCircle, Mail, MessageSquareOff,
} from "lucide-react";

const COVERED_TASKS = [
  { label: "Lead Capture", desc: "Meta lead ads, website forms, CSV upload", href: "/dashboard/leads-hub", icon: Users2 },
  { label: "Lead Qualification & AI Scoring", desc: "Every lead auto-scored with a reason", href: "/dashboard/leads", icon: Target },
  { label: "Pipeline / Sales Pipeline", desc: "Kanban board — New to Converted", href: "/dashboard/pipeline", icon: Kanban },
  { label: "WhatsApp Automation", desc: "Free click-to-send, AI-drafted messages", href: "/dashboard/whatsapp", icon: MessageCircle },
  { label: "Email Automation", desc: "Auto welcome + follow-up emails", href: "/dashboard/email", icon: Mail },
];

export default function CrmMarketingView() {
  const [slug, setSlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reminders, setReminders] = useState<any>(null);

  useEffect(() => {
    fetch("/api/crm/booking-slug").then((r) => r.json()).then((d) => setSlug(d.slug)).finally(() => setLoadingSlug(false));
    fetch("/api/crm/reminders").then((r) => r.json()).then(setReminders);
  }, []);

  async function handleGenerateLink() {
    setGenerating(true);
    try {
      const res = await fetch("/api/crm/booking-slug", { method: "POST" });
      const data = await res.json();
      if (data.slug) setSlug(data.slug);
    } finally {
      setGenerating(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      {/* Meeting Booking */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Meeting Booking</p>
        {loadingSlug ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
        ) : slug ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 text-slate-600 truncate">/book/{slug}</code>
            <button onClick={copyLink} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy link
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400">Share a link where leads can pick a free slot and book a meeting themselves — no login needed for them.</p>
            <button onClick={handleGenerateLink} disabled={generating} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Create booking link
            </button>
          </>
        )}
      </div>

      {/* Follow-up Reminders — real data */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Follow-up Reminders</p>
        {!reminders ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</p>
        ) : (
          <>
            {reminders.todaysAppointments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-500 mb-1">Today's appointments</p>
                <div className="space-y-1.5">
                  {reminders.todaysAppointments.map((a: any) => (
                    <div key={a.id} className="bg-purple-500/10 rounded-lg p-2.5 text-sm text-slate-700 flex items-center justify-between">
                      <span>{a.leads?.name} — {a.appointment_type}</span>
                      <span className="text-xs text-slate-400">{new Date(a.appointment_date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {reminders.staleLeads.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-amber-500 mb-1">Leads waiting 2+ days with no follow-up</p>
                <div className="space-y-1.5">
                  {reminders.staleLeads.map((l: any) => (
                    <Link key={l.id} href="/dashboard/leads" className="block bg-slate-100 hover:bg-slate-200 rounded-lg p-2.5 text-sm text-slate-700">
                      {l.name} <span className="text-xs text-slate-400">— {l.phone} · {l.status.replace(/_/g, " ")}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              reminders.todaysAppointments.length === 0 && <p className="text-xs text-slate-400">Nothing overdue right now.</p>
            )}
          </>
        )}
      </div>

      {/* SMS — honest, not connected */}
      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><MessageSquareOff className="w-4 h-4" /> SMS Automation</p>
        <p className="text-xs text-slate-400">Not connected yet — SMS needs a paid gateway (e.g. Twilio, MSG91) since India requires DLT-registered sender IDs and templates for business SMS. WhatsApp and Email automation above are the free alternatives currently active.</p>
      </div>

      {/* Already-covered tasks */}
      <div className="grid sm:grid-cols-2 gap-3">
        {COVERED_TASKS.map((t) => (
          <Link key={t.href} href={t.href} className="card p-4 flex items-center justify-between hover:border-purple-400 transition-colors">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><t.icon className="w-4 h-4 text-purple-400" /> {t.label}</span>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
