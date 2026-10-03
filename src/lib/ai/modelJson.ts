// Reading the JSON out of a model reply without throwing paid work away.
//
// THE LIVE CASE (3 Oct 2026, candle_by_qaaf). A competitor pricing
// compare for "Karessa Candles" ran twice. Both times the web search ran
// (₹1.74) and the Claude call ran and returned (₹11.52, then ₹11.72) —
// about ₹27 spent. Both times the owner was told "Couldn't complete
// pricing compare for Karessa Candles right now — try again shortly",
// and the chat, having no cause to relay, invented two: "research tool
// ne koi result nahi diya" and "tool temporarily unavailable".
//
// What actually happened is in the Vercel log, one line after the second
// call: `Expected ',' or ']' after array element in JSON at position
// 6934 (line 147 column 6)`. JSON.parse threw inside a catch that
// returns a generic fallback, so a complete, paid, probably mostly-valid
// answer was discarded and replaced with a sentence that named nothing.
//
// THREE WAYS THE OLD PATTERN BREAKS, and it used the same three lines in
// about thirty-five agents:
//
//   const jsonMatch = text.match(/\{[\s\S]*\}/);
//   const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "");
//   const parsed = JSON.parse(clean);
//
//   1. SPLICING. `[\s\S]*` is greedy, so it runs from the FIRST "{" in
//      the whole reply to the LAST "}". A web-search reply is many text
//      blocks with search results between them, and the model often
//      writes prose — sometimes containing braces — before and after the
//      JSON. Two separate fragments spliced together produce exactly
//      "Expected ',' or ']' after array element": the second fragment's
//      first element lands inside the first fragment's array with no
//      comma before it.
//   2. TRUNCATION. max_tokens cuts the reply mid-structure. stop_reason
//      says so and nothing read it.
//   3. MALFORMATION. An unescaped quote or newline in text copied off a
//      web page.
//
// So: find the JSON by BALANCE rather than by greed, repair a truncated
// one down to its last complete element and say the answer is partial,
// and when none of that works, report the real cause instead of a
// shrug — because the one thing that must never happen again is paid
// work discarded silently.

export type ModelJsonCause = "no_json" | "truncated" | "malformed";

export type ModelJsonResult =
  | {
      ok: true;
      value: any;
      /** True when the reply was cut off and only complete items were kept. */
      partial: boolean;
      /** Said to the owner when partial, so a short answer isn't read as the whole one. */
      note: string | null;
    }
  | {
      ok: false;
      cause: ModelJsonCause;
      /** The parser's own words, for the log. */
      detail: string;
      /** One sentence for the owner, naming the real cause. */
      message: string;
    };

/**
 * The end of the JSON value starting at `from`, found by balance.
 *
 * String-aware, so a brace inside a quoted string doesn't move the
 * depth, and escape-aware, so `\"` doesn't end the string. This is what
 * replaces the greedy regex: it stops at the value's OWN closing brace
 * and never reaches a later one belonging to something else.
 *
 * `safeEnd` is the position just after the last COMPLETE element, with
 * the container stack as it stood there — which is everything needed to
 * salvage a truncated reply.
 */
function scan(body: string, from: number): { end: number; complete: boolean; safeEnd: number; safeStack: string[] } {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let safeEnd = -1;
  let safeStack: string[] = [];

  const markSafe = (at: number) => {
    // Only meaningful inside a container: the point after a finished
    // element, where closing the open containers yields valid JSON.
    if (stack.length > 0) {
      safeEnd = at;
      safeStack = [...stack];
    }
  };

  for (let i = from; i < body.length; i++) {
    const ch = body[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return { end: i + 1, complete: true, safeEnd, safeStack };
      markSafe(i + 1);
      continue;
    }
    // A comma AFTER A CLOSED CONTAINER, and nothing else.
    //
    // WHY THIS IS SO NARROW: the first version also marked a safe point
    // after every finished string value, which salvaged a half-written
    // item. A reply cut off at `{"item":"Votive","pri` came back as
    // `{"item":"Votive"}` — an item assembled out of a fragment, its
    // price silently missing, presented as complete. A salvage that
    // fabricates is worse than the generic failure it replaces, so the
    // only safe points are whole elements.
    if (ch === ",") {
      let k = i - 1;
      while (k >= from && /\s/.test(body[k])) k--;
      if (body[k] === "}" || body[k] === "]") markSafe(i);
      continue;
    }
  }

  return { end: body.length, complete: false, safeEnd, safeStack };
}

/** Close whatever is still open, in reverse, so a cut-off reply parses. */
function closeOpen(stack: string[]): string {
  return [...stack].reverse().map((open) => (open === "{" ? "}" : "]")).join("");
}

/** How many items survived, for the note — counted on arrays, which is what gets cut. */
function countItems(value: any): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    return Object.values(value).reduce((total: number, v) => total + (Array.isArray(v) ? v.length : 0), 0);
  }
  return 0;
}

