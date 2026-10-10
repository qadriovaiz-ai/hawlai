// G-3 step 4: the card stays, the record is added beside it.
//
// This is the one endpoint in G-3 that was NOT converted to a generic
// approval card, and the reason is in PLAN-G3 §4: its card already
// resolves the destination before the button exists, gives no button at
// all when the destination is not connected, names the Page in the
// confirm, carries `expect_text`, and the endpoint reads the post back
// afterwards. Replacing that with a generic row would have reduced
// safety.
//
// WHAT THE RECORD BUYS: the confirm, the destination and the exact text
// are on the server; the row is single-use, so the card's request cannot
// be replayed; and a replay with different words is refused.
//
// WHAT IT DOES NOT BUY, pinned at the bottom of this file rather than
// implied: a request that simply OMITS the id is treated as the Social
// page's own and goes through. The endpoint cannot require a row,
// because that page legitimately posts without one.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

const postPhotoToPage = vi.fn(async (..._a: any[]) => ({ id: "PAGE1_photo" }));
const postTextToPage = vi.fn(async (..._a: any[]) => ({ id: "PAGE1_text" }));
const postPhotoToInstagram = vi.fn(async (..._a: any[]) => ({ id: "ig_1" }));
let postFails = false;

vi.mock("@/lib/agents/socialMediaAgent", () => ({
  postPhotoToPage: (...a: any[]) => postPhotoToPage(...a),
  postTextToPage: (...a: any[]) => {
    if (postFails) throw new Error("Facebook refused the post.");
    return postTextToPage(...a);
  },
  postPhotoToInstagram: (...a: any[]) => postPhotoToInstagram(...a),
  getConnectedInstagramAccountId: async () => "IG1",
  readPostMessage: async () => undefined,
  deletePostFromPage: async () => ({ deleted: true }),
  checkPostPresence: async () => ({ state: "gone" }),
}));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "TOKEN" }));
vi.mock("@/lib/attribution/pieces", () => ({ registerPiece: async () => null }));

let approvals: Row[];
let updates: { table: string; values: Row; filters: [string, any][] }[];

