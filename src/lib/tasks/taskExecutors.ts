// P1 9b — executor registry for agent_tasks, same plain-object shape
// as eventHandlers.ts's EVENT_HANDLERS.
//
// A task whose action_type has no registered executor is left
// "pending" rather than auto-marked done (unlike event_queue's
// dispatch, which marks an unhandled event done since notifications
// are fire-and-forget) — a queued task is a real piece of work someone
// is waiting on, so it should stay visibly unresolved until either an
// executor exists or someone cancels it, not silently disappear.
//
// An executor throws on failure (doesn't swallow/return null the way
// generation functions elsewhere do) — the dispatch route's catch
// block is what actually marks the row "failed" and increments
// attempts, so a swallowed error here would misreport a failed task as
// successfully "done".

import { generateContent } from "../agents/contentMarketingAgent";
import { gatherBusinessFactsSafely } from "../claims/businessFacts";

export type TaskExecutor = (supabase: any, task: { id: string; dealership_id: string; action_type: string; action_details: Record<string, any>; title: string }) => Promise<any>;

export const TASK_EXECUTORS: Record<string, TaskExecutor> = {
  // P1 8a — the first real producer (goal decomposition,
  // goalPlanningAgent.ts) queues these. Saves to the same
  // content_pieces table Content Marketing's own page reads from, same
  // as every other content-generating tool in masterBrainV2.ts.
  //
  // NO `revise: true` HERE, DELIBERATELY (2026-10-09, F-Q1). The chat
  // path got the specificity editor because a human reads the card
  // before anything publishes. This path has no reader at the moment it
  // runs: a queued task executes unattended, so a second model call per
  // piece would spend money with nobody there to benefit, which is the
  // same reasoning that keeps it off contentAutopilot.
  //
  // Traced before deciding, because "it's only a draft" is the kind of
  // thing that turns out to be false: the row lands in content_pieces
  // and CANNOT reach a customer without a human. contentAutopilot
  // inserts its OWN row from copy it just generated and never reads
  // existing ones; the only publishing reader of this table is
  // /api/social/post, which needs a content_piece_id in a request body;
  // and nothing scans the table for scheduled rows. Pinned by
  // tests/specificityWiring.test.ts.
  //
  // NOT relying on `status`: it defaults to 'draft' (migration 028) and
  // nothing in the codebase ever reads it. The protection is structural,
  // not that flag.
  //
  // It also passes NO claimsMode, so it gets the default "publish" - the
  // STRICTEST guard, stricter than the chat path's "draft".
  generate_content: async (supabase, task) => {
    const { contentType, topic, businessName, businessCategory, toneOfVoice } = task.action_details;
    const { output, _fallback } = await generateContent(
      contentType, businessName, businessCategory, topic ?? "",
      { tone_of_voice: toneOfVoice ?? null, messaging_pillars: [] },
      { supabase, dealershipId: task.dealership_id },
      undefined,
      await gatherBusinessFactsSafely(supabase, task.dealership_id)
    );
    if (_fallback) throw new Error("Content generation fell back to a generic template — not saved, treated as a failed attempt.");
    const { data, error } = await supabase.from("content_pieces").insert({
      dealership_id: task.dealership_id, content_type: contentType, topic: topic ?? "", output,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { contentPieceId: data.id };
  },
};
