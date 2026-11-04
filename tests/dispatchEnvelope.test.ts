// THE DISPATCH ENVELOPE — S6/P1.
//
// One shape for every one-shot send, and the three properties that make
// it worth having:
//
//   1. THERE IS NO UNDO, AND THE OWNER IS TOLD SO BEFORE HE APPROVES.
//      Not in a comment, not in a tool's hand-written sentence that the
//      next tool forgets — in the dispatcher's own declaration, composed
//      onto the card by requestApproval.
//   2. ONE ACTION, ONE PATH. A registered send is carried out by its
//      dispatcher and by nothing else. Two paths for one action is how
//      one of them comes to disagree with the other.
//   3. THE SUBJECT IS RE-READ BEFORE IT IS SENT TO. A card can sit for
//      hours: a number changes, a customer opts out, a video is gone.
//
// WHAT THIS FILE DOES NOT RE-PROVE: that approving carries the action
// out, that a call is placed only after approval, that an opted-out
// lead is refused. tests/approvalExecution.test.ts asserted all of that
// before the move and passes unchanged after it, which is the evidence
// the move was faithful — a new test written alongside a refactor
// proves the new code, not the sameness.

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { DISPATCHERS, dispatchedActionTypes, dispatcherFor } from "@/lib/dispatch/registry";
import { getActionPolicy } from "@/lib/executionPolicy";
import { code } from "./helpers/source";
import { reachable } from "./helpers/reachability";

const triggerVapiCall = vi.fn(async () => ({ success: true }) as any);
vi.mock("@/lib/agents/vapiCallAgent", () => ({ triggerVapiCall: (...a: any[]) => triggerVapiCall(...(a as [])) }));

const uploadVideoToYouTube = vi.fn(async () => ({ videoId: "yt1", url: "https://youtu.be/yt1" }));
vi.mock("@/lib/agents/youtubeAgent", () => ({
  uploadVideoToYouTube: (...a: any[]) => uploadVideoToYouTube(...(a as [])),
  getValidYoutubeAccessToken: async () => ({ accessToken: "at", refreshed: null }),
}));

afterEach(() => {
  triggerVapiCall.mockClear();
  uploadVideoToYouTube.mockClear();
  vi.restoreAllMocks();
});

const ROUTE = "src/app/api/approvals/[id]/route.ts";

/** leads / video_generations / dealerships, enough for both dispatchers. */
function db(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    leads: [{ id: "lead-1", name: "Asha", phone: "9800000000", dealership_id: "d1", dnd_opt_out: false }],
    video_generations: [{ id: "vid-1", video_url: "https://cdn.test/v.mp4", prompt: "a candle", dealership_id: "d1" }],
    dealerships: [{ id: "d1", youtube_refresh_token: "rt", youtube_access_token: "at", youtube_token_expiry: null }],
    ...seed,
  };
  const updates: { table: string; values: any }[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      let pending: any = null;
      const rows = () => (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const apply = () => {
        if (pending) {
          updates.push({ table, values: pending });
          for (const r of rows()) Object.assign(r, pending);
          pending = null;
          return { data: null, error: null };
        }
        return { data: rows(), error: null };
      };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        update(v: any) { pending = v; return chain; },
        maybeSingle: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: null }); },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { ctx: { service: client, dealershipId: "d1" }, tables, updates };
}