function db(): any {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let op = "select";
    let values: Row = {};
    const row = () => {
      if (table === "profiles") return { dealership_id: "d1" };
      if (table === "dealerships") return { id: "d1", fb_page_id: "PAGE1", fb_page_name: "Candle by Qaaf" };
      if (table === "pending_approvals") {
        const id = filters.find(([k]) => k === "id")?.[1];
        return approvals.find((a) => a.id === id) ?? null;
      }
      return null;
    };
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: () => api,
      update: (v: Row) => ((op = "update"), (values = v), api),
      single: async () => ({ data: row(), error: null }),
      maybeSingle: async () => ({ data: row(), error: null }),
      then: (res: any, rej: any) => {
        if (op === "update") {
          updates.push({ table, values, filters: [...filters] });
          // The conditional UPDATE actually applies, so a second press
          // genuinely finds the row spent.
          if (table === "pending_approvals") {
            const id = filters.find(([k]) => k === "id")?.[1];
            const needs = filters.find(([k]) => k === "status")?.[1];
            const target = approvals.find((a) => a.id === id);
            if (target && (needs === undefined || target.status === needs)) Object.assign(target, values);
          }
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { POST as socialPost } from "@/app/api/social/post/route";
import { socialPublishAction } from "@/lib/chat/publishActions";
import { checkPostApproval, spendPostApproval } from "@/lib/social/approvalForPost";
import { getActionPolicy } from "@/lib/executionPolicy";
import { code, sourceWithComments } from "./helpers/source";

const CAPTION = "Slow evenings start with the Lavender candle.";
const FB = { platform: "facebook" as const, name: "Candle by Qaaf", connected: true, why: null };

const post = (body: Row) =>
  socialPost(new Request("https://hawlai.online/api/social/post", { method: "POST", body: JSON.stringify(body) }));

const pending = (over: Row = {}) => ({
  id: "ap-post-1",
  dealership_id: "d1",
  status: "pending",
  action_type: "publish_social_post",
  action_details: { destination: "facebook", destination_name: "Candle by Qaaf", expect_text: CAPTION, confirm: "..." },
  ...over,
});

beforeEach(() => {
  postPhotoToPage.mockClear();
  postTextToPage.mockClear();
  postPhotoToInstagram.mockClear();
  postFails = false;
  approvals = [pending()];
  updates = [];
});

describe("the action is classified", () => {
  it("publish_social_post IS in the registry and requires approval", () => {
    const policy = getActionPolicy("publish_social_post");
    expect(policy).toBeTruthy();
    expect(policy!.requiresApproval).toBe(true);
    // Public and fast, and only partly reversible: unpublish exists but
    // whoever already saw it has seen it.
    expect(policy!.riskLevel).toBe("high");
  });
});

describe("THE CARD KEEPS EVERYTHING IT ALREADY HAD", () => {
  // The whole argument for not converting this one. If any of this is
  // lost, the record was not worth it.
  const card = () => socialPublishAction({ text: CAPTION, to: FB, approvalId: "ap-post-1" })!;

  it("the button still names the Page", () => {
    expect(card().label).toBe("Publish to your Facebook Page: Candle by Qaaf");
  });

  it("the confirm still says it will be public", () => {
    expect(card().confirm).toMatch(/public/i);
  });

  it("expect_text is still the exact text the card showed", () => {
    expect((card().payload as any).expect_text).toBe(CAPTION);
    expect((card().payload as any).caption).toBe(CAPTION);
  });

  it("the destination is still named in the payload", () => {
    expect((card().payload as any).destination).toBe("facebook");
  });

  it("AND NOW IT CARRIES THE APPROVAL ID", () => {
    expect((card().payload as any).approval_id).toBe("ap-post-1");
  });

  it("an unconnected destination still gets NO card at all", () => {
    // Resolved before the button exists — the 8 October bug.
    expect(socialPublishAction({ text: CAPTION, to: { ...FB, connected: false }, approvalId: "ap-post-1" })).toBeNull();
  });
});

describe("the row makes the card's request unreplayable", () => {
  it("THE FIRST PRESS POSTS, and spends the row", async () => {
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-post-1" });
    expect(res.status).toBe(200);
    expect(postTextToPage).toHaveBeenCalledTimes(1);
    expect(approvals[0].status).toBe("approved");
  });

  it("A SECOND PRESS IS REFUSED, and posts nothing", async () => {
    await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-post-1" });
    postTextToPage.mockClear();
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-post-1" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already approved once/);
    expect(postTextToPage).not.toHaveBeenCalled();
  });

  it("DIFFERENT WORDS THAN THE ROW ARE REFUSED", async () => {
    // A replay that edits the caption. Caught before the endpoint's own
    // expect_text check, because expect_text is also attacker-supplied.
    const res = await post({
      caption: "Flat 50% off everything today only.",
      expect_text: "Flat 50% off everything today only.",
      destination: "facebook",
      approval_id: "ap-post-1",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't the text that was approved/);
    expect(postTextToPage).not.toHaveBeenCalled();
    expect(approvals[0].status).toBe("pending");
  });

  it("ANOTHER BUSINESS'S ROW IS NOT THIS BUSINESS'S APPROVAL", async () => {
    approvals = [pending({ dealership_id: "d2" })];
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-post-1" });
    expect(res.status).toBe(400);
    expect(postTextToPage).not.toHaveBeenCalled();
  });

  it("a row for a DIFFERENT action is not an approval to post", async () => {
    approvals = [pending({ action_type: "send_email" })];
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-post-1" });
    expect(res.status).toBe(400);
    expect(postTextToPage).not.toHaveBeenCalled();
  });

  it("an id that names nothing is refused", async () => {
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-nope" });
    expect(res.status).toBe(400);
    expect(postTextToPage).not.toHaveBeenCalled();
  });

  it("THE ROW IS SPENT ONLY AFTER THE POST IS OUT", async () => {
    // A row marked approved for a post that then failed would leave the
    // owner unable to try again.
    postFails = true;
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook", approval_id: "ap-post-1" });
    expect(res.status).toBe(500);
    expect(approvals[0].status).toBe("pending");
  });
});

describe("WHAT THIS DELIBERATELY DOES NOT CLOSE", () => {
  it("A REQUEST WITH NO APPROVAL ID STILL POSTS — that is the Social page", async () => {
    // U2 in the threat model. A press on that page IS the owner's
    // decision, made on a page that shows them the thing. Requiring a
    // row would mean breaking it or adding a bypass flag, and a bypass
    // flag in an authorisation check is how authorisation checks die.
    const res = await post({ caption: CAPTION, expect_text: CAPTION, destination: "facebook" });
    expect(res.status).toBe(200);
    expect(postTextToPage).toHaveBeenCalledTimes(1);
  });

  it("so threat T1 closes for the CHAT CARD, not for the endpoint", () => {
    // Said in the module itself, so nobody reads this as more than it
    // is. sourceWithComments, not code(): the COMMENT is the thing being
    // asserted here, and code() strips comments by design. Using the
    // wrong one failed, which is the helper working.
    const src = sourceWithComments("src/lib/social/approvalForPost.ts");
    expect(src).toMatch(/OMITS the approval/);
    expect(src).toMatch(/closes for the CHAT/);
  });

  it("and the Social page is untouched", () => {
    const page = code("src/app/dashboard/social/page.tsx");
    expect(page).toMatch(/\/api\/social\/post/);
    expect(page).not.toMatch(/approval_id/);
  });
});

describe("the module's own edges", () => {
  it("A READ ERROR REFUSES — it does not fail open", async () => {
    // An id was supplied, so the owner's intent was to post an approved
    // thing. If the approval cannot be read, posting anyway is posting
    // with the check switched off.
    const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "db down" } }) }) }) }) };
    const r = await checkPostApproval(broken, "d1", "ap-post-1", CAPTION);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(500);
  });

  it("no id at all is NOT an error — that is the Social page", async () => {
    for (const id of [undefined, null, "", "   ", 42]) {
      const r = await checkPostApproval(db(), "d1", id, CAPTION);
      expect(r.ok, String(id)).toBe(true);
      expect((r as any).approvalId).toBeNull();
    }
  });

  it("A ROW ALREADY REJECTED IS NOT QUIETLY APPROVED BY THE SPEND", async () => {
    // The UPDATE is conditional on status === "pending", which is the
    // same row mutex the approvals route uses. Without it, two requests
    // racing would both spend the row — and a rejected row would be
    // flipped to approved by a late post.
    approvals = [pending({ status: "rejected" })];
    await spendPostApproval(db(), "ap-post-1");
    expect(approvals[0].status).toBe("rejected");
  });

  it("and spending nothing is not an error", async () => {
    await expect(spendPostApproval(db(), null)).resolves.toBeUndefined();
  });

  it("a row with no agreed text does not block the post", async () => {
    // Defensive: a row written before expect_text was stored should not
    // refuse everything. The endpoint's own expect_text check still runs.
    approvals = [pending({ action_details: { destination: "facebook" } })];
    const r = await checkPostApproval(db(), "d1", "ap-post-1", CAPTION);
    expect(r.ok).toBe(true);
  });
});
