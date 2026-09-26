// "I have ₹50,000 — what should I do with it?" (Brain, Phase 3).
//
// THIS IS THE RISKIEST THING IN THE WHOLE PLAN, and the vision itself
// says why: "prediction ko fact ki tarah nahi dikhana". A simulator that
// prints "₹30,000 on Google → 120 leads → ₹2,40,000 revenue" is the most
// believable lie the product could tell. Those numbers come from a cost
// per lead and a conversion rate, and this business has 5 leads on
// record — there is no such number to multiply by.
//
// So the rule here is absolute: a split is arithmetic on the owner's
// budget, and a projection exists ONLY where the figure it rests on was
// measured from this business's own history. Where it wasn't, the
// scenario says what it would need to know and stops. It never borrows an
// industry benchmark, and it never quietly fills a gap to complete a
// table.
//
// What that leaves is still genuinely useful: where the money goes, why
// each channel is in the split at all, and exactly which number the owner
// would have to supply — or measure — before anyone could say what it
// will return.

import type { Diagnosis } from "./diagnosis";
import { CHANNEL_LABEL, type ChannelFit, type ChannelKey } from "./channelFit";

export type Allocation = {
  channel: ChannelKey;
  label: string;
  amountInr: number;
  sharePct: number;
  why: string;
  /** Leads this could buy, ONLY when a real cost per lead was measured here. */
  projectedLeads: number | null;
  /** The measured figure a projection rests on, in the owner's own words. */
  basis: string | null;
};

export type Scenario = {
  name: string;
  allocations: Allocation[];
  projectedLeadsTotal: number | null;
  /** What nobody can answer yet, stated rather than filled in. */
  unknowns: string[];
};

export type Simulation = {
  budgetInr: number;
  scenarios: Scenario[];
  /** Said plainly when the budget can't be split sensibly at all. */
  thin: string | null;
  /** The one honest sentence about what this is. */
  disclaimer: string;
};

export const DISCLAIMER =
  "These are ways to divide the money, not forecasts. A number of leads appears only where it was worked out from this business's own measured cost per lead — everywhere else the scenario says what would have to be measured first.";

/** Below this there is nothing to split; it buys one small test at most. */
export const MIN_BUDGET = 3000;
/** A channel needs at least this much to be worth separating out. */
export const MIN_PER_CHANNEL = 1500;

/** The cost per lead this business has actually paid, by channel. */
export function measuredCostPerLead(d: Diagnosis | null): { costPerLead: number; campaign: string } | null {
  const rows = (d?.paid ?? []).filter((p) => (p.costPerLead ?? 0) > 0 && p.leads > 0);
  if (rows.length === 0) return null;
  // The cheapest real one: the most favourable figure the owner has
  // actually achieved, so a projection is optimistic but never invented.
  const best = rows.sort((a, b) => (a.costPerLead ?? 0) - (b.costPerLead ?? 0))[0];
  return { costPerLead: best.costPerLead!, campaign: best.campaign };
}

function round100(n: number): number {
  return Math.max(0, Math.round(n / 100) * 100);
}

function allocate(budget: number, weights: { channel: ChannelKey; weight: number; why: string }[], cpl: { costPerLead: number; campaign: string } | null): Allocation[] {
  const total = weights.reduce((n, w) => n + w.weight, 0) || 1;
  const out: Allocation[] = [];
  let spent = 0;
  weights.forEach((w, i) => {
    const last = i === weights.length - 1;
    const amountInr = last ? round100(budget - spent) : round100((budget * w.weight) / total);
    spent += amountInr;
    out.push({
      channel: w.channel,
      label: CHANNEL_LABEL[w.channel],
      amountInr,
      sharePct: Math.round((amountInr / budget) * 100),
      why: w.why,
      // A projection only where a real figure exists — and only for the
      // paid channels that figure was measured on.
      projectedLeads: cpl && (w.channel === "google_search" || w.channel === "meta_ads") ? Math.floor(amountInr / cpl.costPerLead) : null,
      basis: cpl && (w.channel === "google_search" || w.channel === "meta_ads") ? `at ₹${cpl.costPerLead} per lead, which is what "${cpl.campaign}" actually cost` : null,
    });
  });
  return out;
}

/**
 * Two or three ways to divide a budget, with every projection tied to a
 * measured figure or absent.
 */
