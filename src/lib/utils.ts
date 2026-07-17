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

export function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getTemperatureColor(temp: LeadTemperature) {
  switch (temp) {
    case "hot":
      return "bg-red-100 text-red-700 border-red-200";
    case "warm":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "cold":
      return "bg-blue-100 text-blue-700 border-blue-200";
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
      return "bg-slate-100 text-slate-700";
    case "ready_to_call":
      return "bg-purple-100 text-purple-700";
    case "called":
      return "bg-blue-100 text-blue-700";
    case "appointment_set":
      return "bg-green-100 text-green-700";
    case "converted":
      return "bg-emerald-100 text-emerald-700";
    case "not_interested":
      return "bg-gray-100 text-gray-500";
  }
}

export function getStatusLabel(status: LeadStatus) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getCallStatusColor(status: CallStatus) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "no_answer":
      return "bg-amber-100 text-amber-700";
    case "busy":
      return "bg-orange-100 text-orange-700";
    case "failed":
      return "bg-red-100 text-red-700";
    case "voicemail":
      return "bg-blue-100 text-blue-700";
  }
}

export function getAppointmentStatusColor(status: AppointmentStatus) {
  switch (status) {
    case "scheduled":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
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
