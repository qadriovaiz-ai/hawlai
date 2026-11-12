// Asking for the report, and the email being a second decision — R3.
//
// R2b stopped the daily email on the founder's decision: the agent
// keeps working in the background, and a report is something he asks
// for. Between R2b and this, there was no way to get one at all — said
// in R2b's commit rather than discovered later.
//
// HIS TWO CONDITIONS, in his words: the report comes from a dashboard
// button AND from chat, and "Email bhi bhejo" is a separate button —
// no email by default. Both are asserted here, and the second one is
// the kind of thing that decays quietly: a convenience that mails a
// copy "while we're at it" would break it without failing anything
// else.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";
import { TOOL_FAMILIES, familyOf } from "@/lib/businessBrain/toolRegistry";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";

const BUILD = "src/app/api/growth/report/route.ts";
const SEND = "src/app/api/growth/report/send/route.ts";
const PANEL = "src/components/strategy/GrowthReportPanel.tsx";

describe("1. ASKING FOR A REPORT SENDS NOTHING", () => {
  it("THE BUILD ROUTE HAS NO SENDER IN IT AT ALL", () => {
    // THE LOAD-BEARING ONE. "Report dikhao" is not "report email
    // karo", and the founder said so in those words.
    const src = code(BUILD);
    for (const sender of ["sendDealerEmail", "sendMarketingEmail", "ownerEmail"]) {
      expect(src, `${sender} must not be reachable from building a report`).not.toContain(sender);
    }
  });

  it("IT BUILDS FROM THE SAME TWO HALVES THE DAILY WORK USES", () => {
    // So the screen and the background agent cannot disagree about
    // what the report says.
    const src = code(BUILD);
    expect(src).toMatch(/runGrowthWork\(service, dealershipId\)/);
    expect(src).toMatch(/buildGrowthReport\(service, dealershipId, work\)/);
  });

  it("AND IT LOOKS NOW, rather than serving this morning's answer", () => {
    // The work runs before the report: "give me a report" means "look
    // and tell me".
    const src = code(BUILD);
    expect(src.indexOf("runGrowthWork")).toBeLessThan(src.indexOf("buildGrowthReport"));
  });

  it("the session decides whose business it is, and the service client does the writing", () => {
    // The work records findings and goal drafts, which RLS does not
    // grant a client — the same shape the approvals executor uses.
    const src = code(BUILD);
    expect(src).toContain('from("profiles")');
    expect(src).toContain("dealership_id");
    expect(src).toMatch(/createServiceClient\(\)/);
    // THE CALL, NOT THE IMPORT. indexOf("createServiceClient") lands on
    // the import at the top of the file and inverts the ordering —
    // the third time this exact fault has shown up in this session.
    expect(src.indexOf("auth.getUser")).toBeLessThan(src.indexOf("createServiceClient()"));
  });

  it("AND WHAT WAS LEFT OUT TRAVELS WITH IT", () => {
    // The email has said "I left 1 thing out" since 3 November, and
    // the answer to "which thing" lived only in a log line.
    expect(code(BUILD)).toMatch(/leftOut: result\.leftOut/);
    expect(code(PANEL)).toMatch(/leftOut\.length/);
  });
});