export type ParseOptions = {
  /** Anthropic's own word for why the reply ended. "max_tokens" means cut off. */
  stopReason?: string | null;
  /** For the log, and for telling the owner what it cost. */
  outputTokens?: number | null;
  /** What this call allowed, so a cut-off reply can say what to change. */
  maxTokens?: number | null;
};

/**
 * The JSON object in a model reply, read as tolerantly as is honest.
 *
 * Tolerant about SHAPE — prose around it, fences, a brace in a sentence,
 * a reply cut off mid-list — and never tolerant about pretending. A
 * salvaged answer comes back with `partial: true` and a note saying so;
 * an unreadable one comes back with the cause named.
 */
export function parseModelJson(text: string, opts: ParseOptions = {}): ModelJsonResult {
  const body = String(text ?? "").replace(/```json|```/gi, "");
  const cutOff = opts.stopReason === "max_tokens";

  // Every "{" is a candidate start: the first one may be inside the
  // model's own prose ("here's what I found: {details below}"), and the
  // real object is the next one.
  const starts: number[] = [];
  for (let i = 0; i < body.length; i++) if (body[i] === "{") starts.push(i);
  if (starts.length === 0) {
    return {
      ok: false,
      cause: cutOff ? "truncated" : "no_json",
      detail: `no "{" in ${body.length} characters of reply`,
      message: cutOff
        ? "The answer was cut off before it produced anything I could read. Ask me again and I'll keep it shorter."
        : "The model replied with prose instead of the structured answer this needs, so there was nothing to read.",
    };
  }

  let truncatedCandidate: { json: string; stack: string[]; at: number } | null = null;

  for (const start of starts.slice(0, 5)) {
    const found = scan(body, start);
    if (found.complete) {
      try {
        return { ok: true, value: JSON.parse(body.slice(start, found.end)), partial: false, note: null };
      } catch {
        // Balanced but not valid — an unescaped quote or newline inside a
        // string. Try salvaging to the last complete element.
        if (found.safeEnd > start) {
          truncatedCandidate = { json: body.slice(start, found.safeEnd), stack: found.safeStack, at: start };
          break;
        }
        continue;
      }
    }
    // THE OUTER OBJECT'S SALVAGE BEATS AN INNER OBJECT'S COMPLETENESS.
    //
    // Stopping here is the whole correctness of this loop. A truncated
    // reply's FIRST "{" is the real answer; the second is the first item
    // inside it, and that one is complete. Carrying on to the next start
    // returned `{"item":"Jar candle","price":"₹1,450"}` — one item,
    // presented as the whole answer, with partial:false. Confidently
    // wrong, which is worse than the generic failure this replaces.
    if (found.safeEnd > start) {
      truncatedCandidate = { json: body.slice(start, found.safeEnd), stack: found.safeStack, at: start };
      break;
    }
  }

  // SALVAGE. The reply was cut off, or malformed past a point — keep the
  // complete items and say the answer is partial. Paid work, not thrown
  // away because its last item was half-written.
  if (truncatedCandidate) {
    try {
      const value = JSON.parse(truncatedCandidate.json + closeOpen(truncatedCandidate.stack));
      const kept = countItems(value);
      return {
        ok: true,
        value,
        partial: true,
        note: `This answer is incomplete — the model's reply was cut off${opts.outputTokens ? ` after ${opts.outputTokens} tokens` : ""}, so ${kept > 0 ? `only the ${kept} complete item${kept === 1 ? "" : "s"} are shown` : "only part of it is shown"}. Ask for fewer items and I can give you the whole answer.`,
      };
    } catch {
      // Fall through: even the salvage doesn't parse.
    }
  }

  return {
    ok: false,
    cause: cutOff ? "truncated" : "malformed",
    detail: cutOff
      ? `reply cut off at max_tokens${opts.maxTokens ? ` (${opts.maxTokens})` : ""} after ${opts.outputTokens ?? "?"} output tokens, with no complete item to keep`
      : `balanced JSON found but it would not parse (${body.length} characters of reply)`,
    message: cutOff
      ? `The answer was cut off before a single complete item was finished${opts.maxTokens ? `, at this call's ${opts.maxTokens}-token limit` : ""}. Ask for fewer items and it will fit.`
      : "The model's answer came back malformed — not my data or yours, and not something you did. Running it again usually fixes it.",
  };
}

/** What the owner is told when paid work produced nothing usable. */
export function wastedCallNote(result: Extract<ModelJsonResult, { ok: false }>, costInr: number): string {
  const spent = costInr > 0 ? ` This attempt still cost about ₹${costInr.toFixed(2)}, so I've said what went wrong rather than just asking you to try again.` : "";
  return `${result.message}${spent}`;
}
