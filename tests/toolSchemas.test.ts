// THE 59 CHAT TOOL SCHEMAS, AND THE PROMPT-CACHE PREFIX THEY ARE —
// S6/P3a.
//
// The schemas moved out of `masterBrainV2.ts` (5,180 lines down to
// 4,522) into `businessBrain/toolSchemas.ts`, byte for byte. The move
// was verified against the committed file before it was made: 658
// lines, identical.
//
// WHY A FINGERPRINT AND NOT JUST A COUNT. `cachedTools()` marks the
// LAST entry with `cache_control: ephemeral`, which makes this array
// the Anthropic prompt-cache prefix. A prefix must be byte-identical
// every request or the cache misses and every chat turn pays full
// price — this project has already spent nine days of unattended
// credit on a change nobody was watching (1 November 2026). So a
// change here is allowed, sometimes necessary, and must be DELIBERATE:
// the fingerprint below fails, and whoever changed a schema updates it
// in the same commit and says why.
//
// WHAT THIS FILE DOES NOT ASSERT: that the schemas are good. What each
// tool accepts is tested where the tool is tested. This is about the
// array being one thing, in one place, in one order.

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";
import { TOOLS as REEXPORTED, cachedTools } from "@/lib/agents/masterBrainV2";
import { TOOL_FAMILIES, familyOf } from "@/lib/businessBrain/toolRegistry";
import { code, sourceWithComments } from "./helpers/source";

/**
 * The prompt-cache prefix, as it stands.
 *
 * Updated deliberately, in the same commit as the schema change, with
 * the reason in the commit message. 59 tools, 51,770 characters of
 * JSON, recorded 2026-11-04 when the array moved.
 *
 * 60 tools, recorded 2026-11-12: get_growth_report (R3). The daily
 * email stopped in R2b on the founder'"'"'s decision, so the report had to
 * become something he can ask for — from the Strategy page and from
 * chat, which were his words. The tool was APPENDED rather than slotted
 * in beside the other report tool, because the cache prefix is the
 * array up to the marker: an insertion in the middle would have missed
 * the cache on every tool after it, on every turn, until it warmed
 * again.
 */
const FINGERPRINT = "1fc019df4a8b1ae62bdceabb892e99390010a5b5abec3a0f174c149e2ff3ec0a";
const TOOL_COUNT = 60;

describe("1. ONE DEFINITION, IN ONE PLACE, IN ONE ORDER", () => {
  it("THE PROMPT-CACHE PREFIX IS WHAT IT WAS", () => {
    const json = JSON.stringify(TOOLS);
    const actual = crypto.createHash("sha256").update(json).digest("hex");
    expect(TOOLS).toHaveLength(TOOL_COUNT);
    expect(
      actual,
      `The tool schemas changed. That is allowed — but it invalidates the Anthropic prompt-cache prefix, so every chat turn pays full price until the cache warms again.\nIf the change is deliberate, update FINGERPRINT to ${actual} in this file, in the same commit, and say why in the message.`
    ).toBe(FINGERPRINT);
  });

  it("AND masterBrainV2 RE-EXPORTS THE SAME ARRAY, not a copy", () => {
    // Ten test files and every caller import `TOOLS` from
    // masterBrainV2. If the move had left a copy behind, the two would
    // drift and the cached prefix would depend on which one a caller
    // reached.
    expect(REEXPORTED).toBe(TOOLS);
  });

  it("AND THE SCHEMAS ARE NO LONGER IN masterBrainV2", () => {
    // The point of the move. A second declaration there would make
    // this file decorative.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    expect(brain).not.toMatch(/export const TOOLS = \[/);
    expect(brain).toMatch(/from "@\/lib\/businessBrain\/toolSchemas"/);
  });

  it("the cache marker is still on the last entry, and only there", () => {
    // promptCaching.test.ts owns this rule; asserted here too because
    // the move is what could have broken it.
    const cached = cachedTools();
    expect(cached).toHaveLength(TOOL_COUNT);
    expect((cached[cached.length - 1] as any).cache_control).toEqual({ type: "ephemeral" });
    expect(cached.filter((t: any) => t.cache_control)).toHaveLength(1);
  });
});

describe("2. EVERY SCHEMA IS A CLASSIFIED TOOL", () => {
  it("THE SCHEMAS AND THE FAMILIES ARE THE SAME 59 TOOLS", () => {
    // S6/P2 classified the tools by reading `executeTool`'s cases.
    // This ties the classification to the SCHEMAS as well, so a tool
    // the model can call but nobody classified cannot exist — and
    // neither can a family entry for a tool the model cannot call.
    const schemaNames = TOOLS.map((t: any) => t.name).sort();
    const classified = Object.keys(TOOL_FAMILIES).sort();
    expect(schemaNames).toEqual(classified);
  });

  it("and every schema names a family that exists", () => {
    for (const tool of TOOLS as any[]) {
      expect(familyOf(tool.name), tool.name).toBeTruthy();
    }
  });

  it("NO TWO SCHEMAS SHARE A NAME", () => {
    // A duplicate name is a tool the model can call and this product
    // cannot tell apart, and `JSON.stringify` would hide it from the
    // count above.
    const names = TOOLS.map((t: any) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("3. what the registry must not copy", () => {
  it("THE SCHEMAS KEEP WHAT THE REGISTRY'S PARAMETER SHAPE CANNOT HOLD", () => {
    // 24 of these schemas constrain a choice with an `enum`, and four
    // use an array with `items`. `BusinessBrainToolParam` is
    // string | number | boolean with a description — it can express
    // NEITHER. That is why P3b derives the registry's chat-tool
    // parameters from here and never the reverse: a definition can
    // only flow in the direction that loses nothing.
    const json = JSON.stringify(TOOLS);
    const withEnum = (TOOLS as any[]).filter((t) => JSON.stringify(t.input_schema ?? {}).includes('"enum"'));
    expect(withEnum.length).toBeGreaterThanOrEqual(20);
    expect(json).toContain('"type":"array"');
    const shape = code("src/lib/businessBrain/toolRegistry.ts");
    expect(shape).toMatch(/type: "string" \| "number" \| "boolean"/);
  });

  it("and the four entries that already disagree are named, not hidden", () => {
    // Measured 2026-11-04. None is call-enabled, so none is a live
    // fault — and P3b is where they stop being possible. Written down
    // because a drift nobody recorded is a drift somebody later calls
    // intentional.
    // sourceWithComments AND THE HEADER ONLY — both halves matter, and
    // the first version of this had neither. The note IS a comment, so
    // `code()` strips it (CLAUDE.md rule 8); and every string it looks
    // for — trigger_call, send_email, leadName, recipient — also appears
    // in the schemas below, so the assertion passed on the data while
    // the note it was about could have been deleted.
    const whole = sourceWithComments("src/lib/businessBrain/toolSchemas.ts");
    const header = whole.slice(0, whole.indexOf("import {"));
    expect(header.length, "the header is gone").toBeGreaterThan(500);
    for (const phrase of ["trigger_call", "leadName", "send_email", "recipient", "enum"]) {
      expect(header, `the drift note no longer mentions ${phrase}`).toContain(phrase);
    }
  });
});