describe("1. THERE IS NO UNDO, AND IT IS SAID BEFORE THE OWNER APPROVES", () => {
  it("EVERY DISPATCHER DECLARES undoable: false — the type allows nothing else", () => {
    for (const [key, d] of Object.entries(DISPATCHERS)) {
      expect(d.undoable, key).toBe(false);
      expect(d.key, key).toBe(key);
    }
  });

  it("AND A SENTENCE THAT SAYS WHAT CANNOT BE TAKEN BACK, in the owner's terms", () => {
    // Not "this action is irreversible". A person approving a call
    // should read that the person will have been called.
    for (const [key, d] of Object.entries(DISPATCHERS)) {
      expect(d.cannotBeTakenBack.length, key).toBeGreaterThan(40);
      expect(d.cannotBeTakenBack, key).toMatch(/cannot be unmade|not unseen|cannot be undone/i);
    }
  });

  it("AND IT DOES NOT RESTATE THE ACTION, which the tool's own line already does", () => {
    // The first version of these sentences began "This places a real
    // phone call…" — which the trigger_call tool also says, so the card
    // read the same thing twice. The split is the point: the TOOL says
    // what and to whom, the DECLARATION says what cannot be taken back.
    for (const [key, d] of Object.entries(DISPATCHERS)) {
      expect(d.cannotBeTakenBack, key).not.toMatch(/^This (places|publishes|sends|posts)/);
    }
  });

  it("AND THE TOOLS NO LONGER WRITE THAT CLAUSE THEMSELVES", () => {
    // One source for it. A tool keeping its own copy is how the two
    // come to disagree, and how a card ends up saying it twice.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    expect(brain).not.toMatch(/can't be unplaced/);
    expect(brain).toMatch(/This places a real phone call to \$\{lead\.name\} now\.`/);
  });

  it("THE CARD CARRIES IT, COMPOSED FROM THE DECLARATION rather than remembered", async () => {
    // THE PROPERTY THAT MATTERS. Before this, each tool wrote its own
    // confirm line and whether it mentioned the undo was down to
    // whoever typed it. A new dispatcher cannot now ship a card that
    // omits it.
    const { requestApproval } = await import("@/lib/chat/requestApproval");
    for (const key of dispatchedActionTypes()) {
      const supabase = {
        from: () => ({
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: `ap-${key}` }, error: null }) }) }),
        }),
      };
      const result: any = await requestApproval(supabase, "d1", {
        actionType: key,
        details: {},
        confirm: "This calls Asha.",
        requestedBy: "test",
      });
      expect(result.needsApproval, key).toBe(true);
      expect(result.confirm, key).toContain(DISPATCHERS[key].cannotBeTakenBack);
      expect(result.confirm, key).toContain("This calls Asha.");
    }
  });

  it("AND NEVER TWICE, when the caller already said it", async () => {
    const { requestApproval } = await import("@/lib/chat/requestApproval");
    const supabase = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ap-1" }, error: null }) }) }) }),
    };
    const sentence = DISPATCHERS.place_outbound_call.cannotBeTakenBack;
    const result: any = await requestApproval(supabase, "d1", {
      actionType: "place_outbound_call",
      details: {},
      confirm: `Ready to call. ${sentence}`,
      requestedBy: "test",
    });
    expect(result.confirm.split(sentence)).toHaveLength(2);
  });

  it("and a tool with no dispatcher keeps its own sentence untouched", async () => {
    const { requestApproval } = await import("@/lib/chat/requestApproval");
    const supabase = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ap-1" }, error: null }) }) }) }),
    };
    const result: any = await requestApproval(supabase, "d1", {
      actionType: "create_discount_code",
      details: {},
      confirm: "This creates a live code.",
      requestedBy: "test",
    });
    expect(result.confirm).toBe("This creates a live code.");
  });
});

describe("2. ONE ACTION, ONE PATH", () => {
  it("A REGISTERED SEND HAS NO BRANCH LEFT IN THE ROUTE", () => {
    const route = readFileSync(ROUTE, "utf8");
    for (const key of dispatchedActionTypes()) {
      expect(route, `${key} has a dispatcher AND a branch — delete the branch`).not.toContain(`action_type === "${key}"`);
    }
  });

  it("AND THE ROUTE CALLS THE REGISTRY, so a new dispatcher needs no route change", () => {
    const route = code(ROUTE);
    expect(route).toMatch(/dispatcherFor\(approval\.action_type\)/);
    expect(route).toMatch(/dispatcher\.execute\(/);
    // THE CLAIM IS THE APPROVAL'S OWN ID, AND IT IS CHECKED INSIDE THE
    // CALL. The first version of this grepped the whole route for
    // `String(id)` — which also appears in the decision row written at
    // the bottom of the file, so a mutation replacing the claim with a
    // fresh random value survived.
    const call = route.slice(route.indexOf("dispatcher.execute("));
    expect(call.slice(0, call.indexOf(");"))).toMatch(/String\(id\)/);
  });

  it("EVERY DISPATCHED ACTION IS APPROVAL-GATED IN THE POLICY REGISTRY", () => {
    // A dispatcher for an ungated action would be a send with no card
    // at all — the envelope is what carries out an approval, not a
    // shortcut around one.
    for (const key of dispatchedActionTypes()) {
      const policy = getActionPolicy(key);
      expect(policy, `${key} is missing from ACTION_POLICIES`).toBeTruthy();
      expect(policy!.requiresApproval, key).toBe(true);
    }
  });

  it("and the registry answers for what it holds, and nothing else", () => {
    expect(dispatcherFor("place_outbound_call")).toBe(DISPATCHERS.place_outbound_call);
    expect(dispatcherFor("create_discount_code")).toBeNull();
    expect(dispatcherFor(null)).toBeNull();
    expect(dispatcherFor("toString")).toBeNull();
  });
});

describe("3. A PREVIEW READS; IT DOES NOT SEND", () => {
  it("NO DISPATCHER'S preview CAN REACH A SENDER", () => {
    // Uses S6/P0's own walk. A preview that sent would turn the card
    // into the action — the owner would be shown what "will" happen
    // after it already had.
    const OUTBOUND = ["triggerVapiCall", "uploadVideoToYouTube", "sendDealerEmail", "sendWhatsAppText", "setCampaignStatus"];
    for (const file of ["src/lib/dispatch/call.ts", "src/lib/dispatch/video.ts"]) {
      const src = code(file);
      const at = src.indexOf("async preview(");
      expect(at, `${file} has no preview`).toBeGreaterThan(-1);
      const body = src.slice(at, src.indexOf("async execute(", at));
      const r = reachable(body, OUTBOUND, []);
      expect(r.found, `${file}'s preview can reach a sender`).toEqual([]);
    }
  });

  it("and it says who receives it, because that is the half that cannot be undone", async () => {
    const { ctx } = db();
    const call: any = await DISPATCHERS.place_outbound_call.preview(ctx, { lead_id: "lead-1" });
    expect(call.to).toContain("Asha");
    expect(call.to).toContain("9800000000");
    const video: any = await DISPATCHERS.publish_video.preview(ctx, { video_id: "vid-1", title: "Diwali" });
    expect(video.to).toMatch(/YouTube/);
    expect(video.summary).toContain("Diwali");
  });

  it("A PREVIEW WARNS WHEN THE SEND CANNOT GO OUT, rather than looking ready", async () => {
    const { ctx } = db({ leads: [{ id: "lead-1", name: "Asha", phone: null, dealership_id: "d1", dnd_opt_out: true }] });
    const call: any = await DISPATCHERS.place_outbound_call.preview(ctx, { lead_id: "lead-1" });
    expect(call.warnings.join(" ")).toMatch(/no phone number/i);
    expect(call.warnings.join(" ")).toMatch(/opted out/i);
  });

  it("and says so plainly when the subject is gone", async () => {
    const { ctx } = db({ leads: [], video_generations: [] });
    expect(await DISPATCHERS.place_outbound_call.preview(ctx, { lead_id: "lead-1" })).toEqual({
      error: "That lead is no longer on file, so there is nothing to call.",
    });
    expect(await DISPATCHERS.publish_video.preview(ctx, { video_id: "vid-1" })).toEqual({
      error: "That video is no longer available, so there is nothing to publish.",
    });
  });
});

