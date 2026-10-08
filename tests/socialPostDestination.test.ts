// THE FACEBOOK POST INCIDENT, 8 October 2026.
//
// The owner asked for an Instagram caption. Hawlai showed a card titled
// "Instagram Post" with a caption, a hashtag block and a generated
// image, and a button reading "Approve & Publish". She pressed it.
//
// What happened: the post went PUBLICLY to the business's Facebook Page,
// without the hashtags, and Hawlai's next message mentioned that no
// Instagram account was connected.
//
// Four separate things had to be true for that, and each one is pinned
// here:
//
//   1. the button said nothing about WHERE        -> it names the Page
//   2. "is Instagram connected?" ran after the    -> resolved before the
//      press, inside the endpoint                    button exists
//   3. the card's text and the payload's text     -> one composer
//      came from two different functions
//   4. nothing read the post back, and nothing    -> read-back + a
//      offered to take it down                       Remove button
//
// Everything here is execution, not source reading: the endpoint is
// called, and the Graph calls it would make are counted.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { composePost, samePostText } from "@/lib/chat/socialPost";
import { readDestinations, publicPostConfirm } from "@/lib/chat/destinations";

// --- the Graph calls, counted -----------------------------------------
let igAccount: string | null | "throw" = "IG1";
let landedText: string | undefined = undefined;
let deleted: string[] = [];
let stillReadableAfterDelete = false;
let deleteOutcome: { deleted: boolean; error?: string } = { deleted: true };
let presence: { state: "gone" | "present" | "unknown"; detail?: string } = { state: "gone" };
const postPhotoToPage = vi.fn(async (..._a: any[]) => ({ id: "PAGE1_photo" }));
const postTextToPage = vi.fn(async (..._a: any[]) => ({ id: "PAGE1_text" }));
const postPhotoToInstagram = vi.fn(async (..._a: any[]) => ({ id: "ig_1" }));

vi.mock("@/lib/agents/socialMediaAgent", () => ({
  postPhotoToPage: (...a: any[]) => postPhotoToPage(...a),
  postTextToPage: (...a: any[]) => postTextToPage(...a),
  postPhotoToInstagram: (...a: any[]) => postPhotoToInstagram(...a),
  getConnectedInstagramAccountId: async () => {
    if (igAccount === "throw") throw new Error("Graph is down");
    return igAccount;
  },
  readPostMessage: async (id: string) => (deleted.includes(id) && !stillReadableAfterDelete ? undefined : landedText),
  deletePostFromPage: async (id: string) => (deleted.push(id), deleteOutcome),
  checkPostPresence: async () => presence,
}));

let hasToken = true;
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => (hasToken ? "TOKEN" : null) }));

