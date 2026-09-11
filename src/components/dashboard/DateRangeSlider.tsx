"use client";

import { clampRange, thumbCentre } from "@/lib/analytics/dateRangeSlider";

// A two-thumb range slider: two native range inputs overlaid on one
// track. Native inputs give keyboard control (arrows, Home/End) and
// screen-reader values for free; no slider library is in the stack and
// this doesn't justify one.
//
// Each input ignores the pointer except on its thumb, so the two don't
// fight over clicks on the track.

const THUMB_PX = 16;

const INPUT_CLASS = [
  "pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent focus:outline-none",
  "disabled:cursor-not-allowed",
  // WebKit / Blink thumb
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500 [&::-webkit-slider-thumb]:shadow",
  "[&::-webkit-slider-thumb]:cursor-grab active:[&::-webkit-slider-thumb]:cursor-grabbing",
  "[&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-brand-400",
  // Firefox thumb
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
  "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2",
  "[&::-moz-range-thumb]:border-brand-500 [&::-moz-range-thumb]:cursor-grab",
  "[&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-brand-400",
].join(" ");

export default function DateRangeSlider({
  count,
  start,
  end,
  onChange,
  valueText,
  minLabel,
  maxLabel,
}: {
  /** Number of selectable days. */
  count: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  /** Spoken value for a handle, e.g. "9 Sep". */
  valueText: (index: number) => string;
  minLabel: string;
  maxLabel: string;
}) {
  const max = Math.max(0, count - 1);
  const disabled = count < 2;

  // With both thumbs parked at the far right, the start thumb must be on
  // top or it can never be dragged back left; everywhere else the end
  // thumb sits on top.
  const startOnTop = start === end && start === max;

  return (
    <div className="space-y-1.5">
      <div className="relative h-5">
        {/* Neutral track */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
        {/* Selected segment */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-500"
          style={{ left: thumbCentre(start, count, THUMB_PX), right: `calc(100% - ${thumbCentre(end, count, THUMB_PX)})` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={start}
          disabled={disabled}
          aria-label="Start date"
          aria-valuetext={valueText(start)}
          onChange={(e) => {
            const [s, en] = clampRange(Number(e.target.value), end, count, "start");
            onChange(s, en);
          }}
          className={INPUT_CLASS}
          style={{ zIndex: startOnTop ? 4 : 3 }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={end}
          disabled={disabled}
          aria-label="End date"
          aria-valuetext={valueText(end)}
          onChange={(e) => {
            const [s, en] = clampRange(start, Number(e.target.value), count, "end");
            onChange(s, en);
          }}
          className={INPUT_CLASS}
          style={{ zIndex: startOnTop ? 3 : 4 }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
