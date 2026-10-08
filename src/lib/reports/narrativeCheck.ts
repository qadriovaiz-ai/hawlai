// Keeping a report's words in step with its numbers.
//
// The AI writes the narrative; the page prints the numbers beside it.
// If the two disagree, the reader trusts neither — "trace where the ₹550
// revenue came from" beside a ₹0 Revenue card is exactly that. So both
// report narratives are given the same labelled numbers and rules, and
// every sentence is checked: any ₹ amount or count it states must be one
// of the report's own figures. A sentence that disagrees is dropped —
// never "corrected" by guessing what it meant.

import type { BusinessNumbers } from "./businessNumbers";

export type AllowedNumbers = { rupees: number[]; counts: Record<string, number[]> };

export function allowedNumbers(n: BusinessNumbers): AllowedNumbers {
  const rupees = [n.totalSpend, n.costPerLead, n.leadRevenue, n.orderRevenue, n.totalRevenue, n.adAttributedRevenue].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  const sales = [n.convertedLeads, n.paidOrders, n.convertedLeads + n.paidOrders];
  return {
    rupees,
    counts: {
      lead: [n.totalLeads, n.hotLeads, n.warmLeads, n.coldLeads, n.convertedLeads],
      order: [n.paidOrders],
      sale: sales,
      customer: sales,
      campaign: [n.campaignsLaunched, n.liveCampaigns],
      appointment: [n.appointmentsScheduled, n.appointmentsCompleted],
      approval: [n.pendingApprovals],
    },
  };
}

const WORDS: Record<string, number> = { zero: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const RUPEES = /₹\s?(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|l|crores?|cr)?\b/gi;
// A suggested budget ("₹200/day", "₹3,000 a month") is advice, not a claim about what happened.
const RATE_AFTER = /^\s*(\/\s*(day|week|month)|per\s+(day|week|month)|an?\s+(day|week|month)|daily|weekly|monthly)/i;
const COUNTS =
  /\b(\d+|zero|no|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:hot|warm|cold|new|live|active|paid|pending|launched|converted|completed|scheduled|total)\s+)?(leads?|orders?|sales?|customers?|campaigns?|appointments?|approvals?)\b/gi;

/** Every way `text` disagrees with the report's own numbers. Empty when it's consistent. */
/**
 * The least data a verdict needs before it is a reading rather than a
 * guess.
 *
 * Five leads and one order produced "healthy", "20% (1 of 5), healthy"
 * and "something is stopping them at the door" — three confident
 * statements about a sample that cannot support one.
 */
export const VERDICT_FLOOR = { leads: 30, orders: 10 };

/** Words that pass judgement on how the business is doing. */
const VERDICT =
  /\b(?:healthy|unhealthy|broken|strong|weak|poor|solid|excellent|terrible|good|bad|great|fine|worrying|concerning|working well|not working|failing|underperform\w*|outperform\w*)\b/gi;

/** Claims that something is stopping or blocking customers. */
const BLOCKED = /\b(?:stopping|blocking|putting off|turning away|losing)\s+(?:them|customers|buyers|people|visitors)\b|\bat the door\b/gi;

/** A benchmark asserted without a source. */
const BENCHMARK =
  /\b(?:decent|normal|typical|average|above average|below average|industry standard|benchmark|on par|respectable|healthy)\s+(?:for|in)\s+(?:a|an|the|this|that|most|any)\b/gi;

/** Views described as people. */
const VIEWS_AS_PEOPLE = /\b\d[\d,]*\s+(?:people|visitors|users|customers)\s+(?:visited|viewed|came|landed|browsed)/gi;

export function narrativeProblems(
  text: string,
  allowed: AllowedNumbers,
  /** How much data there is, so a verdict can be judged against it. */
  sample?: { leads: number; orders: number }
): string[] {
  const problems: string[] = [];

  // A VERDICT ON A HANDFUL. Checked before the figures, because this is
  // the one that sends an owner to fix the wrong thing.
  if (sample && sample.leads < VERDICT_FLOOR.leads && sample.orders < VERDICT_FLOOR.orders) {
    for (const m of text.matchAll(VERDICT)) {
      problems.push(`calls something "${m[0]}" on ${sample.leads} lead(s) and ${sample.orders} paid order(s) — too few to judge`);
    }
    for (const m of text.matchAll(BLOCKED)) {
      problems.push(`says something is "${m[0].trim()}" without the traffic to show it`);
    }
  }
  for (const m of text.matchAll(BENCHMARK)) {
    problems.push(`treats "${m[0].trim()}" as a known standard, and no benchmark with a source is on the page`);
  }
  for (const m of text.matchAll(VIEWS_AS_PEOPLE)) {
    problems.push(`says "${m[0].trim()}" — the analytics count views, not unique visitors`);
  }
  for (const m of text.matchAll(RUPEES)) {
    const after = text.slice((m.index ?? 0) + m[0].length);
    if (RATE_AFTER.test(after)) continue;
    let v = Number(m[1].replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    if (unit === "k") v *= 1e3;
    else if (unit.startsWith("l")) v *= 1e5;
    else if (unit.startsWith("c")) v *= 1e7;
    const matches = allowed.rupees.some((a) => Math.abs(a - v) <= Math.max(1, Math.abs(a) * 0.01));
    if (!matches) problems.push(`mentions ₹${m[1]}, which isn't one of this business's figures`);
  }
  // "the ₹550 order" is an amount, not 550 orders — rupee figures are
  // checked above, so they're blanked out before counting.
  const countable = text.replace(RUPEES, (s) => " ".repeat(s.length));
  for (const m of countable.matchAll(COUNTS)) {
    const raw = m[1].toLowerCase();
    const v = /^\d+$/.test(raw) ? Number(raw) : WORDS[raw];
    const noun = m[2].toLowerCase().replace(/s$/, "");
    const ok = allowed.counts[noun];
    if (ok && !ok.includes(v)) problems.push(`says "${m[0].trim()}", but no figure on the page is ${v}`);
  }
  return problems;
}

/** The items consistent with the numbers; the rest dropped, with why. */
export function keepConsistent(items: unknown, allowed: AllowedNumbers, sample?: { leads: number; orders: number }): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item !== "string") continue;
    const problems = narrativeProblems(item, allowed, sample);
    if (problems.length) dropped.push(`${item} — ${problems.join("; ")}`);
    else kept.push(item);
  }
  return { kept, dropped };
}

