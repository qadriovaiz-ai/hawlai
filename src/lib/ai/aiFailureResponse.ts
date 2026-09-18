// How an API route says the AI failed (Step 3, approved 2026-09-18).
//
// Every generator hands back `_aiFailure` beside its fallback
// (lib/ai/claude.ts). A route that sees it answers with the approved
// message as `error` — which every page already knows how to show — and
// never saves or returns the placeholder as if it were the result.

import { NextResponse } from "next/server";
import { aiFailureOf, type AiFailureNote } from "./claude";

export { aiFailureOf };

/** The response to send when `result` failed for want of the AI; null when it didn't. */
export function aiFailedResponse(result: unknown) {
  const note = aiFailureOf(result);
  return note ? aiFailureResponse(note) : null;
}

export function aiFailureResponse(note: AiFailureNote) {
  // 502 when the request itself was the problem (our bug); 503 when the
  // AI is busy or down — the same words either way come from the note.
  const status = note.kind === "bad_request" ? 502 : 503;
  return NextResponse.json({ error: note.message, aiFailure: note.kind }, { status });
}