describe("4. THE SUBJECT IS RE-READ BEFORE IT IS SENT TO", () => {
  it("A LEAD WHO OPTED OUT AFTER THE CARD WAS MADE IS NOT CALLED", async () => {
    const { ctx, tables } = db();
    tables.leads[0].dnd_opt_out = true;
    const r = await DISPATCHERS.place_outbound_call.execute(ctx, { lead_id: "lead-1" }, "ap-1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/opted out/);
    expect(triggerVapiCall).not.toHaveBeenCalled();
  });

  it("AND A LEAD WHOSE NUMBER IS GONE IS NOT CALLED", async () => {
    const { ctx, tables } = db();
    tables.leads[0].phone = null;
    const r = await DISPATCHERS.place_outbound_call.execute(ctx, { lead_id: "lead-1" }, "ap-1");
    expect(r.ok).toBe(false);
    expect(triggerVapiCall).not.toHaveBeenCalled();
  });

  it("A VIDEO THAT IS GONE IS NOT PUBLISHED", async () => {
    const { ctx, tables } = db();
    tables.video_generations.length = 0;
    const r = await DISPATCHERS.publish_video.execute(ctx, { video_id: "vid-1", title: "t" }, "ap-1");
    expect(r.ok).toBe(false);
    expect(uploadVideoToYouTube).not.toHaveBeenCalled();
  });

  it("AND A DISCONNECTED YOUTUBE IS SAID, not attempted", async () => {
    const { ctx, tables } = db();
    tables.dealerships[0].youtube_refresh_token = null;
    const r = await DISPATCHERS.publish_video.execute(ctx, { video_id: "vid-1", title: "t" }, "ap-1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/isn't connected/);
    expect(uploadVideoToYouTube).not.toHaveBeenCalled();
  });

  it("THE RE-READ HAPPENS BEFORE THE SEND, not after it", () => {
    // The order is the property: nothing after the send can un-send it.
    for (const [file, loader, sender] of [
      ["src/lib/dispatch/call.ts", "leadFor(ctx", "triggerVapiCall("],
      ["src/lib/dispatch/video.ts", "videoFor(ctx", "uploadVideoToYouTube("],
    ] as const) {
      const src = code(file);
      const body = src.slice(src.indexOf("async execute("));
      const reads = body.indexOf(loader);
      const sends = body.indexOf(sender);
      expect(reads, `${file}: the re-read went away`).toBeGreaterThan(-1);
      expect(sends, `${file}: the send went away`).toBeGreaterThan(-1);
      expect(reads, `${file}: it sends before it re-reads`).toBeLessThan(sends);
    }
  });

  it("and a happy path reports what happened, with the platform's own answer", async () => {
    const { ctx } = db();
    const call = await DISPATCHERS.place_outbound_call.execute(ctx, { lead_id: "lead-1" }, "ap-1");
    expect(call.ok && call.note).toMatch(/Calling Asha/);
    expect(triggerVapiCall).toHaveBeenCalledTimes(1);

    const video = await DISPATCHERS.publish_video.execute(ctx, { video_id: "vid-1", title: "t" }, "ap-2");
    expect(video.ok && video.note).toContain("https://youtu.be/yt1");
    expect(uploadVideoToYouTube).toHaveBeenCalledTimes(1);
  });

  it("AND A PLATFORM REFUSAL IS AN ERROR, not a quiet success", async () => {
    const { ctx } = db();
    triggerVapiCall.mockImplementationOnce(async () => ({ success: false, error: "Vapi refused" }) as any);
    const r = await DISPATCHERS.place_outbound_call.execute(ctx, { lead_id: "lead-1" }, "ap-1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("Vapi refused");

    uploadVideoToYouTube.mockImplementationOnce(async () => {
      throw new Error("YouTube quota");
    });
    const v = await DISPATCHERS.publish_video.execute(ctx, { video_id: "vid-1", title: "t" }, "ap-2");
    expect(v.ok).toBe(false);
    expect(!v.ok && v.error).toBe("YouTube quota");
  });
});

describe("5. what the envelope does NOT claim", () => {
  it("A DISPATCHER THAT CANNOT CLAIM AT THE PLATFORM SAYS SO, rather than pretending", () => {
    // Neither Vapi nor YouTube takes an idempotency key, so `once`
    // cannot be handed on. The no-repeat rule for these two is the
    // route's refusal of a decided card (S6/P1a). A dispatcher that
    // silently ignored the parameter would read as if it had used it.
    for (const file of ["src/lib/dispatch/call.ts", "src/lib/dispatch/video.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must say what it does with the claim`).toMatch(/NO IDEMPOTENCY KEY AT THE PLATFORM/);
      expect(src).toMatch(/void once;/);
    }
  });

  it("and the registry writes down why each remaining send has not moved", () => {
    // A list of "not here yet" with no reasons is a list nobody can act
    // on, and the next person would move the easy one rather than the
    // right one.
    const registry = readFileSync("src/lib/dispatch/registry.ts", "utf8");
    for (const key of ["send_email", "publish_post", "create_discount_code"]) {
      expect(registry, `${key} is not accounted for in the registry's own notes`).toContain(key);
    }
  });
});
