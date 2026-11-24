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

  it("AND NO BUTTON COMPONENT WHEN THERE IS NO PAYLOAD TO SET", async () => {
    // A button component for a template that has no button is its own
    // 132000, so this must not be sent unconditionally.
    metaAnswers();
    await sendWhatsAppTemplate("918115015907", { name: "t", variables: ["a"] });
    expect(sent[0].body.template.components.some((c: any) => c.type === "button")).toBe(false);
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

// ──────────────────────────────────────────────────────────────────
// H3-e — WHEN THE NOTICE GOES TO WHATSAPP AT ALL
//
// Split out of notifyOwner.ts rather than added to it: an assertion
// there has held since H3's branch that the file contains no
// `sendWhatsApp` at all, and relaxing it would have been a test edited
// to fit a change. The code moved instead — the third time in this
// feature, and the same answer each time.
// ──────────────────────────────────────────────────────────────────

import { freeFormStillAllowed, approvalTemplateName, whatsappApprovalNotice } from "@/lib/approvals/whatsappNotice";

const VERIFIED = {
  dealership_name: "candle_by_qaaf",
  owner_whatsapp_number: "918115015907",
  owner_whatsapp_verified: true,
};

/** A client that answers the session read and nothing else. */
const sessionAt = (updated_at: string | null) => ({
  from: () => {
    const api: any = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: updated_at === null ? null : { updated_at }, error: null }),
    };
    return api;
  },
});

