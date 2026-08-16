// Business Brain — live-call tool-calling dispatcher. Phase 1 piece 4
// (the last piece) of the AI Communication Employee foundation.
//
// INFRASTRUCTURE ONLY — CALL_TOOL_HANDLERS below is intentionally
// empty. This file is provably inert today: triggerVapiCall() (the
// outbound call trigger) and the inbound assistant-request webhook
// handler never set `model.tools` on the assistant config they send
// to Vapi, so the model has nothing it's able to decide to call —
// Vapi will never send a tool-calls webhook message for any call this
// app creates, regardless of what this dispatcher does. That's the
// core safety property of this piece: it cannot affect a live call
// until Phase 2 deliberately activates a specific tool.
//
// Activating a real tool in Phase 2 means adding all three of:
//   1. A CALL_TOOL_HANDLERS entry here (the real handler function).
//   2. channels: ["call"] on that tool's entry in toolRegistry.ts.
//   3. The matching tool definition in the assistant's model.tools
//      array, set at call-creation time (vapiCallAgent.ts for
//      outbound, the inbound webhook handler for inbound) — this is
//      the actual trigger condition; (1) and (2) alone still leave
//      Vapi with nothing to call.
//
// Safety contract for handleVapiToolCalls(): it NEVER throws and
// ALWAYS resolves to a well-formed { results: [...] } response — one
// entry per tool call Vapi asked for, even when the tool name is
// unknown, a handler throws, or the payload itself is malformed. An
// in-progress call has to keep going no matter what a tool does, so
// every failure mode here degrades to a spoken-safe fallback string
// instead of an error the assistant (or the caller) has no good way
// to react to.

export interface ToolCallContext {
  dealershipId: string;
  leadId?: string | null;
}

type ToolHandler = (args: Record<string, any>, ctx: ToolCallContext) => Promise<string>;

// Empty by design — see file header. Keyed by tool name, matching
// BUSINESS_BRAIN_TOOLS's `name` field in toolRegistry.ts.
const CALL_TOOL_HANDLERS: Record<string, ToolHandler> = {};

interface VapiToolCall {
  id: string;
  type?: string;
  function?: { name: string; arguments?: Record<string, any> | string };
}

interface ToolCallResultsResponse {
  results: { toolCallId: string; result: string }[];
}

// A tool call that can't be fulfilled still gets a real, spoken-safe
// result string — not an HTTP error — so the assistant can tell the
// caller something sensible ("a team member will follow up on that")
// instead of the call stalling on a malformed or missing response.
const UNAVAILABLE_RESULT = "This action isn't available right now — let the caller know a team member will follow up on it.";

export async function handleVapiToolCalls(message: any, ctx: ToolCallContext): Promise<ToolCallResultsResponse> {
  try {
    const toolCalls: VapiToolCall[] = message?.toolCallList ?? message?.toolCalls ?? [];
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return { results: [] };

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const toolCallId = call?.id ?? "";
        const name = call?.function?.name;
        if (!toolCallId) return null; // can't return a result Vapi can match to a call it made
        if (!name || !CALL_TOOL_HANDLERS[name]) return { toolCallId, result: UNAVAILABLE_RESULT };

        try {
          const rawArgs = call.function?.arguments;
          const args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : (rawArgs ?? {});
          const result = await CALL_TOOL_HANDLERS[name](args, ctx);
          return { toolCallId, result };
        } catch (err: any) {
          console.error(`[vapi-tool-call] handler for "${name}" failed:`, err.message);
          return { toolCallId, result: UNAVAILABLE_RESULT };
        }
      })
    );

    return { results: results.filter((r): r is { toolCallId: string; result: string } => r !== null) };
  } catch (err: any) {
    // Payload was malformed enough that we couldn't even extract
    // toolCallIds — still return a validly-shaped (if empty) response
    // rather than letting this throw turn into a 500 the live call
    // would otherwise be left waiting on.
    console.error("[vapi-tool-call] handleVapiToolCalls failed entirely:", err.message);
    return { results: [] };
  }
}
