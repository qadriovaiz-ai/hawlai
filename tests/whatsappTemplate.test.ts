// Sending a template — H3-b.
//
// ──────────────────────────────────────────────────────────────────
// WHY A TEMPLATE EXISTS AT ALL. Outside WhatsApp's 24-hour session
// window Meta accepts nothing else, and an approval can be raised at
// any hour — so most notices fall outside it. channelRules encodes
// that, and H3-c extended it to constrain THIS function separately:
// the one-sender rule named only sendWhatsAppText/Image, so a template
// sender was invisible to it.
//
// THE FAILURE MODE THIS FILE IS MOSTLY ABOUT. Meta refuses a bad
// variable AT SEND TIME, not at approval — a newline, a tab, four
// consecutive spaces, or an empty value. The template passes review
// either way. And the refusal arrives on the one path where the owner
// cannot be told about it: the notice's own error reply would travel
// the same broken sender, so he would get NOTHING and the only trace
// would be a Vercel log line. That is exactly M1's shape, and it is
// why the value is collapsed and capped here rather than trusted.
//
// UNVERIFIED AGAINST A LIVE SEND. approval_waiting_v2 was submitted on
// 23 November 2026 and is PENDING. The live run is H3-f.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { templateVariable, sendWhatsAppTemplate } from "@/lib/whatsapp/metaClient";
import { code } from "./helpers/source";

let sent: any[] = [];

function metaAnswers(status = 200, body: any = { messages: [{ id: "wamid.TEST" }] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify(body), { status });
    })
  );
}

beforeEach(() => {
  sent = [];
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1463053730225912";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
});

describe("1. A VARIABLE IS MADE SENDABLE, OR NOTHING IS SENT", () => {
  it("A NEWLINE IS COLLAPSED, because Meta refuses one at send time", () => {
    // THE LOAD-BEARING ONE. The stored `confirm` is composed from a
    // caller's sentence plus the dispatcher's clause, and nothing
    // promises it is one line.
    expect(templateVariable("Send the email.\nThis cannot be taken back.")).toBe(
      "Send the email. This cannot be taken back."
    );
  });

  it("AND SO ARE TABS AND LONG RUNS OF SPACES", () => {
    // Four or more consecutive spaces is its own refusal, separate
    // from the newline one.
    expect(templateVariable("Home page  ·\t\tSearch title     changed")).toBe("Home page · Search title changed");
    expect(templateVariable("a\t\tb")).not.toMatch(/\t/);
    expect(templateVariable("a     b")).not.toMatch(/ {2}/);
  });

  it("AN EMPTY VALUE THROWS RATHER THAN SENDING A BLANK", () => {
    // Asking the owner to approve a blank is worse than the notice not
    // arriving: he cannot tell what it is, and he might say yes.
    for (const empty of ["", "   ", "\n\n", "\t", null as any, undefined as any]) {
      expect(() => templateVariable(empty), JSON.stringify(empty)).toThrow(/came out empty/);
    }
  });

  it("A LONG VALUE IS CAPPED, and says it was", () => {
    // propose_page_meta's summary is the one that gets long — two
    // before/after pairs joined with " · ".
    const long = "x".repeat(900);
    const out = templateVariable(long);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith("…"), "a truncated value pretends to be whole").toBe(true);
  });

  it("and a value that already fits is returned untouched", () => {
    expect(templateVariable("Send the Diwali email to 40 customers.")).toBe("Send the Diwali email to 40 customers.");
  });
});