describe("5. THE SESSION WINDOW, AND WHICH WAY IT IS ALLOWED TO BE WRONG", () => {
  const now = Date.UTC(2026, 10, 23, 20, 0, 0);
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

  it("A RECENT EXCHANGE MEANS FREE-FORM IS STILL LEGAL", () => {
    expect(freeFormStillAllowed(hoursAgo(1), now)).toBe(true);
    expect(freeFormStillAllowed(hoursAgo(23.9), now)).toBe(true);
  });

  it("AND PAST 24 HOURS IT IS NOT", () => {
    expect(freeFormStillAllowed(hoursAgo(24.1), now)).toBe(false);
    expect(freeFormStillAllowed(hoursAgo(72), now)).toBe(false);
  });

  it("NO RECORD AND AN UNREADABLE ONE BOTH READ AS CLOSED", () => {
    // THE DIRECTION IS THE POINT. Unknown must never read as "open":
    // free-form outside the window is refused by the provider, and the
    // refusal arrives where nobody can be told about it.
    for (const bad of [null, undefined, "", "not a date", "0000-13-45"]) {
      expect(freeFormStillAllowed(bad as any, now), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("6. THE WHATSAPP LEG IS OFF UNTIL A TEMPLATE IS NAMED", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_APPROVAL_TEMPLATE;
    // THE CHOOSER IS IN THE PATH HERE, unlike section 2 which calls the
    // Meta client directly. whatsappApprovalNotice goes through
    // client.ts, which refuses when WHATSAPP_PROVIDER is unset — the
    // fail-closed behaviour that dropped the first two live deliveries
    // in M4. So the provider is declared, as a deploy would.
    process.env.WHATSAPP_PROVIDER = "meta";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_APPROVAL_TEMPLATE;
    delete process.env.WHATSAPP_PROVIDER;
  });

  it("NO TEMPLATE NAMED, NOTHING SENT — which is today's state", async () => {
    // THE LOAD-BEARING ONE WHILE approval_waiting_v2 IS PENDING.
    // Sending against an unapproved template fails every time, and
    // that failure cannot reach the owner.
    metaAnswers();
    expect(approvalTemplateName()).toBeNull();
    expect(await whatsappApprovalNotice(sessionAt(null), VERIFIED, "a3f29c10-1111", "Send it.")).toBe(false);
    expect(sent.length).toBe(0);
  });

  it("AN UNVERIFIED NUMBER IS NEVER MESSAGED", async () => {
    // The same check the inbound webhook makes before acting as the
    // owner. Messaging an unverified number is that hole from the
    // other side.
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_waiting_v2";
    metaAnswers();
    for (const business of [
      { ...VERIFIED, owner_whatsapp_verified: false },
      { ...VERIFIED, owner_whatsapp_verified: null },
      { ...VERIFIED, owner_whatsapp_number: "" },
      { ...VERIFIED, owner_whatsapp_number: null },
    ]) {
      expect(await whatsappApprovalNotice(sessionAt(null), business as any, "a3f29c10-1111", "Send it.")).toBe(false);
    }
    expect(sent.length).toBe(0);
  });

  it("WITH A TEMPLATE NAMED AND A VERIFIED NUMBER, IT SENDS — in the approved order", async () => {
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_waiting_v2";
    metaAnswers();
    expect(
      await whatsappApprovalNotice(sessionAt(null), VERIFIED, "a3f29c10-1111-2222-3333-444444444444", "Send the Diwali email to 40 customers.")
    ).toBe(true);
    expect(sent.length).toBe(1);
    expect(sent[0].body.template.name).toBe("approval_waiting_v2");
    expect(sent[0].body.template.components[0].parameters.map((p: any) => p.text)).toEqual([
      // The handle becomes words — businessDisplayName, not the raw
      // signup handle, which is what a customer-facing name would be.
      "Candle by Qaaf",
      "A3F2",
    ]);
  });

  it("AND `confirm` IS NEVER IN THE TEMPLATE, which is what recategorised the first one", async () => {
    // THE LOAD-BEARING ONE AFTER 24 NOVEMBER 2026. Meta read
    // approval_waiting_v2 as MARKETING — "did not meet our utility
    // guidelines" — and the cause is structural: `confirm` is a
    // sentence about marketing work, so any template filled with it
    // reads as marketing however the rest is worded. The sample value
    // is part of what gets classified.
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_pending_notice";
    metaAnswers();
    await whatsappApprovalNotice(
      sessionAt(null),
      VERIFIED,
      "a3f29c10-1111-2222-3333-444444444444",
      "Send the Diwali email to 40 customers."
    );
    const payload = JSON.stringify(sent[0].body);
    expect(payload, "the confirm sentence reached the template").not.toContain("Diwali");
    expect(payload).not.toContain("40 customers");
    expect(sent[0].body.template.components[0].parameters.length, "the template still carries three variables").toBe(2);
  });

  it("AND THE TAP CARRIES THE ROW'S OWN ID, so the reply is a lookup not a guess", async () => {
    // The approved template stores no payload of its own — read off
    // Graph on 24 November 2026 — so without this a tap would come
    // back carrying nothing to look up.
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_pending_notice";
    metaAnswers();
    const id = "a3f29c10-1111-2222-3333-444444444444";
    await whatsappApprovalNotice(sessionAt(null), VERIFIED, id, "Send it.");
    const button = sent[0].body.template.components.find((c: any) => c.type === "button");
    expect(button, "no button component was sent").toBeTruthy();
    expect(button.sub_type).toBe("quick_reply");
    expect(button.index).toBe("0");
    expect(button.parameters).toEqual([{ type: "payload", payload: id }]);
  });

  it("AND A TEMPLATE IS SENT INSIDE THE WINDOW TOO, not free-form", async () => {
    // channelRules permits free-form from the webhook ONLY, because
    // that is the file that can know somebody just messaged. This one
    // has a proxy, and a proxy is not a basis for choosing the shape
    // that is illegal when it guesses wrong.
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_waiting_v2";
    metaAnswers();
    await whatsappApprovalNotice(sessionAt(new Date().toISOString()), VERIFIED, "a3f29c10-1111", "Send it.");
    expect(sent.length).toBe(1);
    expect(sent[0].body.type, "a free-form message was sent inside the window").toBe("template");
  });

  it("AND `verified` IS CHECKED STRICTLY, not for truthiness", async () => {
    // FOUND BY MUTATION. The falsy cases above (false, null) pass
    // either guard, so `!verified` survived — the difference only
    // shows for a TRUTHY NON-TRUE value, which is what a boolean
    // arriving as a string looks like. Same class as Shopify's
    // publish state having to be strictly boolean.
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_waiting_v2";
    metaAnswers();
    for (const verified of ["false", "no", 0 as any, 1 as any, "true"]) {
      expect(
        await whatsappApprovalNotice(sessionAt(null), { ...VERIFIED, owner_whatsapp_verified: verified } as any, "a3f29c10-1111", "Send it."),
        JSON.stringify(verified)
      ).toBe(false);
    }
    expect(sent.length, "a number whose verified flag was not literally true was messaged").toBe(0);
  });

  it("AND THE NAME COMES FROM THE ENV, not from a literal in the code", async () => {
    // FOUND BY MUTATION. Every test above happened to use the real
    // name, so hardcoding `approval_waiting_v2` survived — and a
    // hardcoded name is how a second template, or a renamed one, sends
    // against something Meta never approved.
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "some_other_template_v9";
    metaAnswers();
    await whatsappApprovalNotice(sessionAt(null), VERIFIED, "a3f29c10-1111", "Send it.");
    expect(sent[0].body.template.name).toBe("some_other_template_v9");
  });

  it("the code in the message is the code H2 resolves", async () => {
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "t";
    metaAnswers();
    const id = "bd7e0000-1111-2222-3333-444444444444";
    await whatsappApprovalNotice(sessionAt(null), VERIFIED, id, "Do it.");
    const { approvalCode } = await import("@/lib/whatsapp/approvalReply");
    expect(sent[0].body.template.components[0].parameters[1].text).toBe(approvalCode(id));
  });
});
