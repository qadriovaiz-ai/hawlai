import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { EVENT_HANDLERS } from "@/lib/events/eventHandlers";

// Triggered by pg_cron every 2 minutes (see migration 129's commented
// manual setup) via pg_net, which sends the same
// `Authorization: Bearer $CRON_SECRET` shape /api/autopilot/daily-run
// already checks — same secret, same pattern, so both crons are
// authorized identically.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[event-dispatch] CRON_SECRET is not set — this endpoint is currently unprotected.");
  }

  const supabase = createServiceClient();

  // Bounded batch per run — this fires every 2 minutes, so a backlog
  // drains within a few runs rather than one run trying to do
  // everything and risking a serverless timeout.
  const { data: pending, error } = await supabase
    .from("event_queue")
    .select("id, dealership_id, event_type, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending || pending.length === 0) return NextResponse.json({ processed: 0 });

  let done = 0;
  let failed = 0;
  for (const event of pending) {
    const handlers = EVENT_HANDLERS[event.event_type];
    if (!handlers || handlers.length === 0) {
      // No subscriber registered for this event_type — not an error,
      // just nothing to do yet. Marked done so it doesn't sit
      // "pending" forever waiting on a handler that may never exist.
      await supabase.from("event_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", event.id);
      done++;
      continue;
    }
    try {
      for (const handler of handlers) await handler(supabase, event);
      await supabase.from("event_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", event.id);
      done++;
    } catch (err: any) {
      await supabase.from("event_queue").update({
        status: "failed",
        error: err.message,
        attempts: (event.attempts ?? 0) + 1,
        processed_at: new Date().toISOString(),
      }).eq("id", event.id);
      failed++;
    }
  }

  return NextResponse.json({ processed: pending.length, done, failed });
}
