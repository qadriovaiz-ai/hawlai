"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Calendar, Loader2, CheckCircle } from "lucide-react";

export default function BookingPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [dealershipName, setDealershipName] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/book?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setDealershipName(d.dealershipName);
        setSlots(d.slots ?? []);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSubmit() {
    if (!selectedSlot || !name || !phone) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone, email, appointmentDate: selectedSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed");
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const slotsByDay = slots.reduce((acc: Record<string, string[]>, iso) => {
    const d = new Date(iso);
    const key = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    (acc[key] ||= []).push(iso);
    return acc;
  }, {});

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>;
  if (error && !dealershipName) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">{error}</div>;

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">You're booked!</h1>
          <p className="text-sm text-slate-500">
            {selectedSlot && new Date(selectedSlot).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} with {dealershipName}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Book a meeting with {dealershipName}</h1>
            <p className="text-xs text-slate-400">Pick a time that works for you</p>
          </div>
        </div>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          {Object.entries(slotsByDay).map(([day, times]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-slate-400 mb-1.5">{day}</p>
              <div className="flex flex-wrap gap-1.5">
                {times.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedSlot(t)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${selectedSlot === t ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-purple-400"}`}
                  >
                    {new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {slots.length === 0 && <p className="text-sm text-slate-400">No slots available right now — please call directly.</p>}
        </div>

        {selectedSlot && (
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting || !name || !phone}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg"
            >
              {submitting ? "Booking..." : "Confirm booking"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
