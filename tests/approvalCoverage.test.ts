// A NEW TOOL THAT SENDS, POSTS, CALLS OR SPENDS FAILS THIS TEST BY DEFAULT.
//
// The A-to-Z audit found five such actions reachable from one chat
// sentence with no approval anywhere: a real email, a real phone call, a
// public YouTube video, a live discount code, and the toggles that
// switch on unattended posting and emailing. Two of them had no tests at
// all. One of them — create_discount_code — was already in the policy
// registry at requiresApproval: true, and the chat simply never asked.
//
// That last detail is why this file exists. Registering an action is not
// the same as the code honouring the registration, and a human reading a
// diff will not notice the difference. This test reads the switch in
// executeTool and fails when a case that performs an outbound action is
// not routed through the gate.
//
// WHAT IT CANNOT DO: prove the approvals route carries the action out
// correctly. See the execution tests at the bottom and
// tests/approvalExecution.test.ts for that half.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { ACTION_POLICIES, AUTOMATION_TOGGLES, getActionPolicy, toggleRisk } from "@/lib/executionPolicy";
import { ALWAYS_REQUIRES_APPROVAL, ACTION_RISK } from "@/lib/publish/types";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** The body of one `case "<tool>":` block inside executeTool. */
function toolCase(tool: string): string {
  const src = readFileSync(BRAIN, "utf8");
  const start = src.indexOf("export async function executeTool");
  const end = src.indexOf("export interface ChatTurnResult");
  const body = src.slice(start, end);
  const from = body.indexOf(`\n    case "${tool}"`);
  if (from < 0) throw new Error(`no executeTool case for "${tool}"`);
  const next = body.indexOf('\n    case "', from + 10);
  return body.slice(from, next < 0 ? undefined : next);
}

