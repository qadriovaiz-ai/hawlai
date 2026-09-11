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
export function narrativeProblems(text: string, allowed: AllowedNumbers): string[] {
  const problems: string[] = [];
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
export function keepConsistent(items: unknown, allowed: AllowedNumbers): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item !== "string") continue;
    const problems = narrativeProblems(item, allowed);
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

export const NARRATIVE_RULES = `Rules:
- Use only the numbers above, exactly as written. Never state, estimate or imply any other figure — the page shows these same numbers beside your words, and a mismatch reads as a mistake.
- A suggested budget (e.g. "₹200/day") is fine; anything about what has happened must come from the numbers above.
- Be direct and honest, but respectful: never call the business, its campaigns or its setup a "placeholder", a joke, or anything similar.`;
