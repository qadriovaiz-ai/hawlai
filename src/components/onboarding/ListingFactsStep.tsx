"use client";

// THE LISTING FACTS, ASKED (I4 of docs/PLAN-AUTO-INTERVIEW.md).
//
// TWO SCREENS, ONE COMPONENT, AND THE QUESTIONS COME FROM THE REGISTRY.
// `lib/onboarding/interview.ts` holds the prompt, the help line and the
// kind of answer for each question; this renders whichever of them the
// caller names. The point of I2 was that adding a question is a row in a
// list rather than another branch in a component, and a component that
// hand-rolled these four would have given that back immediately.
//
// NOT ONE PROMPT IS WRITTEN HERE. Every word the owner reads comes from
// the registry, where a test holds that none of it names a trade, a
// product or a category — CLAUDE.md rule 3. A prompt typed into this
// file would be outside that test.
//
// PUBLISHING IS ASKED, NEVER ASSUMED. Both publish checkboxes start
// unticked, matching migration 221's defaults, because a value the owner
// gives Hawlai is not a value he asked to put on a public page.
//
// "Skip for now" stays, as it does on every other step: setup is
// abandoned rather than satisfied, and these four answers are worth
// having late more than they are worth trapping somebody for.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DAYS, type HoursInterval } from "@/lib/seo/listingFacts";
import { questionByKey } from "@/lib/onboarding/interview";

type Props = {
  /** Which registry questions this screen asks, in order. */
  questionKeys: string[];
  onSaved: () => void;
  onSkip: () => void;
};

type DayRow = { open: string; close: string; closed: boolean };

const BLANK_DAY: DayRow = { open: "", close: "", closed: false };

/** The grid as the column wants it: one entry per day, nulls for closed. */
export function gridToIntervals(grid: Record<string, DayRow>): HoursInterval[] {
  const out: HoursInterval[] = [];
  for (const day of DAYS) {
    const row = grid[day];
    if (!row) continue;
    // CLOSED IS AN ANSWER AND IS SENT. "Shut on Sunday" is a fact a
    // customer is looking for; leaving the day out would say only that
    // nobody mentioned it.
    if (row.closed) {
      out.push({ day, opens: null, closes: null });
      continue;
    }
    // A half-filled day is sent as nothing rather than as half a window
    // — the reader would refuse it anyway, and sending it would make the
    // screen look as though it had been saved.
    if (row.open && row.close) out.push({ day, opens: row.open, closes: row.close });
  }
  return out;
}

