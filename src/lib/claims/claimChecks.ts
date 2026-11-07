// THE RECORD OF WHAT WENT OUT — S7/P1.
//
// Measured on 5 November 2026 before this was written: `generateCopy`
// computes `removed`, `substantiation` and `publishable` and throws all
// three away; this directory's other nine files only read; and
// `email_sends` keeps the subject and not the body. So "how often did a
// sentence we could not support reach a customer this month?" had no
// answer at all. Migration 217 is where the answer lives and S7/P2's
// monitor is what reads it.
//
// THIS FILE ONLY WRITES. It makes no judgement about the copy — the
// claim guard already did that, upstream, and writing a second opinion
// here would give one question two answers. The independent second
// judge is the monitor, which runs later, from scratch, and is the
// whole reason the table exists:
//
//     "THE RUN CANNOT BE THE JUDGE OF THE RUN"
//       — scripts/eval/outputGate.eval.ts
//
// AND IT NEVER BREAKS A SEND. Every failure here is reported and
// swallowed. A bookkeeping row that could stop a merchant's page edit
// from landing would be a far worse fault than the one it records.
// Swallowed is not silent: see `recordClaimCheck`.

import { getActionPolicy } from "@/lib/executionPolicy";

/** The kinds of output this product puts in front of a customer. */
export type ClaimSurface =
  | "page_meta"
  | "page_text"
  | "email"
  | "whatsapp"
  | "social"
  | "lead_message"
  | "product_description";

/**
 * What a tool hands forward about its own claim check.
 *
 * TRAVELS ON THE ACTION ROW, in `requested_changes.claimCheck`, because
 * the executor is the one place that knows the change actually landed
 * and the tool is the one place that knows what the guard did. Migration
 * 216's lesson, applied: the record is written at the moment the thing
 * happens, not reconstructed afterwards from prose.
 *
 * STRUCTURED, AND NOT `claimWarnings`. The warnings beside this are
 * sentences for the owner to read; counting them would be a test
 * grepping its own copy, which this codebase has already paid for
 * (CLAUDE.md rule 8). The numbers are passed as numbers.
 */
export type ClaimCheckField = {
  /** The copy as it will go live. The monitor re-reads this. */
  text: string;
  /** Claims the guard took out before this could go out. */
  removed: number;
  /** Unsupported claims deliberately kept, which therefore go out. */
  keptUnsupported: number;
  /** Were those kept ones the owner's own wording? See migration 217. */
  ownerWords: boolean;
  /**
   * What KINDS of claim were removed (I6, migration 224).
   *
   * `removed` is how many. This is which, and it is the whole of what
   * Tier 3 reads: "the owner has never told us a price" is countable
   * from this and guessable from nothing else.
   */
  removedKinds: string[];
};

export type ClaimCheckInput = {
  dealershipId: string;
  surface: ClaimSurface;
  /** The publish action, where there was one. Null for a one-shot send. */
  actionId?: string | null;
  field: ClaimCheckField;
  /** Did it actually reach the public? The load-bearing column. */
  published: boolean;
};

/**
 * Which surface an action key writes to.
 *
 * AN UNKNOWN KEY RECORDS NOTHING, AND SAYS SO. Guessing a surface would
 * file a page edit as an email and quietly mis-shape every number the
 * monitor later reports. Migration 217 left `surface` unconstrained in
 * SQL on the understanding that a mismatch is caught here instead — so
 * this is that catch, and it has to be loud.
 */
const SURFACE_OF: Record<string, ClaimSurface> = {
  update_page_meta: "page_meta",
  update_page_text: "page_text",
  update_post: "page_text",
  publish_post: "page_text",
  update_product_description: "product_description",
  publish_social_post: "social",
  send_email: "email",
};

export function surfaceFor(actionKey: string): ClaimSurface | null {
  return SURFACE_OF[String(actionKey ?? "")] ?? null;
}

/** Every surface the map can produce, for the test that keeps it honest. */
export function knownSurfaces(): ClaimSurface[] {
  return Array.from(new Set(Object.values(SURFACE_OF)));
}

/**
 * Build the field a tool attaches to its action, from what its guard
 * returned.
 *
 * ONE DERIVATION, so two tools cannot count the same thing two ways.
 * `removed` is the guard's own list; `keptUnsupported` is the count the
 * CALLER has to state, because only the caller knows whether it chose
 * to keep something — the guard's return value cannot tell you that.
 */
export function claimCheckField(input: {
  text: string;
  removed: string[];
  /** From stripUnsupported's `removedKinds`. Absent is "not recorded". */
  removedKinds?: string[];
  keptUnsupported?: number;
  ownerWords?: boolean;
}): ClaimCheckField {
  const kept = Math.max(0, Math.floor(input.keptUnsupported ?? 0));
  return {
    text: String(input.text ?? ""),
    removed: Array.isArray(input.removed) ? input.removed.length : 0,
    // EMPTY MEANS NOT RECORDED, NOT "NOTHING WAS REMOVED". `removed`
    // above is where the count is stated, and migration 224's own
    // comment says the same about the column: every row written before
    // I6 has an empty array and none of them means a clean output.
    removedKinds: Array.isArray(input.removedKinds) ? input.removedKinds.map((k) => String(k)) : [],
    keptUnsupported: kept,
    // OWNER'S WORDS ONLY MEANS ANYTHING IF SOMETHING WAS KEPT. True
    // with nothing kept would mark a clean row as the owner's
    // responsibility, which is the wrong direction: it would excuse a
    // future escape that was ours.
    ownerWords: kept > 0 && Boolean(input.ownerWords),
  };
}