function toolNames(): string[] {
  const src = readFileSync(BRAIN, "utf8");
  const start = src.indexOf("export async function executeTool");
  const end = src.indexOf("export interface ChatTurnResult");
  return [...src.slice(start, end).matchAll(/\n    case "([a-z_]+)"/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------
// The functions that actually reach the outside world.
//
// Listed by the SYMBOL that performs the act, not by tool name, so a
// renamed tool or a new one calling the same sender is still caught.
// ---------------------------------------------------------------------

const SENDERS: { symbol: RegExp; what: string }[] = [
  { symbol: /\bsendDealerEmail\s*\(/, what: "sends a real email" },
  { symbol: /\bsendMarketingEmail\s*\(/, what: "sends a real marketing email" },
  { symbol: /\btriggerVapiCall\s*\(/, what: "places a real phone call" },
  { symbol: /\buploadVideoToYouTube\s*\(/, what: "publishes a video publicly" },
  { symbol: /\bpostPhotoToPage\s*\(|\bpostTextToPage\s*\(|\bpostPhotoToInstagram\s*\(/, what: "posts publicly to a social account" },
  { symbol: /\bsendDmReply\s*\(|\bsendCommentReply\s*\(/, what: "replies to a customer" },
];

/** Direct writes that change what a customer can transact with, or switch on unattended sending. */
const STATE_WRITES: { pattern: RegExp; what: string }[] = [
  { pattern: /from\("discount_codes"\)\s*\.insert/, what: "creates a live discount code" },
  { pattern: /\{\s*\[field\]:\s*true\s*\}/, what: "switches an automation on" },
];

describe("every outbound action is gated", () => {
  it("finds the tool switch at all", () => {
    // A path or parsing mistake would make every assertion below vacuous.
    const names = toolNames();
    expect(names.length).toBeGreaterThan(50);
    expect(names).toContain("send_email");
    expect(names).toContain("trigger_call");
  });

  /**
   * The one reasoned exception, with its date.
   *
   * send_email to a TEAM MEMBER sends directly, and that is an approved
   * decision from 2026-09-14 (Part 1 step 3) with two tests behind it:
   * tests/emailPreview.ts and tests/emailConsent.ts. The recipient is an
   * active team member of the same business, already on record; no
   * customer sees it, nothing is published, nothing is spent.
   *
   * Mail to a LEAD OR CUSTOMER from the same tool is NOT exempt and is
   * already gated by a preview card, which the test below asserts.
   */
  const SENDER_EXCEPTIONS: Record<string, string> = {
    send_email: "internal mail to a team member sends directly — approved 2026-09-14, two tests encode it",
  };

  it("NO TOOL CASE CALLS A SENDER DIRECTLY", () => {
    const offences: string[] = [];
    for (const tool of toolNames()) {
      if (SENDER_EXCEPTIONS[tool]) continue;
      const body = toolCase(tool);
      for (const { symbol, what } of SENDERS) {
        if (symbol.test(body)) offences.push(`${tool} ${what} without going through requestApproval`);
      }
      for (const { pattern, what } of STATE_WRITES) {
        if (pattern.test(body)) offences.push(`${tool} ${what} without going through requestApproval`);
      }
    }
    expect(
      offences,
      `A chat tool performs an outbound action itself. It must create an approval instead:\n${offences.join("\n")}`
    ).toEqual([]);
  });

  it("THE FIVE AUDITED ACTIONS EACH ASK FIRST", () => {
    const gated: Record<string, string> = {
      trigger_call: "place_outbound_call",
      publish_to_youtube: "publish_video",
      create_discount_code: "create_discount_code",
      set_automation_toggle: "set_automation_toggle",
    };
    for (const [tool, actionType] of Object.entries(gated)) {
      const body = toolCase(tool);
      expect(body, `${tool} must call requestApproval`).toMatch(/requestApproval\s*\(/);
      expect(body, `${tool} must name the action type ${actionType}`).toContain(`actionType: "${actionType}"`);
      // And the registry must agree it needs approval.
      const policy = getActionPolicy(actionType);
      expect(policy, `${actionType} is missing from ACTION_POLICIES`).toBeTruthy();
      expect(policy!.requiresApproval, `${actionType} must require approval`).toBe(true);
    }
  });

  it("MAIL TO A CUSTOMER IS STILL GATED, by the preview card", () => {
    // The exception above covers team mail only. The customer path must
    // still propose rather than send, and must say nothing was sent.
    const body = toolCase("send_email");
    expect(body).toMatch(/proposed: true/);
    expect(body).toMatch(/NOT SENT YET/);
    // And the branch that sends is reached only for a team recipient.
    expect(body).toMatch(/if \(kind !== "team"\)/);
  });

  it("every sender exception carries a reason and a date", () => {
    for (const [tool, why] of Object.entries(SENDER_EXCEPTIONS)) {
      expect(why.length, tool).toBeGreaterThan(30);
      expect(why, `${tool}'s exception needs the date of the decision`).toMatch(/20\d\d-\d\d-\d\d/);
    }
  });

  it("switching an automation OFF needs no approval, switching it ON does", () => {
    // The safe direction must never be the slow one — the same reason
    // pause_meta_campaign is ungated by design.
    const body = toolCase("set_automation_toggle");
    expect(body).toMatch(/if \(!input\.enabled\)/);
    const [offPath, onPath] = body.split(/if \(!input\.enabled\)/)[1].split("requestApproval");
    expect(offPath, "the off path should write directly").toMatch(/\[field\]: false/);
    expect(onPath, "the on path should be the approval one").toBeTruthy();
  });

  it("every automation toggle is classified, and the dangerous ones are critical", () => {
    const fieldMap = toolCase("set_automation_toggle");
    for (const toggle of Object.keys(AUTOMATION_TOGGLES)) {
      expect(fieldMap, `${toggle} must be a toggle the tool accepts`).toContain(`${toggle}:`);
      expect(toggleRisk(toggle)).toBeTruthy();
    }
    // The four that put words in front of a customer, or dial a phone,
    // with nobody watching.
    for (const toggle of ["dm_auto_reply", "comment_auto_reply", "auto_call_new_leads", "content_autopilot"]) {
      expect(toggleRisk(toggle)!.risk, toggle).toBe("critical");
    }
  });

  it("the approvals route can actually carry out everything the tools raise", () => {
    // A tool that raises an approval nobody executes is a dead end: the
    // owner presses Approve and nothing happens.
    const route = readFileSync("src/app/api/approvals/[id]/route.ts", "utf8");
    for (const actionType of ["place_outbound_call", "publish_video", "create_discount_code", "set_automation_toggle"]) {
      expect(route, `the approvals route has no branch for ${actionType}`).toContain(`action_type === "${actionType}"`);
    }
  });

  it("requestApproval refuses an action nobody classified", async () => {
    const { requestApproval } = await import("@/lib/chat/requestApproval");
    const result = await requestApproval({} as any, "d1", {
      actionType: "not_a_real_action",
      requestedBy: "test",
      details: {},
      confirm: "x",
    });
    expect((result as any).error).toMatch(/isn't a known action/);
  });

  it("A RISK OVERRIDE MAY RAISE THE LEVEL, NEVER LOWER IT", async () => {
    // set_automation_toggle is one action with six consequences, so the
    // caller may pass a more severe level. It must not be able to pass
    // a gentler one and make a critical action look routine.
    const { requestApproval } = await import("@/lib/chat/requestApproval");
    const fake = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ap-1" }, error: null }) }) }),
      }),
    };
    const raised = await requestApproval(fake as any, "d1", {
      actionType: "set_automation_toggle", requestedBy: "t", details: {}, confirm: "x", risk: "critical",
    });
    expect((raised as any).risk).toBe("critical");

    const lowered = await requestApproval(fake as any, "d1", {
      actionType: "set_automation_toggle", requestedBy: "t", details: {}, confirm: "x", risk: "low",
    });
    // The policy says high; "low" is ignored.
    expect((lowered as any).risk).toBe("high");
  });

  it("and refuses to be used as a bypass for an ungated action", async () => {
    const { requestApproval } = await import("@/lib/chat/requestApproval");
    // generate_draft is real and deliberately NOT approval-gated.
    const result = await requestApproval({} as any, "d1", {
      actionType: "generate_draft",
      requestedBy: "test",
      details: {},
      confirm: "x",
    });
    expect((result as any).error).toMatch(/not approval-gated/);
  });
});

// ---------------------------------------------------------------------
// The registry itself.
// ---------------------------------------------------------------------

describe("the registries stay honest", () => {
  it("every platform publish action is in ALWAYS_REQUIRES_APPROVAL and ACTION_RISK", () => {
    for (const key of ALWAYS_REQUIRES_APPROVAL) {
      expect(ACTION_RISK[key], `${key} has no risk level`).toBeTruthy();
      expect(getActionPolicy(key)?.requiresApproval, `${key} missing from ACTION_POLICIES`).toBe(true);
    }
  });

  it("no outbound policy is quietly marked as not needing approval", () => {
    // `send` and `publish` and `spend` are the action types that reach
    // outside the product. If one of them is requiresApproval: false it
    // needs the reason written where this test can see it.
    const EXPLAINED_EXCEPTIONS = new Set([
      // Gated by a deliberate on/off permission instead of per-run, and
      // that permission is itself approval-gated now.
      "content_autopilot_publish",
      "auto_call_new_lead",
      "auto_reply_dm",
      // Nothing spends on creation; activation is the money step.
      "ad_campaign_launch",
    ]);
    const ungated = Object.entries(ACTION_POLICIES)
      .filter(([key, p]) => ["send", "publish", "spend"].includes(p.actionType) && !p.requiresApproval && !EXPLAINED_EXCEPTIONS.has(key))
      .map(([key]) => key);
    expect(ungated, `outbound actions marked as needing no approval:\n${ungated.join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The cron endpoints: fail closed, header only.
// ---------------------------------------------------------------------

describe("a cron endpoint with no secret refuses", () => {
  it("FAILS CLOSED when CRON_SECRET is unset", async () => {
    const { authorizeCron } = await import("@/lib/cronAuth");
    const req = new Request("https://hawlai.online/api/events/dispatch", { method: "POST" });
    const result = authorizeCron(req, "");
    expect(result.ok).toBe(false);
    // 503, not 401: the server is not configured to accept any
    // credential, which sends an operator to the environment.
    expect((result as any).status).toBe(503);
    expect((result as any).reason).toMatch(/CRON_SECRET is not set/);
  });

  it("accepts the header and nothing else", async () => {
    const { authorizeCron } = await import("@/lib/cronAuth");
    const good = new Request("https://hawlai.online/x", { headers: { authorization: "Bearer s3cret" } });
    expect(authorizeCron(good, "s3cret").ok).toBe(true);

    // THE QUERY STRING IS NOT ACCEPTED. daily-run used to take
    // ?secret=, which puts the credential in access logs, proxy logs
    // and referrers.
    const viaQuery = new Request("https://hawlai.online/x?secret=s3cret");
    expect(authorizeCron(viaQuery, "s3cret").ok).toBe(false);

    const wrong = new Request("https://hawlai.online/x", { headers: { authorization: "Bearer nope" } });
    expect(authorizeCron(wrong, "s3cret").ok).toBe(false);
  });

  it("neither cron route still reads the secret from the query string", () => {
    for (const path of ["src/app/api/events/dispatch/route.ts", "src/app/api/autopilot/daily-run/route.ts"]) {
      const src = readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(src, path).not.toMatch(/searchParams\.get\("secret"\)/);
      expect(src, path).toMatch(/authorizeCron\(/);
    }
  });
});