describe("2. THE EMAIL IS A SEPARATE DECISION", () => {
  it("IT IS A ROUTE OF ITS OWN, reached by its own click", () => {
    const panel = code(PANEL);
    expect(panel).toMatch(/\/api\/growth\/report\/send/);
    // And the build call carries no flag that would make it send.
    expect(panel).toMatch(/fetch\("\/api\/growth\/report", \{ method: "POST" \}\)/);
  });

  it("THE BUTTON ONLY EXISTS ONCE THERE IS A REPORT", () => {
    // Nothing can be emailed before the owner has seen it.
    // SLICED TO THE BUTTON. `{report && (` appears twice in this panel
    // — once for the button, once for the report body — so matching the
    // word anywhere let a mutation that unguarded the BUTTON survive.
    const panel = code(PANEL);
    const button = panel.slice(0, panel.indexOf("Email it to me as well"));
    expect(button.length).toBeGreaterThan(100);
    expect(button.slice(-400)).toMatch(/\{report && \(/);
    expect(panel).toMatch(/Email it to me as well/);
  });

  it("THE ADDRESS IS THE ACCOUNT'S, NEVER THE REQUEST'S", () => {
    // A recipient travelling on the body would make this a way to
    // mail anyone at all.
    const src = code(SEND);
    expect(src).toMatch(/ownerEmail\(dealership\?\.owner_id \?\? null\)/);
    expect(src).not.toMatch(/body\.(to|email|recipient)/);
  });

  it("AND IT WILL ONLY MAIL A REPORT", () => {
    // Not free text: the shape is checked before anything is sent.
    const src = code(SEND);
    // THE PAREN MATTERS: /function isReport/ also matches
    // `function isReportUnused`, which is how a rename survived.
    expect(src).toMatch(/function isReport\(/);
    expect(src).toMatch(/if \(!isReport\(body\?\.report\)\)/);
    expect(src.indexOf("isReport(body?.report)")).toBeLessThan(src.indexOf("sendDealerEmail"));
  });

  it("clicking twice does not send twice", () => {
    expect(code(SEND)).toMatch(/idempotencyKey: `growth-report-on-demand-/);
  });

  it("AND IT SAYS WHERE IT WENT, or why it did not", () => {
    // A button that always reads "sent" is a button nobody believes
    // the third time.
    const src = code(SEND);
    expect(src).toMatch(/to: ok \? to : null/);
    expect(code(PANEL)).toMatch(/Sent to \{sentTo\}/);
  });

  it("WHY THIS ONE SEND IS NOT APPROVAL-GATED IS WRITTEN DOWN", () => {
    // Rule 6 gates what the product does toward OTHER people. This
    // mails the owner a copy of what he is looking at, on his own
    // click. The reasoning has to be findable, or the next reader
    // either copies it somewhere it does not belong or rips it out.
    const src = sourceWithComments(SEND);
    expect(src).toMatch(/Rule 6/);
    expect(src).toMatch(/his own address|own account/i);
  });
});

describe("3. CHAT ASKS THE SAME WAY, AND ALSO SENDS NOTHING", () => {
  const brain = () => code("src/lib/agents/masterBrainV2.ts");

  function toolCase(name: string): string {
    const src = brain();
    const start = src.indexOf(`case "${name}": {`);
    expect(start, `${name} has no case`).toBeGreaterThan(-1);
    const rest = src.slice(start);
    return rest.slice(0, rest.indexOf('\n    case "'));
  }

  it("THE TOOL EXISTS AND IS THE 60TH", () => {
    expect(TOOLS.map((t: any) => t.name)).toContain("get_growth_report");
    expect(TOOLS).toHaveLength(60);
  });

  it("IT IS APPENDED, so the prompt-cache prefix is not broken", () => {
    // The cached prefix is the array up to the marker. A tool slotted
    // into the middle misses the cache on every tool after it, on
    // every turn, until it warms again.
    expect((TOOLS[TOOLS.length - 1] as any).name).toBe("get_growth_report");
  });

  it("THE TOOL CASE CALLS NO SENDER", () => {
    const body = toolCase("get_growth_report");
    for (const sender of ["sendDealerEmail", "sendMarketingEmail", "ownerEmail"]) {
      expect(body, sender).not.toContain(sender);
    }
  });

  it("AND IT SAYS NOTHING WAS EMAILED, so the reply cannot imply a copy is coming", () => {
    const body = toolCase("get_growth_report");
    expect(body).toMatch(/emailed: false/);
    expect(body).toMatch(/howToEmail/);
  });

  it("IT IS CLASSIFIED AS A WRITER, because building a report writes", () => {
    // Running the work records findings, writes goal drafts and marks
    // what the report showed. Labelling it "read" is the first lie the
    // reachability walker would catch — and that walker is what makes
    // the registry worth having.
    expect(familyOf("get_growth_report")).toBe("Internal");
    expect(TOOL_FAMILIES.get_growth_report).not.toBe("read");
  });

  it("and chat uses the same two halves as the page", () => {
    const body = toolCase("get_growth_report");
    expect(body).toMatch(/runGrowthWork\(supabase, ctx\.id\)/);
    expect(body).toMatch(/buildGrowthReport\(supabase, ctx\.id, work\)/);
  });
});