let dealership: Record<string, any> = { id: "d1", fb_page_id: "PAGE1", fb_page_name: "Candle by Qaaf" };
let draft: Record<string, any> | null = null;
let updates: { table: string; values: Record<string, any>; filters: [string, any][] }[] = [];
function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let op = "select";
    let values: Record<string, any> = {};
    const row = () => (table === "profiles" ? { dealership_id: "d1" } : table === "content_pieces" ? draft : dealership);
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: () => api,
      update: (v: Record<string, any>) => ((op = "update"), (values = v), api),
      single: async () => ({ data: row(), error: null }),
      maybeSingle: async () => ({ data: row(), error: null }),
      then: (res: any, rej: any) => {
        if (op === "update") updates.push({ table, values, filters: [...filters] });
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/attribution/pieces", () => ({ registerPiece: async () => null }));

import { POST as socialPost } from "@/app/api/social/post/route";
import { POST as unpublish } from "@/app/api/social/unpublish/route";

const call = (fn: any, body: any) =>
  fn(new Request("https://hawlai.online/x", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  igAccount = "IG1";
  hasToken = true;
  landedText = undefined;
  deleted = [];
  stillReadableAfterDelete = false;
  deleteOutcome = { deleted: true };
  presence = { state: "gone" };
  dealership = { id: "d1", fb_page_id: "PAGE1", fb_page_name: "Candle by Qaaf" };
  draft = null;
  updates = [];
  postPhotoToPage.mockClear();
  postTextToPage.mockClear();
  postPhotoToInstagram.mockClear();
});

// ---------------------------------------------------------------------
// 3. The card's text and the payload's text are the same text.
// ---------------------------------------------------------------------

describe("what the card shows is what gets published", () => {
  it("THE HASHTAGS ARE IN THE TEXT - the posted copy was missing them", () => {
    // The live shape: a caption object with a hashtags array beside it.
    // The card appended them; the payload's own composer returned the
    // first string field and never looked at `hashtags`.
    const composed = composePost({
      text: "Warm light for a quiet Christmas.",
      hashtags: ["candles", "#Lucknow"],
      _claimsNote: "machinery, not words",
    });
    expect(composed.text).toBe("Warm light for a quiet Christmas.\n\n#candles #Lucknow");
    expect(composed.hashtags).toEqual(["#candles", "#Lucknow"]);
    // The agent's own notes are not part of the post.
    expect(composed.text).not.toMatch(/machinery/);
  });

  it("a heading leads, and every other written field survives", () => {
    const composed = composePost({ body: "Second.", headline: "First.", note: "ignored" });
    expect(composed.text).toBe("First.\n\nSecond.");
    expect(composed.heading).toBe("First.");
    expect(composed.text).not.toMatch(/ignored/);
  });

  it("nothing to say composes to nothing, rather than to an empty-looking post", () => {
    expect(composePost(null).text).toBe("");
    expect(composePost({ hashtags: ["#x"] }).text).toBe("#x");
  });

  it("the AUTOPILOT stays stricter, on purpose", async () => {
    // The first attempt at this fix pointed the autopilot at composePost
    // too, and three of its own tests went red: a result that is only
    // hashtags composed to "#candles" and would have been posted
    // unsupervised. The card and the autopilot want opposite things —
    // the card must show everything that will go out, the autopilot must
    // refuse anything that is not a real caption — so they do not share
    // a composer.
    const { captionForPost } = await import("@/lib/automation/contentAutopilot");
    expect(captionForPost({ hashtags: ["#candles"] })).toBe("");
    expect(composePost({ hashtags: ["#candles"] }).text).toBe("#candles");
    // And the card does not drop a hook the autopilot would ignore.
    expect(captionForPost({ hook: "Stop scrolling.", caption: "Meet the Lavender candle." })).toBe("Meet the Lavender candle.");
    expect(composePost({ hook: "Stop scrolling.", caption: "Meet the Lavender candle." }).text).toMatch(/Stop scrolling/);
  });

  it("the read-back forgives whitespace and catches a dropped hashtag block", () => {
    const approved = "Warm light.\n\n#candles #Lucknow";
    expect(samePostText(approved, "Warm light. #candles #Lucknow")).toBe(true);
    // Exactly the live difference.
    expect(samePostText(approved, "Warm light.")).toBe(false);
    // Unreadable is not a match.
    expect(samePostText(approved, undefined)).toBe(false);
    expect(samePostText(approved, "")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 2. Where a post would go, settled before the button exists.
// ---------------------------------------------------------------------

describe("the destination is resolved before anything is offered", () => {
  it("a connected Page is named; Instagram only when Meta says an account is linked", async () => {
    const d = await readDestinations(db(), "d1");
    expect(d.facebook).toMatchObject({ platform: "facebook", name: "Candle by Qaaf", connected: true });
    expect(d.instagram.connected).toBe(true);
    expect(d.anyConnected).toBe(true);
  });

  it("no linked Instagram account: not connected, and the reason separates DMs from publishing", async () => {
    igAccount = null;
    const d = await readDestinations(db(), "d1");
    expect(d.instagram.connected).toBe(false);
    // Settings says "Instagram DM Auto-Reply: Connected", which is true
    // and has nothing to do with publishing. Saying so is the whole
    // point of the message.
    expect(d.instagram.why).toMatch(/DM replies only/);
    expect(d.facebook.connected).toBe(true);
  });

  it("UNKNOWN IS NOT CONNECTED: if Meta cannot be asked, Instagram is not offered", async () => {
    igAccount = "throw";
    const d = await readDestinations(db(), "d1");
    expect(d.instagram.connected).toBe(false);
    expect(d.instagram.why).toMatch(/check your Instagram connection/i);
  });

  it("no Page token means neither platform, and Meta is never asked", async () => {
    hasToken = false;
    delete process.env.META_PAGE_ACCESS_TOKEN;
    const d = await readDestinations(db(), "d1");
    expect(d.facebook.connected).toBe(false);
    expect(d.instagram.connected).toBe(false);
    expect(d.anyConnected).toBe(false);
  });

  it("the confirmation says the platform, the Page name, and that it is public", () => {
    const c = publicPostConfirm({ platform: "facebook", name: "Candle by Qaaf", connected: true, why: null }, { hasImage: true });
    expect(c).toMatch(/your Facebook Page: Candle by Qaaf/);
    expect(c).toMatch(/this image and this caption/);
    expect(c).toMatch(/Anyone can see it/);
    const ig = publicPostConfirm({ platform: "instagram", name: null, connected: true, why: null }, { hasImage: false });
    expect(ig).toMatch(/your Instagram account/);
    expect(ig).not.toMatch(/Facebook/);
  });
});

// ---------------------------------------------------------------------
// 1. An Instagram post is not a Facebook post.
// ---------------------------------------------------------------------

describe("the endpoint posts where it was told to, or nowhere", () => {
  it("THE INCIDENT: Instagram asked for, Instagram unlinked - NOTHING reaches the Page", async () => {
    igAccount = null;
    const res = await call(socialPost, {
      caption: "Warm light.",
      image_url: "https://cdn.example/x.png",
      destination: "instagram",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nothing was posted/);
    // The live bug in one assertion: the Facebook post went out BEFORE
    // the Instagram check, so the owner learned about it afterwards.
    expect(postPhotoToPage).not.toHaveBeenCalled();
    expect(postTextToPage).not.toHaveBeenCalled();
    expect(postPhotoToInstagram).not.toHaveBeenCalled();
  });

  it("an Instagram destination with an image posts to Instagram ONLY", async () => {
    const res = await call(socialPost, {
      caption: "Warm light.",
      image_url: "https://cdn.example/x.png",
      destination: "instagram",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ destination: "instagram", post_id: "ig_1" });
    expect(postPhotoToInstagram).toHaveBeenCalledTimes(1);
    expect(postPhotoToPage).not.toHaveBeenCalled();
  });

  it("Instagram without an image refuses before posting, instead of posting to Facebook", async () => {
    const res = await call(socialPost, { caption: "Warm light.", destination: "instagram" });
    expect(res.status).toBe(400);
    expect(postTextToPage).not.toHaveBeenCalled();
  });

  it("the Social page's own shape is untouched: no destination means Facebook as before", async () => {
    landedText = "Warm light.";
    const res = await call(socialPost, { caption: "Warm light." });
    expect(res.status).toBe(200);
    expect(postTextToPage).toHaveBeenCalledTimes(1);
  });

  it("A TEXT THAT WAS NOT APPROVED IS NOT POSTED", async () => {
    const res = await call(socialPost, {
      caption: "Warm light.",
      expect_text: "Warm light.\n\n#candles",
      destination: "facebook",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/text that was approved/);
    expect(postTextToPage).not.toHaveBeenCalled();
    expect(postPhotoToPage).not.toHaveBeenCalled();
  });

  it("whitespace alone is not a mismatch", async () => {
    landedText = "Warm light.  #candles";
    const res = await call(socialPost, {
      caption: "Warm light.  #candles",
      expect_text: "Warm light.\n#candles",
      destination: "facebook",
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------
// 4. What the Page is actually showing, and taking it down.
// ---------------------------------------------------------------------

describe("the post is read back, and can be removed", () => {
  it("the words that landed are compared, and a difference is reported with the actual text", async () => {
    landedText = "Warm light."; // the hashtags did not land
    const res = await call(socialPost, { caption: "Warm light.\n\n#candles", destination: "facebook" });
    const body = await res.json();
    expect(body.verified).toBe("differs");
    expect(body.landed_text).toBe("Warm light.");
  });

  it("a match is a match", async () => {
    landedText = "Warm light.\n\n#candles";
    const body = await (await call(socialPost, { caption: "Warm light.\n\n#candles", destination: "facebook" })).json();
    expect(body.verified).toBe("match");
    expect(body.landed_text).toBeUndefined();
  });

  it("UNREADABLE IS NOT A MISMATCH, and it is not a match either", async () => {
    landedText = undefined;
    const body = await (await call(socialPost, { caption: "Warm light.", destination: "facebook" })).json();
    expect(body.verified).toBe("unreadable");
  });

  it("a scheduled post has nothing to read back yet, and says so", async () => {
    const body = await (
      await call(socialPost, { caption: "Warm light.", destination: "facebook", scheduled_time: "2026-12-01T10:00:00Z" })
    ).json();
    expect(body.verified).toBe("scheduled");
  });

  it("removal needs the post to be on THIS business's Page", async () => {
    const res = await call(unpublish, { post_id: "SOMEONEELSE_99" });
    expect(res.status).toBe(403);
    expect(deleted).toEqual([]);
  });

  it("a post on this Page is deleted and READ BACK to confirm it is gone", async () => {
    presence = { state: "gone" };
    const body = await (await call(unpublish, { post_id: "PAGE1_photo" })).json();
    expect(deleted).toEqual(["PAGE1_photo"]);
    expect(body).toMatchObject({ removed: true, checked: true, state: "gone" });
    // No claim that nobody saw it.
    expect(body.message).toMatch(/already seen it/);
  });

  it("Facebook saying yes is not the post being gone", async () => {
    presence = { state: "present" };
    const body = await (await call(unpublish, { post_id: "PAGE1_photo" })).json();
    expect(body).toMatchObject({ removed: false, checked: true, state: "present" });
    expect(body.message).toMatch(/still on the Page/);
  });

  it("COULDN'T CHECK IS NOT REMOVED: a Graph failure after the delete says so", async () => {
    // The first version of this endpoint used readPostMessage, whose
    // undefined means BOTH "not there" and "couldn't ask". A rate limit
    // or an expired token would have told the owner her still-public
    // post was gone.
    presence = { state: "unknown", detail: "Facebook answered HTTP 503" };
    const body = await (await call(unpublish, { post_id: "PAGE1_photo" })).json();
    expect(body.removed).toBe(false);
    expect(body.checked).toBe(false);
    expect(body.state).toBe("unknown");
    expect(body.message).toMatch(/couldn't check/i);
    expect(body.message).toMatch(/look at your Page/);
    // Facebook's own words, not a paraphrase.
    expect(body.message).toMatch(/HTTP 503/);
    // And it must not claim removal in passing.
    expect(body.message).not.toMatch(/Removed from your Facebook Page/);
  });

  it("a refused delete is reported as a refusal, with Facebook's own reason", async () => {
    deleteOutcome = { deleted: false, error: "Object does not support deletions" };
    const res = await call(unpublish, { post_id: "PAGE1_photo" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/does not support deletions/);
  });
});

// ---------------------------------------------------------------------
// Addendum 7: three honest places to get a picture, and a record of
// which one it was.
// ---------------------------------------------------------------------

describe("where the picture came from is kept", () => {
  const PIECE = "11111111-1111-4111-8111-111111111111";

  it("the piece records the image AND its source, without losing what was there", async () => {
    // Months later, an owner cannot tell a photo of her candle from a
    // graphic a model made, and neither could Hawlai - which is how an
    // invented product went out as the real one.
    draft = { id: PIECE, topic: "Lavender candle", output: { text: "Warm light.", hashtags: ["#candles"] } };
    landedText = "Warm light.";
    const res = await call(socialPost, {
      caption: "Warm light.",
      destination: "facebook",
      image_url: "https://cdn.example/post-images/d1/1.jpg",
      image_source: "uploaded",
      content_piece_id: PIECE,
    });
    expect(res.status).toBe(200);
    const update = updates.find((u) => u.table === "content_pieces")!;
    expect(update.values.output).toEqual({
      text: "Warm light.",
      hashtags: ["#candles"],
      _imageUrl: "https://cdn.example/post-images/d1/1.jpg",
      _imageSource: "uploaded",
    });
    // Scoped to this business, not just to the row id.
    expect(update.filters).toEqual(expect.arrayContaining([["dealership_id", "d1"]]));
  });

  it("an AI graphic is recorded as one", async () => {
    draft = { id: PIECE, topic: "Lavender candle", output: { text: "Warm light." } };
    landedText = "Warm light.";
    await call(socialPost, {
      caption: "Warm light.",
      destination: "facebook",
      image_url: "https://cdn.example/graphic.png",
      image_source: "ai",
      content_piece_id: PIECE,
    });
    expect(updates.find((u) => u.table === "content_pieces")!.values.output._imageSource).toBe("ai");
  });

  it("a post with no picture writes nothing to the piece", async () => {
    draft = { id: PIECE, topic: "Lavender candle", output: { text: "Warm light." } };
    landedText = "Warm light.";
    await call(socialPost, { caption: "Warm light.", destination: "facebook", content_piece_id: PIECE });
    expect(updates.find((u) => u.table === "content_pieces")).toBeUndefined();
  });

  it("ANOTHER BUSINESS'S PIECE ID records nothing", async () => {
    // The id arrives in a request body. The lookup is already scoped, so
    // a foreign id resolves to no draft at all.
    draft = null;
    landedText = "Warm light.";
    await call(socialPost, {
      caption: "Warm light.",
      destination: "facebook",
      image_url: "https://cdn.example/x.jpg",
      image_source: "uploaded",
      content_piece_id: PIECE,
    });
    expect(updates.find((u) => u.table === "content_pieces")).toBeUndefined();
  });
});
