// Taking down a post that should not have gone up.
//
// THE LIVE INCIDENT (8 Oct 2026). A card titled "Instagram Post" carried
// Approve & Publish; the button published to a Facebook Page, publicly,
// with a generated image. Hawlai's reply afterwards offered no way to
// remove it — the owner had to open Facebook and find the post. A button
// that publishes irreversibly should at least be matched by one that
// undoes what can still be undone.
//
// What this does NOT claim: deleting a post does not unsee it. The
// response says the post is gone from the Page, nothing more.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { deletePostFromPage, readPostMessage } from "@/lib/agents/socialMediaAgent";
import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { post_id } = await request.json();
  if (typeof post_id !== "string" || !post_id.trim()) {
    return NextResponse.json({ error: "Which post?" }, { status: 400 });
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, fb_page_access_token, fb_page_access_token_encrypted")
    .eq("id", dealershipId)
    .single();

  const pageId = dealership?.fb_page_id;
  const pageAccessToken = readMetaPageToken(dealership) ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !pageAccessToken) {
    return NextResponse.json({ error: "Your Facebook Page isn't connected, so I can't remove the post." }, { status: 400 });
  }

  // THE POST MUST BELONG TO THIS BUSINESS'S PAGE.
  //
  // `post_id` arrives in a request body, and a Page post id is
  // `{pageId}_{postId}` — so the prefix is checked against the Page this
  // session's business owns. Without this, any authenticated owner could
  // pass another business's post id and the Page token would happily
  // refuse it or, worse, succeed if the token had the reach.
  const ownsIt = post_id.startsWith(`${pageId}_`) || post_id === pageId;
  if (!ownsIt) {
    return NextResponse.json({ error: "That post isn't on your Facebook Page." }, { status: 403 });
  }

  const result = await deletePostFromPage(post_id, pageAccessToken);
  if (!result.deleted) {
    return NextResponse.json(
      { error: result.error ?? "Facebook wouldn't remove the post. You may need to delete it from the Page directly." },
      { status: 502 }
    );
  }

  // READ BACK, because "success: true" from Graph is not the post being
  // gone. A post that still reads back exists; only an unreadable post
  // is one that has actually been removed, and the difference is
  // reported rather than assumed.
  const still = await readPostMessage(post_id, pageAccessToken);
  return NextResponse.json({
    success: true,
    removed: still === undefined,
    message:
      still === undefined
        ? "Removed from your Facebook Page. Anyone who already saw it has already seen it."
        : "Facebook accepted the delete but the post still reads back — check the Page directly.",
  });
}
