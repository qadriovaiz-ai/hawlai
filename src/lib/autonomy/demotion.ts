// TAKING A PERMISSION BACK — S7/P3.
//
// BUILT BEFORE PROMOTION EXISTS, and that order is the whole shape of
// this stage: the brake before the accelerator. Nothing can be raised
// to L2 until P4 and P5, so for now this file has almost nothing to
// demote — which is exactly when it should be written and tested.
//
// THE FOUNDER'S RULE: "kabhi nuksaan na ho, sirf growth". Read strictly
// that is not "be careful"; it is that the product must be able to TELL
// whether harm happened, and act on the answer without being asked. A
// level that rises on measured data and never falls is a one-way
// ratchet with no instrument.
//
// THREE PROPERTIES, each from something already in this codebase:
//
//   IT ASKS NOBODY. CLAUDE.md rule 6: "Switching an automation off is
//   never gated — the safe direction must not be the slow one."
//   `effectiveLevel` already returns before consulting anything when
//   the direction is "disable". A demotion that waited for an approval
//   click would leave an unattended action running while it waited, so
//   there is no requestApproval on this path and a test asserts there
//   never will be.
//
//   IT FIRES ON THE FIRST ONE, not on a rate. A rate needs a
//   denominator and a window, and both are arguments to have while a
//   wrong claim is live on a customer's screen.
//
//   A BLIND MONITOR IS NOT A PASS. F-01's lesson, which
//   autonomyLevelsStore.ts already applies to levels: a site that
//   cannot read its own permissions must ask, not act. An autonomous
//   product whose supervisor quietly died is the worst state this stage
//   can produce, and it is the state that looks exactly like everything
//   being fine.

import { MONITOR_BLIND_DAYS } from "@/lib/claims/outputMonitor";
import { emitNotification } from "@/lib/notifications/emit";
import { recordDecisionQuietly } from "@/lib/growth/recordDecision";

/**
 * Surfaces a stranger can read.
 *
 * THE FOUNDER'S DECISION 5, 5 November 2026: a claim that is wrong on a
 * public page is usually wrong in the next email too, so a public
 * escape takes every raised level on that business down with it. One
 * that went to a single inbox is narrower.
 *
 * Spelled with the surface names migration 217 and claimChecks.ts
 * actually use. The exit test's first fixtures said "page", which was a
 * placeholder written at P0 before any surface had a name.
 */
const PUBLIC_SURFACES = new Set(["page_meta", "page_text", "social", "product_description"]);

/** Surfaces that reach one named person. */
const PRIVATE_SURFACES = new Set(["email", "whatsapp", "lead_message"]);

export type DemotionReach = "action" | "business";

/** One row of what went out, as `claim_checks` records it. */
export type DemotionSignal = {
  surface: string;
  /** Did it actually reach anyone. Nothing else here matters without it. */
  published: boolean;
  /** Claims nothing can license that went out in it. */
  unsupported: number;
  /**
   * Were those the owner's own words?
   *
   * THE CASE THAT MUST NOT DEMOTE, and the reason migration 217 has a
   * column for it. Both page tools keep an unsupported claim when the
   * owner says he wrote the line himself, and tell him he is the one
   * standing behind it. That is a claim reaching the public and it is
   * HIS sentence. Taking a permission away for it would punish him for
   * using the product as designed.
   */
  ownerWords?: boolean;
};

export type DemotionDecision = {
  demote: boolean;
  /** How wide. Null when nothing is being demoted. */
  reach: DemotionReach | null;
  /** True when the reason is that nobody has checked, not that something was wrong. */
  blind: boolean;
  /** In the owner's words, or null when there is nothing to say. */
  why: string | null;
};

const NO: DemotionDecision = { demote: false, reach: null, blind: false, why: null };

/**
 * How wide a demotion for this surface reaches.
 *
 * AN UNKNOWN SURFACE IS TREATED AS PUBLIC. The safe direction here is
 * MORE demotion, not less: a surface nobody has classified is one
 * nobody has thought about, and guessing "it only went to one person"
 * about an unknown channel is the guess that costs something.
 */
export function reachFor(surface: string): DemotionReach {
  const name = String(surface ?? "");
  if (PRIVATE_SURFACES.has(name)) return "action";
  if (!PUBLIC_SURFACES.has(name)) {
    console.error(`[autonomy] "${name}" is not a surface anyone has classified, so a demotion for it reaches the whole business`);
  }
  return "business";
}

