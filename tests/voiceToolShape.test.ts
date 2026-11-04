// THE VOICE TOOL LIST, AND WHERE ITS SHAPE COMES FROM — S6/P3b.
//
// `vapiCallAgent` builds a real `model.tools` array from this registry
// and sends it with every outbound call. So this file is about a live
// path: what the voice assistant is told it can do, and with which
// arguments.
//
// THE BUG P3b CLOSES. The registry kept its own `parameters` map for
// tools that ALSO have a chat schema — a second copy — and four of them
// had already drifted apart (measured 2026-11-04): `trigger_call` said
// `leadId` where the tool takes `leadName`, `send_email` said `to`
// where it takes `recipient`, and two were missing a field each. None
// of the four was call-enabled, so none was a live fault; the next one
// to be given a voice channel would have been.
//
// AND THE THING THAT IS NOT A BUG, which the first version of this
// phase would have broken. The DESCRIPTIONS differ on purpose: the
// schema's are written for the chat model and shout at it ("USE THIS
// when someone asks to…", "Pass it exactly. Never invent one."), and
// the registry's are written for a voice assistant reading a function
// list. Deriving those from the schema would push chat-prompt phrasing
// into a live call.
//
// SO: THE SHAPE HAS ONE SOURCE, THE WORDING HAS TWO AUDIENCES. Keys,
// types and `required` come from the schema and cannot disagree with
// it. A description may be overridden per channel, and that is a
// decision rather than a copy.
//
// THE SNAPSHOT BELOW WAS TAKEN BEFORE ANY OF THIS CHANGED. It is the
// exact JSON the two chat+call tools were sending, so the derivation
// has to reproduce it byte for byte — a refactor of a live voice path
// proves itself by not moving.

import { describe, it, expect } from "vitest";
import {
  BUSINESS_BRAIN_TOOLS,
  callParametersFor,
  getCallEnabledVapiTools,
  toVapiFunctionDefinition,
} from "@/lib/businessBrain/toolRegistry";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";

const schemaFor = (name: string) => (TOOLS as any[]).find((t) => t.name === name);

/** Taken 2026-11-04, before the derivation existed. */
const SNAPSHOT_BEFORE = {
  pause_meta_campaign: {
    type: "function",
    function: {
      name: "pause_meta_campaign",
      description:
        "Pause a running Meta campaign immediately, stopping spend. No approval — stopping spend is reversible and urgent. Confirms with Meta that delivery stopped.",
      parameters: {
        type: "object",
        properties: {
          campaign_description: { type: "string", description: "Which campaign, in their words" },
          campaign_id: { type: "string", description: "Only on a follow-up, after a numbered list was shown" },
        },
        required: [],
      },
    },
  },
  update_website_url: {
    type: "function",
    function: {
      name: "update_website_url",
      description:
        "Save the business's website address to their settings, from the chat. Confirmed in two steps — shows what will change, writes only after the person agrees — because this address is what ads fall back to when there is no specific product page.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The website address as they gave it; a bare domain is fine" },
          confirmed: { type: "boolean", description: "Only on the second call, after they have agreed in chat" },
        },
        required: ["url"],
      },
    },
  },
};

describe("1. THE LIVE VOICE LIST DID NOT MOVE", () => {
  it("THE TWO CHAT+CALL TOOLS SEND EXACTLY WHAT THEY SENT BEFORE", () => {
    // The whole justification for touching this at all: the shape now
    // comes from the schema, and the output is identical. If this ever
    // fails, a voice call is being told something different about what
    // it can do — and that is not a refactor.
    const live = getCallEnabledVapiTools();
    for (const [name, expected] of Object.entries(SNAPSHOT_BEFORE)) {
      const actual = live.find((t: any) => t.function.name === name);
      expect(actual, `${name} is no longer offered on calls`).toBeTruthy();
      expect(actual).toEqual(expected);
    }
  });

  it("AND THE RENDERER USES THE RESOLVER FOR EVERY TOOL, not just the call-enabled ones", () => {
    // THE GAP THIS CLOSES, found by its own mutation. The snapshot
    // above cannot see this: the two call-enabled tools have their own
    // override maps, and those maps produce exactly the snapshot -
    // which is where the snapshot came from. So reverting the renderer
    // to read `tool.parameters` directly left the live output
    // unchanged and the test green.
    //
    // A chat-only tool with PARTIAL overrides is what tells them
    // apart: send_email overrides two descriptions and the schema has
    // eight arguments.
    const send = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "send_email")!;
    const rendered: any = toVapiFunctionDefinition(send);
    const keys = Object.keys(rendered.function.parameters.properties).sort();
    expect(keys).toEqual(Object.keys(schemaFor("send_email").input_schema.properties).sort());
    expect(keys).toContain("recipient");
    expect(keys.length).toBeGreaterThan(Object.keys(send.parameters ?? {}).length);
    expect(rendered.function.parameters.required.sort()).toEqual(
      [...schemaFor("send_email").input_schema.required].sort()
    );
  });

  it("and the call-only tools are untouched by the derivation", () => {
    // Seven tools exist only on the call channel and have no chat
    // schema, so the registry's own `parameters` IS their definition.
    // Nothing here may change them.
    const callOnly = BUSINESS_BRAIN_TOOLS.filter((t) => !schemaFor(t.name) && t.channels.includes("call"));
    expect(callOnly.length).toBeGreaterThanOrEqual(7);
    for (const entry of callOnly) {
      expect(callParametersFor(entry), entry.name).toEqual(entry.parameters ?? {});
    }
  });
});

