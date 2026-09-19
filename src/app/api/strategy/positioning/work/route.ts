import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { driveRun, workerAuthorized } from "@/lib/strategy/positioning/continue";

// Takes a positioning run's next step (lib/strategy/positioning/run.ts).
// Called only by the server itself, with CRON_SECRET, to carry a run on —
// answers 202 at once and does the step after, like the daily run.
// 300s, as Master Chat has asked since July: a step's calls are time-boxed
// well under it, with room for the hand-over after (continue.ts).
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which run?" }, { status: 400 });

  const origin = new URL(request.url).origin;
  after(() => driveRun(createServiceClient(), origin, id));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