const rupee = (v: number) => `₹${Math.round(v * 100) / 100}`;

/** The labelled numbers both report prompts receive — the same text, so they can't diverge. */
export function describeNumbersForPrompt(n: BusinessNumbers): string {
  return [
    `Leads: ${n.totalLeads} total (${n.hotLeads} hot, ${n.warmLeads} warm, ${n.coldLeads} cold, ${n.convertedLeads} converted)`,
    `Campaigns launched: ${n.campaignsLaunched}; live right now: ${n.liveCampaigns}`,
    `Ad spend so far: ${n.totalSpend === null ? "unknown — the ad account couldn't be read, so do not state or guess a spend figure" : rupee(n.totalSpend)}`,
    `Cost per lead: ${n.costPerLead === null ? "not available" : rupee(n.costPerLead)}`,
    `Revenue: ${rupee(n.totalRevenue)} total — ${rupee(n.orderRevenue)} from ${n.paidOrders} paid website order${n.paidOrders === 1 ? "" : "s"}, ${rupee(n.leadRevenue)} from closed deals`,
    `Revenue credited to ads: ${n.adAttributedRevenue === null ? "unknown" : rupee(n.adAttributedRevenue)}`,
    `Pending approvals: ${n.pendingApprovals}`,
    `Appointments: ${n.appointmentsScheduled} scheduled, ${n.appointmentsCompleted} completed; calls made: ${n.callsMade}`,
  ].join("\n");
}

/**
 * Said in the report when the guard removed something.
 *
 * A DROP MUST NOT BE SILENT. The guard works — the Vercel log for 3 Oct
 * shows it catching an invented "₹200–₹300/day" twice — but the owner
 * saw a report with a suggestion missing and no reason, which looks like
 * the product having nothing to say. Worse, a section can end up empty
 * or short with no explanation for the gap.
 */
export function droppedNote(dropped: string[]): string | null {
  if (dropped.length === 0) return null;
  const n = dropped.length;
  return `${n === 1 ? "One suggestion was" : `${n} suggestions were`} removed from this report because ${n === 1 ? "it contained" : "they contained"} a figure or a judgement Hawlai can't stand behind from your own numbers. Nothing was changed about your business — only about what this page is willing to claim.`;
}

export const NARRATIVE_RULES = `Rules:
- Use only the numbers above, exactly as written. Never state, estimate or imply any other figure — the page shows these same numbers beside your words, and a mismatch reads as a mistake.
- NO RUPEE FIGURE OF YOUR OWN, including a suggested budget. Not "₹200/day", not "even ₹200–₹300/day to start", not a range, not an example. If you want to recommend starting a budget, say so WITHOUT a number: "set a daily budget" or "start small". The Budget Simulator is the only thing that may propose an amount, because it is the only thing that computes one.
- NO VERDICT ON A HANDFUL. Do not call anything healthy, broken, strong, weak, good, poor, working or failing — and do not say what is "stopping" customers — when the figure behind it is a handful. Under 30 leads or under 10 orders, say what the numbers are and that there are too few to judge yet. A confident read of 5 leads is a guess wearing a measurement's clothes.
- NO BENCHMARK WITHOUT A SOURCE. Never say a figure is normal, decent, low, above or below average for anything — not for a category, a price point or a channel — unless the benchmark is in the numbers above with its source. "20% is decent for a ₹999 product" is an invented standard.
- VIEWS ARE NOT PEOPLE. The analytics count page views, not unique visitors, so write "views" and never "people visited" or "visitors".
- Be direct and honest, but respectful: never call the business, its campaigns or its setup a "placeholder", a joke, or anything similar.`;