export function simulate(input: { budgetInr: number; fits: ChannelFit[]; diagnosis: Diagnosis | null }): Simulation {
  const budget = Math.max(0, Math.round(Number(input.budgetInr) || 0));
  const cpl = measuredCostPerLead(input.diagnosis);
  const unknowns: string[] = [];

  if (!cpl) {
    unknowns.push(
      "What a lead costs this business. No paid campaign with leads is on record, so nobody can say what any of this money will return — the only way to find out is to spend a little and measure it."
    );
  }
  const weakest = input.diagnosis?.funnels.find((f) => f.weakest)?.weakest;
  if (!weakest) {
    unknowns.push("Where people are being lost. There isn't enough traffic yet for the funnel to show a weakest step, so this splits the money by what suits the business rather than by what is broken.");
  }

  if (budget < MIN_BUDGET) {
    return {
      budgetInr: budget,
      scenarios: [],
      thin: `₹${budget} is too little to divide usefully. Put it all behind one channel, measure what it costs you per lead, and decide from that.`,
      disclaimer: DISCLAIMER,
    };
  }

  // Only channels the evidence supports get money. An untested channel is
  // named in the reasoning, never funded on a hunch.
  const funded = input.fits.filter((f) => f.standing === "proven" || f.standing === "fits");
  const paid = funded.filter((f) => f.channel === "google_search" || f.channel === "meta_ads");
  const organic = funded.filter((f) => f.channel === "instagram" || f.channel === "email" || f.channel === "whatsapp" || f.channel === "local_seo");

  if (paid.length === 0) {
    return {
      budgetInr: budget,
      scenarios: [],
      thin:
        "None of the paid channels has anything behind it yet — no photographs to advertise with, no search demand on record, or nothing connected. Fixing that costs nothing, and is worth doing before any of this budget is spent.",
      disclaimer: DISCLAIMER,
    };
  }

  const scenarios: Scenario[] = [];
  const reasonFor = (f: ChannelFit) => f.reasons[0] ?? CHANNEL_LABEL[f.channel];

  // A: everything behind the strongest channel. The simplest thing to
  // measure, which is what a business with no cost-per-lead needs most.
  const strongest = paid[0];
  scenarios.push({
    name: `All of it on ${CHANNEL_LABEL[strongest.channel]}`,
    allocations: allocate(budget, [{ channel: strongest.channel, weight: 1, why: reasonFor(strongest) }], cpl),
    projectedLeadsTotal: null,
    unknowns: [...unknowns, "Whether a second channel would have done better — this scenario deliberately doesn't find out."],
  });

  // B: split across the paid channels that qualify.
  if (paid.length > 1) {
    scenarios.push({
      name: "Split across both paid channels",
      allocations: allocate(
        budget,
        paid.slice(0, 2).map((f, i) => ({ channel: f.channel, weight: i === 0 ? 0.6 : 0.4, why: reasonFor(f) })),
        cpl
      ),
      projectedLeadsTotal: null,
      unknowns: [...unknowns, "Split budgets take longer to teach you anything, because each half gets less data."],
    });
  }

  // C: most on the strongest, a slice held back for the organic work that
  // keeps paying after the money stops.
  if (organic.length > 0) {
    const keep = organic[0];
    scenarios.push({
      name: `Mostly ${CHANNEL_LABEL[strongest.channel]}, some on ${CHANNEL_LABEL[keep.channel]}`,
      allocations: allocate(
        budget,
        [
          { channel: strongest.channel, weight: 0.75, why: reasonFor(strongest) },
          { channel: keep.channel, weight: 0.25, why: `${reasonFor(keep)} — and unlike ads, this keeps working after the spending stops` },
        ],
        cpl
      ),
      projectedLeadsTotal: null,
      unknowns: [...unknowns],
    });
  }

  // Totals, only where every funded paid line had a measured basis.
  for (const s of scenarios) {
    const paidLines = s.allocations.filter((a) => a.channel === "google_search" || a.channel === "meta_ads");
    const allBacked = paidLines.length > 0 && paidLines.every((a) => a.projectedLeads !== null);
    s.projectedLeadsTotal = allBacked ? paidLines.reduce((n, a) => n + (a.projectedLeads ?? 0), 0) : null;
  }

  // Each scenario drops below the per-channel floor rather than pretending
  // ₹400 on a second channel is a real test.
  const usable = scenarios.filter((s) => s.allocations.every((a) => a.amountInr >= MIN_PER_CHANNEL));
  return {
    budgetInr: budget,
    scenarios: usable.length ? usable : [scenarios[0]],
    thin: null,
    disclaimer: DISCLAIMER,
  };
}