describe("2. THE PAYLOAD IS THE SHAPE META DOCUMENTS", () => {
  it("IT IS A TEMPLATE SEND, NAMED, WITH POSITIONAL BODY PARAMETERS", async () => {
    metaAnswers();
    await sendWhatsAppTemplate("918115015907", {
      name: "approval_waiting_v2",
      variables: ["Candle by Qaaf", "Send the Diwali email to 40 customers.", "A3F2"],
    });
    expect(sent.length).toBe(1);
    const body = sent[0].body;
    expect(body.messaging_product, "the field Graph refuses a send without").toBe("whatsapp");
    expect(body.type).toBe("template");
    expect(body.to).toBe("918115015907");
    expect(body.template.name).toBe("approval_waiting_v2");
    expect(body.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Candle by Qaaf" },
          { type: "text", text: "Send the Diwali email to 40 customers." },
          { type: "text", text: "A3F2" },
        ],
      },
    ]);
  });

  it("THE ORDER IS THE ARRAY'S ORDER, because {{1}}{{2}}{{3}} are positional", async () => {
    // A count or order that does not match the APPROVED body is Graph
    // 132000 — an error about parameter counts, not about the thing
    // that is wrong. So the array order is the contract.
    metaAnswers();
    await sendWhatsAppTemplate("918115015907", { name: "t", variables: ["first", "second", "third"] });
    expect(sent[0].body.template.components[0].parameters.map((p: any) => p.text)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("THE LANGUAGE IS SENT, because a template is approved per language", async () => {
    // `en` against an `en_US` approval fails as "template not found",
    // which reads like the template was never approved at all.
    metaAnswers();
    await sendWhatsAppTemplate("918115015907", { name: "t", variables: ["a"] });
    expect(sent[0].body.template.language).toEqual({ code: "en" });
    sent = [];
    await sendWhatsAppTemplate("918115015907", { name: "t", language: "en_US", variables: ["a"] });
    expect(sent[0].body.template.language).toEqual({ code: "en_US" });
  });

  it("IT GOES TO THE PHONE NUMBER ID, not to a phone number", async () => {
    metaAnswers();
    await sendWhatsAppTemplate("918115015907", { name: "t", variables: ["a"] });
    expect(sent[0].url).toContain("/1463053730225912/messages");
    expect(sent[0].url).toContain("graph.facebook.com");
  });

  it("a template with no variables sends no body component at all", async () => {
    // An empty `parameters` array is itself a 132000 on some templates.
    metaAnswers();
    await sendWhatsAppTemplate("918115015907", { name: "t", variables: [] });
    expect(sent[0].body.template.components).toEqual([]);
  });
});

describe("3. A REFUSAL IS REPORTED IN META'S OWN WORDS", () => {
  it("THE GRAPH ERROR TRAVELS, because the status code does not explain it", async () => {
    metaAnswers(400, {
      error: { message: "(#132000) Template param count mismatch", code: 132000, fbtrace_id: "Abc123" },
    });
    await expect(
      sendWhatsAppTemplate("918115015907", { name: "t", variables: ["a"] })
    ).rejects.toThrow(/Template param count mismatch/);
  });

  it("AND NOTHING IS SENT WHEN A VARIABLE CANNOT BE MADE VALID", async () => {
    // The throw happens BEFORE the request, so a bad variable costs no
    // call and leaves no half-sent state.
    metaAnswers();
    await expect(
      sendWhatsAppTemplate("918115015907", { name: "t", variables: ["fine", "   "] })
    ).rejects.toThrow(/came out empty/);
    expect(sent.length, "Graph was called with a variable Meta would refuse").toBe(0);
  });

  it("an unconfigured deploy refuses rather than reporting a send", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    metaAnswers();
    await expect(sendWhatsAppTemplate("918115015907", { name: "t", variables: ["a"] })).rejects.toThrow(
      /WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN/
    );
    expect(sent.length).toBe(0);
  });
});

describe("4. THE SWITCH STAYS THE ONE PLACE THAT CHOOSES", () => {
  it("THE TEMPLATE SEND GOES THROUGH activeProvider LIKE THE OTHER TWO", () => {
    const src = code("src/lib/whatsapp/client.ts");
    expect(src).toMatch(/PROVIDERS\[activeProvider\(\)\]\.sendTemplate\(/);
  });

  it("AND GUPSHUP REFUSES RATHER THAN FALLING BACK TO FREE-FORM TEXT", () => {
    // A template exists because the window has CLOSED. Sending text
    // instead would be refused by the provider anyway, while the code
    // read as though the notice went out.
    const src = code("src/lib/whatsapp/client.ts");
    const at = src.indexOf("gupshup: {");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf("};", at));
    expect(block).toMatch(/sendTemplate: async \(\) => \{\s*throw new Error\(/);
    expect(block, "gupshup quietly sends text when a template was asked for").not.toMatch(
      /sendTemplate: gupshup\.sendWhatsAppText/
    );
  });

  it("and the chooser still does not know how to talk to an API", () => {
    // channelRules asserts this too; repeated here because this is the
    // commit that added a third thing to choose between.
    const src = code("src/lib/whatsapp/client.ts");
    expect(src).not.toMatch(/graph\.facebook\.com|api\.gupshup\.io/);
  });
});