/** The places, as the owner typed them, one per line or comma-separated. */
export function parsePlaces(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function ListingFactsStep({ questionKeys, onSaved, onSkip }: Props) {
  const questions = questionKeys.map((k) => questionByKey(k)).filter(Boolean);

  const [phone, setPhone] = useState("");
  const [publishPhone, setPublishPhone] = useState(false);
  const [address, setAddress] = useState("");
  const [publishStreet, setPublishStreet] = useState(false);
  const [places, setPlaces] = useState("");
  const [grid, setGrid] = useState<Record<string, DayRow>>(() =>
    Object.fromEntries(DAYS.map((d) => [d, { ...BLANK_DAY }]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WHAT IS ALREADY ON RECORD IS SHOWN BACK, so the second screen does
  // not look like a business with no phone number, and so coming back
  // to setup is not starting again.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/listing-facts");
        if (!res.ok) return;
        const row = await res.json();
        if (!live || !row) return;
        setPhone(row.public_phone ?? "");
        setPublishPhone(row.publish_phone === true);
        setAddress(row.street_address ?? "");
        setPublishStreet(row.publish_street_address === true);
        setPlaces(Array.isArray(row.areas_served) ? row.areas_served.join(", ") : "");
        if (Array.isArray(row.opening_hours) && row.opening_hours.length) {
          const next = Object.fromEntries(DAYS.map((d) => [d, { ...BLANK_DAY }])) as Record<string, DayRow>;
          for (const i of row.opening_hours as HoursInterval[]) {
            if (!next[i.day]) continue;
            if (i.opens === null && i.closes === null) next[i.day] = { open: "", close: "", closed: true };
            else next[i.day] = { open: i.opens ?? "", close: i.closes ?? "", closed: false };
          }
          setGrid(next);
        }
      } catch {
        // A failed read leaves the fields empty, which is the same as a
        // business that has not answered. Nothing is invented.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const asks = (key: string) => questions.some((q) => q!.key === key);

  async function save() {
    setSaving(true);
    setError(null);
    // ONLY THE KEYS THIS SCREEN ASKED ABOUT. The route leaves an absent
    // column alone, so the hours screen cannot wipe the phone screen's
    // answers — the trap the brand-profile route already records.
    const body: Record<string, unknown> = {};
    if (asks("public_phone")) {
      body.public_phone = phone.trim() || null;
      body.publish_phone = publishPhone;
    }
    if (asks("street_address")) {
      body.street_address = address.trim() || null;
      body.publish_street_address = publishStreet;
    }
    if (asks("areas_served")) body.areas_served = parsePlaces(places);
    if (asks("opening_hours")) body.opening_hours = gridToIntervals(grid);

    try {
      const res = await fetch("/api/listing-facts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "Could not save that just now.");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Could not save that just now.");
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      {questions.map((q) => (
        <div key={q!.key} className="mb-6 last:mb-0">
          <p className="text-base font-medium text-slate-900">{q!.prompt}</p>
          {q!.help && <p className="text-sm text-slate-500 mt-1">{q!.help}</p>}

          {q!.kind === "phone" && (
            <div className="mt-3">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg bg-slate-200 border border-slate-300 px-3 py-2 text-slate-900"
                placeholder="+91 "
              />
              <label className="flex items-center gap-2 mt-2 text-sm text-slate-600">
                <input type="checkbox" checked={publishPhone} onChange={(e) => setPublishPhone(e.target.checked)} />
                Show this number on my public pages
              </label>
            </div>
          )}

          {q!.kind === "address" && (
            <div className="mt-3">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-slate-200 border border-slate-300 px-3 py-2 text-slate-900"
              />
              <label className="flex items-center gap-2 mt-2 text-sm text-slate-600">
                <input type="checkbox" checked={publishStreet} onChange={(e) => setPublishStreet(e.target.checked)} />
                Show the street address publicly, not just my city
              </label>
            </div>
          )}

          {q!.kind === "places" && (
            <textarea
              value={places}
              onChange={(e) => setPlaces(e.target.value)}
              rows={2}
              className="w-full mt-3 rounded-lg bg-slate-200 border border-slate-300 px-3 py-2 text-slate-900"
              placeholder="One per line, or separated by commas"
            />
          )}

          {q!.kind === "hours" && (
            <div className="mt-3 flex flex-col gap-2">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-24 text-sm capitalize text-slate-600">{day}</span>
                  <input
                    type="time"
                    value={grid[day].open}
                    disabled={grid[day].closed}
                    onChange={(e) => setGrid({ ...grid, [day]: { ...grid[day], open: e.target.value } })}
                    className="rounded-lg bg-slate-200 border border-slate-300 px-2 py-1 text-slate-900 disabled:opacity-40"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="time"
                    value={grid[day].close}
                    disabled={grid[day].closed}
                    onChange={(e) => setGrid({ ...grid, [day]: { ...grid[day], close: e.target.value } })}
                    className="rounded-lg bg-slate-200 border border-slate-300 px-2 py-1 text-slate-900 disabled:opacity-40"
                  />
                  <label className="flex items-center gap-1 text-sm text-slate-600 ml-1">
                    <input
                      type="checkbox"
                      checked={grid[day].closed}
                      onChange={(e) => setGrid({ ...grid, [day]: { ...grid[day], closed: e.target.checked } })}
                    />
                    Closed
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 font-medium disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue
        </button>
        <button onClick={onSkip} className="text-sm text-slate-500 hover:text-slate-700">
          Skip for now
        </button>
      </div>
    </div>
  );
}
