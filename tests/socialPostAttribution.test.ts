// The mark reaches the post that actually goes out (Phase 0 wiring).
//
// The column and the read model landed first (migration 196); until the
// publishing path puts the mark on a link, nothing ever fills them. This
// is that path: chat's Approve & Publish card carries the draft's id to
// /api/social/post, which marks the Facebook copy.
//
// Instagram stays unattributed, by decision: its captions have every link
// replaced with "link in bio", so there is nothing there to mark.

import { describe, it, expect, vi, beforeEach } from "vitest";

const PIECE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";
const SITE = "https://hawlai.online/book/candle-by-qaaf";

let tables: Record<string, any[]>;
let posted: { fb: string | null; ig: string | null };

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "TOKEN" }));
vi.mock("@/lib/agents/socialMediaAgent", () => ({
  postPhotoToPage: async (_p: string, _t: string, _u: string, caption: string) => ((posted.fb = caption), { id: "fb1" }),
  postTextToPage: async (_p: string, _t: string, message: string) => ((posted.fb = message), { id: "fb1" }),
  getConnectedInstagramAccountId: async () => "IG1",
  postPhotoToInstagram: async (_i: string, _t: string, _u: string, caption: string) => ((posted.ig = caption), { id: "ig1" }),
}));

import { POST } from "@/app/api/social/post/route";
import { socialPublishAction } from "@/lib/chat/publishActions";
import { PIECE_PARAM } from "@/lib/attribution/contentLink";

const post = (body: any) =>
  POST(new Request("https://hawlai.online/api/social/post", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  posted = { fb: null, ig: null };
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", fb_page_id: "PAGE1", fb_page_access_token: "TOKEN" }],
    content_pieces: [
      { id: PIECE, dealership_id: "d1" },
      { id: THEIRS, dealership_id: "d2" },
    ],
  };
});

describe("the approval card carries the draft's identity", () => {
  it("the id that Reject would discard is the id the post is counted against", () => {
    const action = socialPublishAction({ caption: "Slots open", imageUrl: null, draftId: PIECE })!;
    expect(action.payload.content_piece_id).toBe(PIECE);
    expect(action.discard?.payload).toMatchObject({ id: PIECE });
    // An ad-hoc caption with no saved draft carries nothing, rather than
    // inventing an identity for a piece that was never saved.
    expect(socialPublishAction({ caption: "Slots open" })!.payload.content_piece_id).toBeNull();
  });
});

describe("what Facebook actually receives", () => {
  it("THE WIRING: the site link in the posted copy carries the mark", async () => {
    const res = await post({ caption: `Workshop Saturday. Book: ${SITE}`, content_piece_id: PIECE });
    expect(res.status).toBe(200);
    expect(posted.fb).toBe(`Workshop Saturday. Book: ${SITE}?${PIECE_PARAM}=${PIECE}`);
  });

  it("ANOTHER BUSINESS'S PIECE ID MARKS NOTHING", async () => {
    await post({ caption: `Book: ${SITE}`, content_piece_id: THEIRS });
    expect(posted.fb).toBe(`Book: ${SITE}`);
  });

  it("no piece id: the caption goes out exactly as written", async () => {
    await post({ caption: `Book: ${SITE}` });
    expect(posted.fb).toBe(`Book: ${SITE}`);
  });

  it("Instagram's caption is left unmarked — organic Instagram stays unattributed", async () => {
    await post({ caption: `Book: ${SITE}`, image_url: "https://cdn.example/x.png", post_to_instagram: true, content_piece_id: PIECE });
    expect(posted.fb).toContain(`${PIECE_PARAM}=${PIECE}`);
    expect(posted.ig).toBe(`Book: ${SITE}`);
    expect(posted.ig).not.toContain(PIECE_PARAM);
  });
});
