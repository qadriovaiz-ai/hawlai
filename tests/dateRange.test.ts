// Analytics date ranges, period comparison and deltas.
//
// NOT a verbatim restoration — the original harness was written in an
// earlier session and deleted. This is equivalent coverage derived
// from the module's current behaviour, protecting the same properties:
// the exclusive end that stops "today" dropping today's rows, buckets
// derived from the range rather than from now(), and percentages
// suppressed where they would mislead.

import { describe, it, expect } from "vitest";
import {
  resolveRange,
  previousPeriod,
  trendGranularity,
  buildTrendBuckets,
  computeDelta,
  RANGE_OPTIONS,
} from "@/lib/analytics/dateRange";

const DAY = 24 * 60 * 60 * 1000;

describe("resolveRange", () => {
  it("defaults to 30 days for absent input", () => {
    expect(resolveRange(undefined, undefined, undefined).key).toBe("30d");
  });

  it("falls back to the default for an unrecognised range", () => {
    // A malformed URL should render a normal dashboard, not an error.
    expect(resolveRange("nonsense").key).toBe("30d");
  });

  it("resolves each preset to the right span", () => {
    expect(resolveRange("7d").days).toBe(7);
    expect(resolveRange("30d").days).toBe(30);
    expect(resolveRange("90d").days).toBe(90);
  });

  it("ends EXCLUSIVELY at tomorrow-midnight so today's rows are included", () => {
    const range = resolveRange("today");
    const end = new Date(range.to).getTime();
    // A naive `to = now` silently drops the most recent activity —
    // exactly what someone checking "Today" came to look at.
    expect(end).toBeGreaterThan(Date.now());
    expect(end - Date.now()).toBeLessThanOrEqual(DAY);
  });

  it("accepts a valid custom range", () => {
    const range = resolveRange("custom", "2026-01-01", "2026-01-10");
    expect(range.key).toBe("custom");
    expect(range.days).toBe(10);
  });

  it("rejects a reversed custom range instead of producing a negative span", () => {
    expect(resolveRange("custom", "2026-01-10", "2026-01-01").key).toBe("30d");
  });

  it("rejects unparseable custom dates", () => {
    expect(resolveRange("custom", "not-a-date", "also-not").key).toBe("30d");
  });

  it("exposes a label for every option the UI offers", () => {
    for (const opt of RANGE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe("previousPeriod", () => {
  it("is the same length as the current period", () => {
    const range = resolveRange("7d");
    const prev = previousPeriod(range);
    const span = new Date(prev.to).getTime() - new Date(prev.from).getTime();
    // Comparing 7 days against a 30-day span would produce a
    // meaningless percentage.
    expect(Math.round(span / DAY)).toBe(7);
  });

  it("ends exactly where the current period begins, with no gap or overlap", () => {
    const range = resolveRange("30d");
    expect(previousPeriod(range).to).toBe(range.from);
  });
});

describe("trendGranularity", () => {
  it("uses days for short ranges", () => {
    expect(trendGranularity(resolveRange("7d"))).toBe("day");
  });

  it("uses weeks for a quarter", () => {
    // 90 daily ticks is unreadable.
    expect(trendGranularity(resolveRange("90d"))).toBe("week");
  });

  it("uses months for anything longer", () => {
    expect(trendGranularity(resolveRange("custom", "2025-01-01", "2026-01-01"))).toBe("month");
  });
});

describe("buildTrendBuckets", () => {
  it("produces one bucket per day for a 7-day range", () => {
    expect(buildTrendBuckets(resolveRange("7d"))).toHaveLength(7);
  });

  it("never extends past the range the user chose", () => {
    const range = resolveRange("7d");
    const buckets = buildTrendBuckets(range);
    // The clamp on the final bucket: without it the chart claims a
    // period the data doesn't cover.
    expect(buckets[buckets.length - 1].end).toBeLessThanOrEqual(new Date(range.to).getTime());
  });

  it("starts at or after the range start", () => {
    const range = resolveRange("30d");
    expect(buildTrendBuckets(range)[0].start).toBeGreaterThanOrEqual(
      new Date(range.from).setHours(0, 0, 0, 0)
    );
  });

  it("derives buckets from the RANGE, not from today", () => {
    // The shipped bug this guards: buckets were built as "last 6
    // months from now()" while the rows were range-filtered, so a
    // 7-day view rendered six month buckets, five of them empty.
    const shortRange = buildTrendBuckets(resolveRange("7d"));
    const longRange = buildTrendBuckets(resolveRange("90d"));
    expect(shortRange.length).not.toBe(longRange.length);
    expect(shortRange.length).toBe(7);
  });

  it("produces contiguous buckets with no gaps", () => {
    const buckets = buildTrendBuckets(resolveRange("7d"));
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].start).toBe(buckets[i - 1].end);
    }
  });

  it("labels every bucket", () => {
    expect(buildTrendBuckets(resolveRange("30d")).every((b) => b.label.length > 0)).toBe(true);
  });
});

describe("computeDelta", () => {
  it("reports the absolute change and direction", () => {
    const d = computeDelta(120, 100);
    expect(d.absolute).toBe(20);
    expect(d.direction).toBe("up");
    expect(d.percent).toBe(20);
  });

  it("reports a decrease", () => {
    const d = computeDelta(80, 100);
    expect(d.direction).toBe("down");
    expect(d.percent).toBe(-20);
  });

  it("reports no change", () => {
    expect(computeDelta(50, 50).direction).toBe("flat");
  });

  it("suppresses the percentage when the baseline is zero", () => {
    // There is no "percent increase from zero"; +100% would invent a
    // baseline that never existed.
    expect(computeDelta(5, 0).percent).toBeNull();
    expect(computeDelta(5, 0).absolute).toBe(5);
  });

  it("suppresses the percentage at a small baseline", () => {
    // 1 -> 2 is "+100%", which reads as a breakthrough and is one
    // extra lead. The absolute number is the honest one at that scale.
    expect(computeDelta(2, 1).percent).toBeNull();
    expect(computeDelta(2, 1).absolute).toBe(1);
  });

  it("shows the percentage once the baseline is large enough to mean something", () => {
    expect(computeDelta(6, 5).percent).toBe(20);
  });

  it("still reports the absolute change whenever the percentage is suppressed", () => {
    const d = computeDelta(3, 1);
    expect(d.percent).toBeNull();
    expect(d.absolute).toBe(2);
    expect(d.direction).toBe("up");
  });
});