/**
 * Should anything be taken back, given what went out.
 *
 * PURE. No database, no model, no clock — which is what lets every rule
 * above be tested without any of them. The caller applies it.
 */
export function demoteAfter(
  signals: DemotionSignal[],
  opts: { blindDays?: number | null } = {}
): DemotionDecision {
  // WHAT ACTUALLY REACHED SOMEBODY, and not what was caught. A claim
  // the guard removed is the system working; counting it here would
  // make this fire on its own successes. Migration 217's `published` is
  // the whole reason that distinction is available at all.
  const escapes = signals.filter((s) => s.published && s.unsupported > 0 && !s.ownerWords);

  if (escapes.length) {
    // ONE IS ENOUGH, and the widest reach among them wins: if anything
    // public got out, the business-wide rule applies even if an email
    // escape is also in the list.
    const reach: DemotionReach = escapes.some((s) => reachFor(s.surface) === "business") ? "business" : "action";
    return {
      demote: true,
      reach,
      blind: false,
      why:
        reach === "business"
          ? "something went out publicly that your records do not support, so everything I was doing on my own is back to asking you first."
          : "something I sent carried a claim your records do not support, so that one is back to asking you first.",
    };
  }

  // NOTHING WRONG FOUND — BUT WAS ANYBODY LOOKING? `blindDays` is how
  // long the oldest published output has sat unexamined, measured by
  // the monitor. Null means nothing is waiting, which is not the same
  // as a clean check and must not be read as one.
  const blindDays = opts.blindDays ?? null;
  if (blindDays !== null && blindDays >= MONITOR_BLIND_DAYS) {
    return {
      demote: true,
      reach: "business",
      blind: true,
      why: "I have not been able to check what went out for a couple of days, so I have stopped doing anything on my own until I can.",
    };
  }
  return NO;
}

export type DemotionApplied = {
  /** Levels actually written down to L0. */
  lowered: number;
  /** Set when it could not be carried out. Never swallowed. */
  error: string | null;
};

/**
 * Carry it out: lower the levels, record it, tell the owner.
 *
 * NO APPROVAL, NO CARD, NO WAIT. See the header — rule 6's shape. The
 * only thing between the decision and the write is this function.
 */
export async function applyDemotion(
  supabase: any,
  input: {
    dealershipId: string;
    decision: DemotionDecision;
    /** The action that produced the escape, when the reach is that action. */
    actionKey?: string | null;
    /** The claim_checks rows this rests on, as evidence pointers. */
    evidenceIds?: string[];
  }
): Promise<DemotionApplied> {
  const { decision } = input;
  if (!decision.demote) return { lowered: 0, error: null };

  // EVERY RAISED LEVEL, OR JUST THE ONE. A row already at L0 is left
  // alone rather than rewritten, so `lowered` counts what changed and
  // not what was looked at.
  let query = supabase
    .from("action_levels")
    .update({ level: "L0", note: `Lowered automatically: ${decision.why ?? "a check failed"}` })
    .eq("dealership_id", input.dealershipId)
    .neq("level", "L0");
  if (decision.reach === "action") {
    if (!input.actionKey) {
      const why = "a demotion was decided for one action and nothing said which, so nothing was lowered";
      console.error(`[autonomy] ${why} (${input.dealershipId})`);
      return { lowered: 0, error: why };
    }
    query = query.eq("action_key", input.actionKey);
  }

  const { data, error } = await query.select("id");
  if (error) {
    // SAID, NOT SWALLOWED, and this is the loudest failure in the
    // stage: a demotion that did not happen leaves an unattended action
    // running after the product decided it should not be.
    console.error(
      `[autonomy] COULD NOT LOWER a level for ${input.dealershipId} after an unsupported claim went out: ${error.message}`
    );
    return { lowered: 0, error: error.message };
  }
  const lowered = Array.isArray(data) ? data.length : 0;

  // RECORDED AS A DECISION, so a revoked permission is measurable
  // rather than a silent correction. `automation_switched` has been a
  // declared kind since migration 215 and this is its first writer.
  //
  // NO BASELINE AND NO SOURCE: what a removed permission did for the
  // business is not something this product collects, and migration
  // 215's fourth verdict — not_measurable, with a reason — is there for
  // exactly this. claim_checks could back it once the results job
  // learns to read that table; it does not yet, and claiming otherwise
  // would be the invented number this project refuses.
  await recordDecisionQuietly(supabase, {
    dealershipId: input.dealershipId,
    kind: "automation_switched",
    what:
      decision.reach === "action"
        ? `Stopped doing "${input.actionKey}" on my own, and went back to asking first`
        : "Stopped doing anything on my own, and went back to asking first",
    why: (input.evidenceIds ?? []).map((id) => ({ kind: "claim_check", id })),
    measure: {
      metric: "published outputs carrying a claim nothing can license",
      source: null,
      direction: "down",
    },
    baseline: null,
    decidedBy: "system:output_monitor",
  });

  // AND THE OWNER IS TOLD. A limit that lives only in a log is a limit
  // nobody knows about — this project has paid for that more than once.
  // The daily email is the surface he actually reads and S7/P3a puts
  // the same sentence there; this is the immediate one.
  await emitNotification(supabase, {
    dealershipId: input.dealershipId,
    kind: "autonomy_lowered",
    title: decision.blind ? "I have paused working on my own" : "I have gone back to asking you first",
    body: decision.why ?? undefined,
    href: "/dashboard/settings",
    // ONE PER BUSINESS PER DAY PER REACH. A monitor run with four
    // escapes in it is one thing that happened to him, not four.
    dedupeKey: `autonomy_lowered:${input.dealershipId}:${decision.reach}:${new Date().toISOString().slice(0, 10)}`,
  });

  // AND A LINE THAT CANNOT BE REFUSED. emitNotification swallows a
  // failed insert by design, and `notifications.kind` is CHECK-
  // constrained — so until migration 218 has been run on an
  // environment, the notification above lands nowhere and says nothing.
  // The decision row and this line are the two records that do not
  // depend on that constraint.
  console.error(
    `[autonomy] lowered ${lowered} level(s) for ${input.dealershipId} (${decision.reach}${decision.blind ? ", nothing could be checked" : ", an unsupported claim went out"}) — the owner was told: ${decision.why}`
  );

  return { lowered, error: null };
}

