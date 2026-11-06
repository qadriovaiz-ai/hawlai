// The two tools that had NO tests of any kind, and the route that now
// carries their actions out.
//
// trigger_call places a real phone call to a named customer.
// publish_to_youtube makes a video publicly visible. Both were
// reachable from one chat sentence, both were irreversible, and the
// audit found zero test coverage for either — not a weak test, none.
//
// This file executes both halves: the tool must ASK, and the approvals
// route must DO, and neither may do the other's job.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserted: { table: string; values: Row }[];
let updated: { table: string; values: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, eq: (k: string, v: any) => (filters.push([k, v]), api),
      gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api,
      insert: (v: Row) => ((op = "insert"), (values = v), inserted.push({ table, values: v }), api),
      // S7/P5 writes the granted level with an upsert, so the double
      // has to take one. Recorded as an insert, because what the test
      // asks is "what row did approving produce".
      upsert: (v: Row) => ((op = "insert"), (values = v), inserted.push({ table, values: v }), api),
      update: (v: Row) => ((op = "update"), (values = v), updated.push({ table, values: v }), api),
      single: async () => ({ data: op === "insert" ? { id: "approval-1", ...values } : rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: op === "insert" ? { id: "approval-1", ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

// --- the senders, counted, never run -------------------------------
const triggerVapiCall = vi.fn(async () => ({ success: true }));
const uploadVideoToYouTube = vi.fn(async () => ({ videoId: "yt1", url: "https://youtu.be/yt1" }));
const sendDealerEmail = vi.fn(async () => ({ success: true, via: "resend" }));

vi.mock("@/lib/agents/vapiCallAgent", () => ({ triggerVapiCall: (...a: any[]) => triggerVapiCall(...(a as [])) }));
vi.mock("@/lib/agents/youtubeAgent", () => ({
  uploadVideoToYouTube: (...a: any[]) => uploadVideoToYouTube(...(a as [])),
  getValidYoutubeAccessToken: async () => ({ accessToken: "tok", refreshed: null }),
}));
vi.mock("@/lib/email/sendDealerEmail", () => ({
  sendDealerEmail: (...a: any[]) => sendDealerEmail(...(a as [])),
  ownerEmail: async () => "owner@example.com",
  NO_ADDRESS_ERROR: "no address",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));
vi.mock("@/lib/audit/logAuditEvent", () => ({ logAuditEvent: async () => {} }));
// S7/P5: the route re-checks, at the moment of granting, that the
// platform can still put the change back. The only allowlisted action's
// platform does implement undo, so the refusal is unreachable through
// real data — this flag is the only honest way to exercise it.
let grantUndo = true;
vi.mock("@/lib/autonomy/promotion", async (orig) => ({
  ...(await orig<any>()),
  undoExistsFor: async () => grantUndo,
}));
// set_automation_toggle is plan-gated (marketingAutomationWorkflows).
// Without this the feature gate refuses before the approval code is
// reached, which is correct behaviour and not what this file tests.
vi.mock("@/lib/plans", async (orig) => ({
  ...(await orig<typeof import("@/lib/plans")>()),
  getDealershipPlanLimits: async () => ({}),
  hasFeature: () => true,
  killSwitchFor: () => undefined,
}));
vi.mock("@/lib/usage/generationLimits", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/generationLimits")>()),
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
}));

import { executeTool } from "@/lib/agents/masterBrainV2";
import { DISPATCHERS } from "@/lib/dispatch/registry";

const CTX = {
  id: "d1", name: "Gupta Sweets", category: "Sweet shop", city: "Kanpur",
  toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [], facts: null,
} as any;

beforeEach(() => {
  inserted = [];
  updated = [];
  triggerVapiCall.mockClear();
  uploadVideoToYouTube.mockClear();
  sendDealerEmail.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{
      id: "d1", dealership_name: "Gupta Sweets", owner_id: "u1", approval_threshold: 50000,
      youtube_refresh_token: "r", youtube_access_token: "a", youtube_token_expiry: null,
    }],
    leads: [{ id: "lead-1", name: "Asha", phone: "+919000000000", dealership_id: "d1", dnd_opt_out: false }],
    video_generations: [{ id: "vid-1", dealership_id: "d1", video_url: "https://cdn/x.mp4", prompt: "a reel", status: "ready" }],
    discount_codes: [],
    pending_approvals: [],
    team_members: [],
  };
});

// ---------------------------------------------------------------------
// The tool ASKS.
// ---------------------------------------------------------------------

describe("trigger_call", () => {
  it("A CHAT SENTENCE NO LONGER PLACES A CALL", async () => {
    const result = await executeTool(db(), CTX, "trigger_call", { leadName: "Asha" }, "");
    expect(triggerVapiCall).not.toHaveBeenCalled();
    expect(result.needsApproval).toBe(true);
    expect(result.risk).toBe("high");
    expect(result.confirm).toMatch(/places a real phone call to Asha/);
    // THE "CANNOT BE TAKEN BACK" CLAUSE, READ FROM THE DISPATCHER
    // rather than typed here — S6/P1. It used to live in the tool as
    // "It can't be unplaced", and this asserted that exact string; it
    // now lives in one place, so this reads it from there. Pinning the
    // words again here would be a second copy of the thing P1 moved
    // into one.
    expect(result.confirm).toContain(DISPATCHERS.place_outbound_call.cannotBeTakenBack);
    // The row the approvals route will read.
    const row = inserted.find((i) => i.table === "pending_approvals")!;
    expect(row.values.action_type).toBe("place_outbound_call");
    expect(row.values.action_details).toMatchObject({ lead_id: "lead-1", lead_name: "Asha" });
    expect(row.values.dealership_id).toBe("d1");
  });

  it("still refuses before asking when a call is not permitted at all", async () => {
    // These checks existed and are kept: they answer "may we call this
    // person", which is a different question from "did the owner say yes".
    tables.leads = [{ id: "lead-1", name: "Asha", phone: null, dealership_id: "d1", dnd_opt_out: false }];
    expect((await executeTool(db(), CTX, "trigger_call", { leadName: "Asha" }, "")).error).toMatch(/no phone number/);

    tables.leads = [{ id: "lead-1", name: "Asha", phone: "+91900", dealership_id: "d1", dnd_opt_out: true }];
    expect((await executeTool(db(), CTX, "trigger_call", { leadName: "Asha" }, "")).error).toMatch(/opted out/);

    tables.leads = [];
    expect((await executeTool(db(), CTX, "trigger_call", { leadName: "Asha" }, "")).error).toMatch(/No lead found/);
    expect(inserted.filter((i) => i.table === "pending_approvals")).toEqual([]);
  });

  it("and the model is told nothing happened", async () => {
    const result = await executeTool(db(), CTX, "trigger_call", { leadName: "Asha" }, "");
    expect(result.note).toMatch(/NOTHING HAS HAPPENED YET/);
    expect(result.note).toMatch(/do NOT say it is done, sent, placed, live or published/);
  });
});

describe("publish_to_youtube", () => {
  it("A CHAT SENTENCE NO LONGER PUBLISHES A VIDEO", async () => {
    const result = await executeTool(db(), CTX, "publish_to_youtube", { title: "Diwali reel" }, "");
    expect(uploadVideoToYouTube).not.toHaveBeenCalled();
    expect(result.needsApproval).toBe(true);
    expect(result.confirm).toMatch(/publishes the video publicly/);
    expect(result.confirm).toMatch(/Diwali reel/);
    const row = inserted.find((i) => i.table === "pending_approvals")!;
    expect(row.values.action_type).toBe("publish_video");
    expect(row.values.action_details).toMatchObject({ video_id: "vid-1", title: "Diwali reel" });
  });

  it("still refuses when there is nothing to publish", async () => {
    tables.video_generations = [];
    const result = await executeTool(db(), CTX, "publish_to_youtube", {}, "");
    expect(result.error).toMatch(/No ready video/);
    expect(inserted.filter((i) => i.table === "pending_approvals")).toEqual([]);
  });
});

describe("create_discount_code and set_automation_toggle", () => {
  it("NO DISCOUNT CODE IS CREATED BY A CHAT SENTENCE", async () => {
    const result = await executeTool(db(), CTX, "create_discount_code", { code: "DIWALI10", discountType: "percent", value: 10 }, "");
    expect(inserted.filter((i) => i.table === "discount_codes")).toEqual([]);
    expect(result.needsApproval).toBe(true);
    expect(result.risk).toBe("high");
    // It used to reply "Code DIWALI10 is live now".
    expect(result.confirm).toMatch(/customers can use it at checkout/);
    expect(JSON.stringify(result)).not.toMatch(/is live now/);
  });

  it("SWITCHING AN AUTOMATION ON ASKS; SWITCHING IT OFF DOES NOT", async () => {
    const on = await executeTool(db(), CTX, "set_automation_toggle", { toggle: "content_autopilot", enabled: true }, "");
    expect(on.needsApproval).toBe(true);
    expect(on.risk).toBe("critical");
    expect(on.confirm).toMatch(/posts to your social accounts on a schedule with no review/);
    expect(updated.filter((u) => u.table === "dealerships")).toEqual([]);

    // Off is immediate: the safe direction must never be the slow one.
    const off = await executeTool(db(), CTX, "set_automation_toggle", { toggle: "content_autopilot", enabled: false }, "");
    expect(off.success).toBe(true);
    expect(off.enabled).toBe(false);
    expect(updated.find((u) => u.table === "dealerships")!.values).toEqual({ content_autopilot_enabled: false });
  });

  it("A DANGEROUS TOGGLE REPORTS ITS OWN RISK, not the action's generic one", async () => {
    // One action, six consequences. auto-calling every new lead is not
    // a welcome email, and the card should not say they are equal.
    const calling = await executeTool(db(), CTX, "set_automation_toggle", { toggle: "auto_call_new_leads", enabled: true }, "");
    expect(calling.risk).toBe("critical");
    expect(calling.confirm).toMatch(/places a real phone call to every new lead/);

    const welcome = await executeTool(db(), CTX, "set_automation_toggle", { toggle: "welcome_email", enabled: true }, "");
    expect(welcome.risk).toBe("high");
  });

  it("an unknown toggle changes nothing", async () => {
    const result = await executeTool(db(), CTX, "set_automation_toggle", { toggle: "send_everything", enabled: true }, "");
    expect(result.error).toBeTruthy();
    expect(updated.filter((u) => u.table === "dealerships")).toEqual([]);
    expect(inserted.filter((i) => i.table === "pending_approvals")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The approvals route DOES.
// ---------------------------------------------------------------------

import { PATCH as approvePatch } from "@/app/api/approvals/[id]/route";

const approve = (id: string) =>
  approvePatch(
    new Request(`https://hawlai.online/api/approvals/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }),
    { params: Promise.resolve({ id }) } as any
  );

describe("approving is what performs the action", () => {
  it("APPROVING THE SAME CARD TWICE PLACES ONE CALL, NOT TWO", async () => {
    // FOUND BY RUNNING IT, 4 November 2026 (S6/P1). Before the guard in
    // the route, this test's `calls` was 2: two real phone calls to a
    // customer off one decision, and both requests answered 200. A
    // double click, a page reload — the card's state is local to the
    // component — or a retried request was enough.
    tables.pending_approvals = [{
      id: "ap-twice", dealership_id: "d1", status: "pending",
      action_type: "place_outbound_call", action_details: { lead_id: "lead-1", lead_name: "Asha" }, amount: null,
    }];
    triggerVapiCall.mockClear();
    expect((await approve("ap-twice")).status).toBe(200);
    // Production after the first approve: the row is marked.
    tables.pending_approvals[0].status = "approved";
    const again = await approve("ap-twice");
    expect(again.status).toBe(409);
    expect(triggerVapiCall.mock.calls).toHaveLength(1);
    expect((await again.json()).error).toMatch(/already approved/i);
  });

  it("AND A CARD WHOSE SEND FAILED CAN STILL BE APPROVED AGAIN", async () => {
    // THE OTHER HALF, and the reason the guard reads the ROW rather
    // than remembering the click. Every branch that fails returns
    // without marking the row, so a genuine failure leaves it pending —
    // and a guard that refused on "has been attempted" would strand it.
    tables.pending_approvals = [{
      id: "ap-retry", dealership_id: "d1", status: "pending",
      action_type: "place_outbound_call", action_details: { lead_id: "lead-1", lead_name: "Asha" }, amount: null,
    }];
    triggerVapiCall.mockClear();
    triggerVapiCall.mockImplementationOnce(async () => ({ success: false, error: "Vapi timed out" }) as any);
    expect((await approve("ap-retry")).status).toBe(500);
    expect(tables.pending_approvals[0].status).toBe("pending");
    expect((await approve("ap-retry")).status).toBe(200);
    expect(triggerVapiCall.mock.calls).toHaveLength(2);
  });

  it("AND A REJECTED CARD IS NOT APPROVED AFTERWARDS", async () => {
    tables.pending_approvals = [{
      id: "ap-rejected", dealership_id: "d1", status: "rejected",
      action_type: "place_outbound_call", action_details: { lead_id: "lead-1", lead_name: "Asha" }, amount: null,
    }];
    triggerVapiCall.mockClear();
    const res = await approve("ap-rejected");
    expect(res.status).toBe(409);
    expect(triggerVapiCall.mock.calls).toHaveLength(0);
  });

  it("A CALL IS PLACED ONLY AFTER APPROVAL", async () => {
    tables.pending_approvals = [{
      id: "ap-1", dealership_id: "d1", status: "pending",
      action_type: "place_outbound_call", action_details: { lead_id: "lead-1", lead_name: "Asha" }, amount: null,
    }];
    const res = await approve("ap-1");
    expect(res.status).toBe(200);
    expect(triggerVapiCall).toHaveBeenCalledTimes(1);
  });

  it("and the lead is re-read, so an opt-out after the card is honoured", async () => {
    // The card may be hours old. A person who opted out in between must
    // not be called because a stored row still says they could be.
    tables.leads = [{ id: "lead-1", name: "Asha", phone: "+919000000000", dealership_id: "d1", dnd_opt_out: true }];
    tables.pending_approvals = [{
      id: "ap-1", dealership_id: "d1", status: "pending",
      action_type: "place_outbound_call", action_details: { lead_id: "lead-1", lead_name: "Asha" }, amount: null,
    }];
    const res = await approve("ap-1");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/opted out/);
    expect(triggerVapiCall).not.toHaveBeenCalled();
    // And the approval is NOT marked approved: a failed action must not
    // leave a row claiming it succeeded.
    expect(updated.find((u) => u.table === "pending_approvals")).toBeUndefined();
  });

  it("A VIDEO IS PUBLISHED ONLY AFTER APPROVAL", async () => {
    tables.pending_approvals = [{
      id: "ap-2", dealership_id: "d1", status: "pending",
      action_type: "publish_video", action_details: { video_id: "vid-1", title: "Diwali reel", description: "a reel" }, amount: null,
    }];
    const res = await approve("ap-2");
    expect(res.status).toBe(200);
    expect(uploadVideoToYouTube).toHaveBeenCalledTimes(1);
    expect(updated.find((u) => u.table === "video_generations")!.values).toMatchObject({ youtube_video_id: "yt1" });
  });

  it("A DISCOUNT CODE IS CREATED ONLY AFTER APPROVAL, and not twice", async () => {
    tables.pending_approvals = [{
      id: "ap-3", dealership_id: "d1", status: "pending",
      action_type: "create_discount_code",
      action_details: { code: "DIWALI10", discount_type: "percent", value: 10, min_order_value: null }, amount: null,
    }];
    expect((await approve("ap-3")).status).toBe(200);
    expect(inserted.find((i) => i.table === "discount_codes")!.values).toMatchObject({ code: "DIWALI10", dealership_id: "d1" });

    // Re-checked at approval time: the same code created in between
    // must not produce a second row.
    inserted = [];
    tables.discount_codes = [{ id: "dc-1", dealership_id: "d1", code: "DIWALI10" }];
    const again = await approve("ap-3");
    expect(again.status).toBe(400);
    expect(inserted.filter((i) => i.table === "discount_codes")).toEqual([]);
  });

  it("AN AUTOMATION IS SWITCHED ON ONLY AFTER APPROVAL, and the field comes from the registry", async () => {
    tables.pending_approvals = [{
      id: "ap-4", dealership_id: "d1", status: "pending",
      action_type: "set_automation_toggle", action_details: { toggle: "dm_auto_reply", field: "ignored", enabled: true }, amount: null,
    }];
    const res = await approve("ap-4");
    expect(res.status).toBe(200);
    // `field` in the row is deliberately ignored: a stored value is not
    // something to interpolate into an update.
    expect(updated.find((u) => u.table === "dealerships")!.values).toEqual({ dm_auto_reply_enabled: true });
  });

  it("an unknown toggle in a stored row changes nothing", async () => {
    tables.pending_approvals = [{
      id: "ap-5", dealership_id: "d1", status: "pending",
      action_type: "set_automation_toggle", action_details: { toggle: "drop_everything", field: "x", enabled: true }, amount: null,
    }];
    const res = await approve("ap-5");
    expect(res.status).toBe(400);
    expect(updated.filter((u) => u.table === "dealerships")).toEqual([]);
  });

  it("AN EMAIL IS SENT ONLY AFTER APPROVAL", async () => {
    tables.pending_approvals = [{
      id: "ap-6", dealership_id: "d1", status: "pending",
      action_type: "send_email", action_details: { to: "colleague@example.com", recipient_kind: "team", subject: "Stock check", body: "Can you check the counter?" }, amount: null,
    }];
    const res = await approve("ap-6");
    expect(res.status).toBe(200);
    expect(sendDealerEmail).toHaveBeenCalledTimes(1);
  });

  it("REJECTING PERFORMS NOTHING", async () => {
    tables.pending_approvals = [{
      id: "ap-7", dealership_id: "d1", status: "pending",
      action_type: "place_outbound_call", action_details: { lead_id: "lead-1", lead_name: "Asha" }, amount: null,
    }];
    const res = await approvePatch(
      new Request("https://hawlai.online/api/approvals/ap-7", { method: "PATCH", body: JSON.stringify({ status: "rejected", rejection_reason: "not now" }) }),
      { params: Promise.resolve({ id: "ap-7" }) } as any
    );
    expect(res.status).toBe(200);
    expect(triggerVapiCall).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// S7/P5 — the one card whose subject is a permission.
// ---------------------------------------------------------------------

describe("granting the product permission to act alone", () => {
  // THE FOUNDER'S DECISION 2, AS A PROPERTY OF THE ROUTE. The product
  // earns the permission from measured data and ASKS; this is the only
  // place the answer becomes a row. src/lib/autonomy/promotion.ts is
  // tested separately and asserts it never writes a level itself.

  beforeEach(() => {
    grantUndo = true;
  });

  const card = (over: Row = {}) => [{
    id: "ap-grant",
    dealership_id: "d1",
    status: "pending",
    action_type: "grant_autonomy",
    action_details: { action_key: "update_page_meta", evidence: { approvalsAsRequested: 10 }, confirm: "Shall I?" },
    amount: null,
    ...over,
  }];

  it("APPROVING WRITES THE LEVEL, AND IT IS L2 FOR THE NAMED ACTION", async () => {
    tables.pending_approvals = card();
    const res = await approve("ap-grant");
    expect(res.status).toBe(200);

    const row = inserted.find((i) => i.table === "action_levels");
    expect(row, "approving granted nothing").toBeTruthy();
    expect(row!.values.level).toBe("L2");
    expect(row!.values.action_key).toBe("update_page_meta");
    expect(row!.values.dealership_id).toBe("d1");
    // WHO GRANTED IT. A permission whose record cannot say who gave it
    // is not an audit row — migration 209's own reasoning.
    expect(row!.values.set_by).toBe("u1");
  });

  it("AND AN ACTION KEY NOBODY EARNED IS REFUSED, FROM THE ROW", async () => {
    // The key is re-checked against the allowlist rather than trusted
    // from action_details — the lesson the toggle branch beside it
    // records: a stored value is still a value the server should not
    // act on blindly. The database refuses it too (migration 220), so
    // this is the second of three gates.
    tables.pending_approvals = card({ action_details: { action_key: "update_product_price" } });
    const res = await approve("ap-grant");
    expect(res.status).toBe(400);
    expect(String((await res.json()).error)).toMatch(/isn't something Hawlai may do on its own/);
    expect(inserted.filter((i) => i.table === "action_levels")).toEqual([]);
  });

  it("AND THE UNDO IS RE-CHECKED AT THE MOMENT OF GRANTING, not of asking", async () => {
    // The card may have been sitting there for a week, and a platform
    // can lose its undo in a deploy. Without this a mutation deleting
    // the check survived: every other refusal in this branch fires
    // first on the keys a test can reach.
    grantUndo = false;
    tables.pending_approvals = card();
    const res = await approve("ap-grant");
    expect(res.status).toBe(400);
    expect(String((await res.json()).error)).toMatch(/Nothing was changed/);
    expect(inserted.filter((i) => i.table === "action_levels")).toEqual([]);
  });

  it("AND AN EMPTY OR MISSING KEY GRANTS NOTHING", async () => {
    for (const details of [{}, { action_key: "" }, { action_key: "   " }]) {
      inserted.length = 0;
      tables.pending_approvals = card({ action_details: details });
      const res = await approve("ap-grant");
      expect(res.status, JSON.stringify(details)).toBe(400);
      expect(inserted.filter((i) => i.table === "action_levels")).toEqual([]);
    }
  });

  it("AND REJECTING GRANTS NOTHING", async () => {
    tables.pending_approvals = card();
    const res = await approvePatch(
      new Request("https://hawlai.online/api/approvals/ap-grant", { method: "PATCH", body: JSON.stringify({ status: "rejected", rejection_reason: "not yet" }) }),
      { params: Promise.resolve({ id: "ap-grant" }) } as any
    );
    expect(res.status).toBe(200);
    expect(inserted.filter((i) => i.table === "action_levels")).toEqual([]);
  });
});
