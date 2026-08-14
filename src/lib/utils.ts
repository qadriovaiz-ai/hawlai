import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { LeadTemperature, LeadStatus, CallStatus, AppointmentStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
}

export function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

// "2h ago" / "3d ago" style — falls back to formatDate past a week, since
// "23d ago" is harder to place on a timeline than an actual date.
export function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateString);
}

// snake_case -> Title Case, e.g. "change_campaign_budget" -> "Change Campaign Budget".
// Generic fallback for any action_type/agent slug not covered by a
// bespoke label map — never renders a raw, lowercase machine string.
export function titleCaseFromSnake(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Master audit / design system Step 4 — these four functions used to
// return solid light-mode swatches (bg-red-100/text-red-700), the
// exact "wrong shade family" mismatch Badge.tsx's own comment calls
// out against its correct translucent dark-theme formula
// (bg-{color}-500/10 text-{color}-400 border-{color}-700/30). Now
// matched to that same formula, same hue-per-status, callers unchanged
// (they consume these as plain className strings, not <Badge>).
export function getTemperatureColor(temp: LeadTemperature) {
  switch (temp) {
    case "hot":
      return "bg-red-500/10 text-red-400 border-red-700/30";
    case "warm":
      return "bg-amber-500/10 text-amber-400 border-amber-700/30";
    case "cold":
      return "bg-blue-500/10 text-blue-400 border-blue-700/30";
  }
}

export function getTemperatureIcon(temp: LeadTemperature) {
  switch (temp) {
    case "hot":
      return "🔥";
    case "warm":
      return "⚡";
    case "cold":
      return "❄️";
  }
}

export function getStatusColor(status: LeadStatus) {
  switch (status) {
    case "new":
      return "bg-slate-200 text-slate-500 border-slate-300";
    case "ready_to_call":
      return "bg-brand-500/10 text-brand-400 border-brand-700/30";
    case "called":
      return "bg-blue-500/10 text-blue-400 border-blue-700/30";
    case "appointment_set":
      return "bg-green-500/10 text-green-400 border-green-700/30";
    case "converted":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-700/30";
    case "not_interested":
      return "bg-slate-500/10 text-slate-400 border-slate-700/30";
  }
}

export function getStatusLabel(status: LeadStatus) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getCallStatusColor(status: CallStatus) {
  switch (status) {
    case "initiated":
      return "bg-slate-200 text-slate-500 border-slate-300";
    case "completed":
      return "bg-green-500/10 text-green-400 border-green-700/30";
    case "no_answer":
      return "bg-amber-500/10 text-amber-400 border-amber-700/30";
    case "busy":
      return "bg-orange-500/10 text-orange-400 border-orange-700/30";
    case "failed":
      return "bg-red-500/10 text-red-400 border-red-700/30";
    case "voicemail":
      return "bg-blue-500/10 text-blue-400 border-blue-700/30";
  }
}

export function getAppointmentStatusColor(status: AppointmentStatus) {
  switch (status) {
    case "scheduled":
      return "bg-blue-500/10 text-blue-400 border-blue-700/30";
    case "completed":
      return "bg-green-500/10 text-green-400 border-green-700/30";
    case "cancelled":
      return "bg-red-500/10 text-red-400 border-red-700/30";
  }
}

// Builds a wa.me click-to-chat link — opens WhatsApp with the message
// pre-filled, ready to send. Free, no API/account needed; the person
// still has to tap Send themselves.
export function toWhatsAppLink(phone: string | null | undefined, message: string): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  // Assume Indian numbers when no country code is present (10 digits).
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Fires a public analytics event for a landing page (view, click,
// chat_open, form_submit). Never throws — tracking must never break
// the page for a real visitor.
export function trackEvent(slug: string, eventType: string, coords?: { xPct: number; yPct: number }, variant?: string | null) {
  try {
    fetch("/api/public/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, eventType, xPct: coords?.xPct, yPct: coords?.yPct, variant }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // no-op
  }
}