/**
 * The join between what the monitor found and what gets taken back.
 *
 * DUCK-TYPED ON THE RUN rather than importing its type, so this file
 * stays testable with a literal and the dependency runs one way only
 * (this file already reads MONITOR_BLIND_DAYS from the monitor).
 *
 * NOTHING HAPPENS ON A FAILED RUN. A monitor that could not read its
 * own table has not found a clean morning — but it has not found an
 * escape either, and demoting on a database error would punish a
 * business for an outage. The blindness it reports is what covers the
 * case where nobody has been looking for days, and that is a measured
 * number rather than a failed query.
 */
export async function demoteFromRun(
  supabase: any,
  dealershipId: string,
  run: {
    error?: string | null;
    blindDays?: number | null;
    escapes?: DemotionSignal[] & { id?: string }[];
  }
): Promise<DemotionApplied & { decision: DemotionDecision }> {
  if (run.error) return { lowered: 0, error: null, decision: NO };

  const escapes = (run.escapes ?? []) as (DemotionSignal & { id?: string })[];
  const decision = demoteAfter(escapes, { blindDays: run.blindDays ?? null });
  if (!decision.demote) return { lowered: 0, error: null, decision };

  const applied = await applyDemotion(supabase, {
    dealershipId,
    decision,
    // TODAY EVERY ESCAPE IS PUBLIC, so this is for completeness rather
    // than for use: S7/P1 records the page surfaces only, and both are
    // public. The private surfaces arrive with P1b, and they are
    // one-shot sends with no publish action — so when the reach is one
    // action, there will be an action key to name only once those sends
    // carry one. `applyDemotion` refuses loudly rather than guessing.
    actionKey: null,
    evidenceIds: escapes.map((e) => String(e.id ?? "")).filter(Boolean),
  });
  return { ...applied, decision };
}

/**
 * Check what went out, then take back what should not have been given.
 *
 * THE ONE PLACE THAT KNOWS ABOUT BOTH, and it is here rather than in
 * the daily runner because that table has one job: "one table, so the
 * run order is decided by cronGroups.ts and nothing else." An inline
 * async body there broke the shape every runner is checked against —
 * tests/dailyRunOrder.test.ts caught it, which is the test working.
 */
export async function monitorAndDemote(supabase: any, dealershipId: string) {
  const { runOutputMonitor } = await import("@/lib/claims/outputMonitor");
  const run = await runOutputMonitor(supabase, dealershipId);
  const demotion = await demoteFromRun(supabase, dealershipId, run);
  return { ...run, demotion };
}
