// THE PATHS THAT REACH THE OUTSIDE WORLD WITHOUT AN ACTION, ON PURPOSE.
//
// S6/P0 put this list in stateChangeDoor.test.ts, and S6/P2 needed the
// same list — so it moved here rather than being copied. Two lists of
// exemptions in two files is two lists that drift, and the drift would
// be silent in the dangerous direction: an entry removed from one and
// left in the other reads as still decided.
//
// THREE RULES, copied from the doors that already work
// (oneDoorForCopy.test.ts):
//
//   1. every entry carries the decision and its DATE
//   2. nothing new goes on it — the tests assert its exact membership,
//      so adding one is a visible edit to a frozen set rather than a
//      line in a diff nobody reads
//   3. an entry whose path has CLOSED fails the suite until it is
//      deleted, so the list can only shrink
//
// AND THE MONEY STEP IS NOT ON IT, and a test asserts it never will be.

export const UNGATED_BY_DECISION: Record<string, { symbols: string[]; why: string }> = {
  pause_meta_campaign: {
    symbols: ["setCampaignStatus"],
    why:
      "2026-11-04, recorded: stopping spend is never gated — CLAUDE.md rule 6, the safe direction must not be the slow one. Gating a pause would leave someone watching money burn while waiting on a click. The policy agrees: auto_paused_campaign is requiresApproval: false, and pauseMetaCampaign's own header carries the reason.",
  },
  send_email: {
    symbols: ["sendDealerEmail"],
    why:
      "2026-09-14, approved by the founder (Part 1 step 3): mail to a TEAM MEMBER of the same business sends directly. No customer sees it, nothing is published, nothing is spent. Mail to a lead or customer from the same tool is NOT exempt and is gated by a preview card, which approvalCoverage.test.ts asserts.",
  },
};

/** The symbols one tool is allowed to reach without passing an Action. */
export function ungatedSymbolsFor(tool: string): string[] {
  return UNGATED_BY_DECISION[tool]?.symbols ?? [];
}
