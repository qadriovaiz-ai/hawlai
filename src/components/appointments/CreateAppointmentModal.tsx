"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  leadId: string;
  leadName: string;
  dealershipId: string;
}

/** The generic set the dropdown offers. Anything else is owner-defined or legacy. */
const KNOWN_TYPES = ["visit", "consultation", "demo", "meeting", "delivery", "pickup"];

export default function CreateAppointmentModal({ leadId, leadName, dealershipId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: "",
    time: "10:00",
    type: "visit",
    notes: "",
  });
  const [customType, setCustomType] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const appointmentDate = new Date(`${form.date}T${form.time}:00`).toISOString();

    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        dealership_id: dealershipId,
        appointment_date: appointmentDate,
        // "__other" is a UI token, never a stored value.
        appointment_type: form.type === "__other" ? (customType.trim() || "meeting") : form.type,
        notes: form.notes,
        status: "scheduled",
      }),
    });

    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="primary">
        <Calendar className="w-4 h-4" /> Book Appointment
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Book Appointment</h3>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-3">Booking for <strong className="text-slate-900">{leadName}</strong></p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                min={new Date().toISOString().split("T")[0]}
                required
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                required
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="input"
            >
              {/* Generic across categories. The database has no CHECK
                  constraint (migration 038) and existing rows keep their
                  own values, so "Something else" lets a business name
                  what it actually does. */}
              <option value="visit">Visit</option>
              <option value="consultation">Consultation</option>
              <option value="demo">Demo / trial</option>
              <option value="meeting">Meeting</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
              <option value="__other">Something else...</option>
              {/* A legacy row's own value stays selectable so editing an
                  old appointment does not silently change its type. */}
              {!KNOWN_TYPES.includes(form.type) && form.type !== "__other" && (
                <option value={form.type}>{form.type.replace(/_/g, " ")}</option>
              )}
            </select>
            {form.type === "__other" && (
              <input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="What do you call it? e.g. fitting, tasting, site visit"
                className="input mt-2"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any special instructions..."
              rows={3}
              className="input resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" onClick={() => setOpen(false)} variant="secondary" className="flex-1 justify-center">
              Cancel
            </Button>
            <Button type="submit" loading={loading} variant="primary" className="flex-1 justify-center">
              {loading ? "Booking..." : "Book Appointment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
