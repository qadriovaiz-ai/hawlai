// An approval card that has already been decided must look decided.
//
// The verdict lived in React state, so a card rebuilt from the message
// history — a new turn, a reload — came back with its buttons live on a
// change that had gone through an hour ago. Pressing Approve again was
// safe (the executor refuses a spent action) and answered in red: a
// successful change reported as a failure, on the one feature whose
// whole point is not claiming things that aren't true.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

// The world the route runs in, so the checks below are the route's own
// behaviour rather than the presence of a string in its source. The
// membership check survived a mutation when this file only read source.
const world = {
  userId: "owner-1",
  approval: { id: "ap1", dealership_id: "d1", status: "approved" } as any,
  ownerId: "owner-1",
  member: null as any,
  action: { status: "executed", platform_response: { verification: { verified: true, message: "Live — I read the page back." } } } as any,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: world.userId ? { id: world.userId } : null } }) },
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: world.member }) };
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === "pending_approvals" ? world.approval : table === "dealerships" ? (world.ownerId ? { owner_id: world.ownerId } : null) : world.action,
        }),
        single: async () => ({ data: null }),
      };
      return chain;
    },
  }),
}));

const req = () => new Request("https://hawlai.test/api/approvals/ap1");
const params = { params: Promise.resolve({ id: "ap1" }) };

const card = readFileSync("src/components/chat/MasterChatPage.tsx", "utf8");
const route = readFileSync("src/app/api/approvals/[id]/route.ts", "utf8");

describe("the card asks what was already decided", () => {
  it("reads the approval's real status when it mounts", () => {
    expect(card).toMatch(/fetch\(`\/api\/approvals\/\$\{approvalId\}`\)/);
    // Only when this card has no verdict of its own, so a fresh
    // approval in progress is never overwritten by a stale read.
    expect(card).toMatch(/if \(!approvalId \|\| decision !== "idle"\) return;/);
  });

  it("tells the owner what was decided, with the stored read-back", async () => {
    const { GET } = await import("@/app/api/approvals/[id]/route");
    world.userId = "owner-1";
    world.ownerId = "owner-1";
    world.member = null;
    const body = await (await GET(req(), params)).json();
    expect(body.status).toBe("approved");
    // publish_actions.platform_response holds what the live page said
    // when it was approved; an old card repeats that rather than
    // inventing "Applied."
    expect(body.publish).toEqual({ status: "executed", verified: true, message: "Live — I read the page back." });
  });

  it("REFUSES someone who is neither the owner nor a member of that business", async () => {
    const { GET } = await import("@/app/api/approvals/[id]/route");
    world.userId = "stranger";
    world.ownerId = "owner-1";
    world.member = null;
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    // Not even the status leaks — a 404, the same answer as an id that
    // does not exist.
    expect(body.status).toBeUndefined();
    expect(body.error).toBe("Approval not found");
  });

  it("answers an active team member of that business", async () => {
    const { GET } = await import("@/app/api/approvals/[id]/route");
    world.userId = "teammate";
    world.ownerId = "owner-1";
    world.member = { id: "tm1" };
    const body = await (await GET(req(), params)).json();
    expect(body.status).toBe("approved");
  });

  it("refuses when nobody is signed in", async () => {
    const { GET } = await import("@/app/api/approvals/[id]/route");
    world.userId = "";
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });
});

describe("what the decided card says", () => {
  it("treats an already-spent card as done, not as an error", () => {
    expect(card).toMatch(/already went through/i);
    expect(card).toMatch(/setDecision\(spent \? "approved" : "error"\)/);
  });

  it("has three tones, and red is not one of them for a decided card", () => {
    // ok = confirmed live, warn = written but not confirmed, muted =
    // nothing new happened. The buttons are gone in all three: the
    // decided branch renders a line of text instead.
    expect(card).toMatch(/const \[tone, setTone\] = useState<"ok" \| "warn" \| "muted">/);
    expect(card).toMatch(/tone === "muted" \? "text-slate-500" : tone === "warn" \? "text-amber-600" : "text-emerald-600"/);
    expect(card).toMatch(/\{decision === "approved" \|\| decision === "rejected" \? \(/);
  });
});