describe("2. THE SHAPE HAS ONE SOURCE", () => {
  const withSchema = BUSINESS_BRAIN_TOOLS.filter((t) => schemaFor(t.name));

  it("there are tools with a chat schema at all, so the rest is not vacuous", () => {
    expect(withSchema.length).toBeGreaterThanOrEqual(10);
  });

  it("EVERY KEY, TYPE AND REQUIRED FLAG COMES FROM THE SCHEMA", () => {
    for (const entry of withSchema) {
      const schema = schemaFor(entry.name);
      const resolved = callParametersFor(entry);
      const props = schema.input_schema?.properties ?? {};
      expect(Object.keys(resolved).sort(), entry.name).toEqual(Object.keys(props).sort());
      for (const [key, param] of Object.entries(resolved)) {
        // An enum or array in the schema cannot be expressed in the
        // voice shape, so it narrows to the base type — stated, not
        // silently dropped: see the resolver's own comment.
        const schemaType = (props as any)[key].type;
        expect((param as any).type, `${entry.name}.${key}`).toBe(
          schemaType === "array" || schemaType === "object" ? "string" : schemaType
        );
      }
      const required = Object.entries(resolved).filter(([, p]: any) => p.required).map(([k]) => k).sort();
      expect(required, `${entry.name} required`).toEqual([...(schema.input_schema?.required ?? [])].sort());
    }
  });

  it("AND THE FOUR DRIFTS ARE GONE, by construction", () => {
    // Named, because a general rule that holds today is weaker than a
    // rule plus the cases it was written for.
    const resolved = (name: string) => Object.keys(callParametersFor(BUSINESS_BRAIN_TOOLS.find((t) => t.name === name)!));
    expect(resolved("trigger_call")).toEqual(["leadName"]);
    expect(resolved("trigger_call")).not.toContain("leadId");
    expect(resolved("send_email")).toContain("recipient");
    expect(resolved("send_email")).not.toContain("to");
    expect(resolved("launch_meta_campaign")).toContain("use_generated_image");
    expect(resolved("propose_price_change")).toContain("new_name");
  });

  it("NO ENTRY MAY NAME A KEY ITS SCHEMA DOES NOT HAVE", () => {
    // The drifts above were exactly this: an override for an argument
    // the tool does not take. Silently ignoring it would leave the
    // wrong word in the file for the next person to trust.
    const offences: string[] = [];
    for (const entry of withSchema) {
      const props = Object.keys(schemaFor(entry.name).input_schema?.properties ?? {});
      for (const key of Object.keys(entry.parameters ?? {})) {
        if (!props.includes(key)) offences.push(`${entry.name}.${key} is not an argument of that tool`);
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });
});

describe("3. THE WORDING MAY DIFFER, AND SAYS SO", () => {
  it("A REGISTRY DESCRIPTION OVERRIDES THE SCHEMA'S, for the voice audience", () => {
    const pause = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "pause_meta_campaign")!;
    const resolved = callParametersFor(pause);
    expect(resolved.campaign_id.description).toBe(pause.parameters!.campaign_id.description);
    // And it is NOT the chat model's version, which shouts.
    expect(resolved.campaign_id.description).not.toMatch(/FOLLOW-UP|Never invent/);
  });

  it("AND WITHOUT AN OVERRIDE IT FALLS BACK TO THE SCHEMA'S", () => {
    // So a tool given a voice channel tomorrow is described rather
    // than blank — the fallback is the reason the shape can come from
    // the schema at all.
    const send = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "send_email")!;
    const resolved = callParametersFor(send);
    const schema = schemaFor("send_email");
    expect(resolved.recipient.description).toBe(schema.input_schema.properties.recipient.description);
    expect(resolved.recipient.description.length).toBeGreaterThan(10);
  });

  it("and a tool-level description is still the registry's own", () => {
    const pause = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "pause_meta_campaign")!;
    const rendered: any = toVapiFunctionDefinition(pause);
    expect(rendered.function.description).toBe(pause.description);
    expect(rendered.function.description).not.toBe(schemaFor("pause_meta_campaign").description);
  });
});