/** Is this a claim-check field, as opposed to whatever else is on the row? */
export function isClaimCheckField(value: any): value is ClaimCheckField {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    Number.isFinite(value.removed) &&
    Number.isFinite(value.keptUnsupported)
  );
}

export type RecordResult = { recorded: boolean; why: string | null };

/**
 * Write the row.
 *
 * NEVER THROWS. A failure is logged with its reason and reported to the
 * caller, which is the same shape S7's other recorder takes
 * (src/lib/growth/leftOut.ts) and for the same reason: a recorder whose
 * own failure is silent reproduces the fault it exists to fix.
 */
export async function recordClaimCheck(supabase: any, input: ClaimCheckInput): Promise<RecordResult> {
  if (!isClaimCheckField(input.field)) {
    const why = "the claim check carried no text, so there is nothing a monitor could read back";
    console.error(`[claims] not recorded for ${input.dealershipId}: ${why}`);
    return { recorded: false, why };
  }
  try {
    const { error } = await supabase.from("claim_checks").insert({
      dealership_id: input.dealershipId,
      surface: input.surface,
      action_id: input.actionId ?? null,
      text: input.field.text,
      claims_removed: input.field.removed,
      removed_kinds: input.field.removedKinds,
      claims_unsupported: input.field.keptUnsupported,
      owner_words: input.field.ownerWords,
      published: input.published,
      published_at: input.published ? new Date().toISOString() : null,
    });
    if (error) {
      // THE ONE FAILURE THAT MATTERS MOST IS THE QUIET ONE. If this
      // table is not being written, the monitor sees an empty month and
      // reports a clean one — so the reason is said out loud, and names
      // the migration, because repo migrations drift from production
      // and that has bitten this project before.
      const why = `${error.message ?? error}. If migration 217 has not been run, claim_checks does not exist yet.`;
      console.error(`[claims] could not record what went out for ${input.dealershipId} (${input.surface}): ${why}`);
      return { recorded: false, why };
    }
    return { recorded: true, why: null };
  } catch (err: any) {
    const why = String(err?.message ?? err);
    console.error(`[claims] could not record what went out for ${input.dealershipId} (${input.surface}): ${why}`);
    return { recorded: false, why };
  }
}

/**
 * Record an executed publish action's output, from the action row.
 *
 * THE ONE CALL SITE THAT KNOWS IT LANDED. `executePublishAction` is the
 * only thing that runs a publish action, so this is called there and
 * `published` is true by construction rather than by a second write
 * that could be lost between them.
 */
export async function recordExecutedPublish(
  supabase: any,
  action: { id: string; dealershipId: string; actionKey: string; requestedChanges: any }
): Promise<RecordResult> {
  const field = (action.requestedChanges ?? {})?.claimCheck;
  // NOT EVERY ACTION CARRIES COPY. A price change has no sentences in
  // it, and a row with no text would be a row the monitor cannot check
  // — counted as unchecked for ever, which is what suspends promotion.
  if (!isClaimCheckField(field)) return { recorded: false, why: "this action carries no copy to check" };

  // THE REGISTRY FIRST, AND THE ORDER IS THE POINT.
  //
  // A key nobody classified is not safe by default — ACTION_POLICIES'
  // own header says so. If the registry has never heard of this action,
  // the surface map agreeing about it proves nothing.
  //
  // CHECKED BEFORE THE SURFACE because of what that does to the TESTS.
  // With the surface first, the registry branch was unreachable: every
  // key in SURFACE_OF is in ACTION_POLICIES, pinned by the test
  // "EVERY MAPPED KEY IS A REAL ACTION", so nothing could ever arrive
  // mapped-but-unclassified. The test I wrote for it passed on the
  // SURFACE check instead and proved nothing about this branch.
  //
  // This way round both branches are reachable with real keys: a key in
  // neither place lands here, and a key the registry knows but nobody
  // mapped — update_product_name, launch_ad_campaign — lands below.
  if (!getActionPolicy(action.actionKey)) {
    const why = `${action.actionKey} is not in ACTION_POLICIES, so what it published was not recorded`;
    console.error(`[claims] ${why}`);
    return { recorded: false, why };
  }

  const surface = surfaceFor(action.actionKey);
  if (!surface) {
    const why = `${action.actionKey} has no surface in claimChecks.ts, so what it published was not recorded`;
    // LOUD, because the consequence is invisible: the monitor would
    // simply never see this surface and would report the months it was
    // live as clean.
    console.error(`[claims] ${why}`);
    return { recorded: false, why };
  }

  return await recordClaimCheck(supabase, {
    dealershipId: action.dealershipId,
    surface,
    actionId: action.id,
    field,
    published: true,
  });
}
