import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readUnsubscribeToken, suppressEmail, siteUrl } from "@/lib/email/consent";

// Unsubscribe from one business's marketing email.
//
// Two callers, both POST:
//  - Gmail/Yahoo's one-click unsubscribe (List-Unsubscribe-Post header),
//    which expects a plain 2xx and nothing else;
//  - the confirm button on /unsubscribe/[token], which gets sent back to
//    that page to see it worked.
// GET does nothing: link scanners and inbox previews fetch links, and a
// fetch must never unsubscribe anyone.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await request.formData().catch(() => null);
  const fromPage = form?.get("from") === "page";

  const service = createServiceClient();
  let target: Awaited<ReturnType<typeof readUnsubscribeToken>>;
  try {
    target = await readUnsubscribeToken(service, token);
  } catch {
    return fromPage
      ? NextResponse.redirect(`${siteUrl()}/unsubscribe/${encodeURIComponent(token)}?error=1`, 303)
      : NextResponse.json({ error: "Unsubscribe is unavailable right now — try again." }, { status: 503 });
  }
  if (!target) {
    return fromPage
      ? NextResponse.redirect(`${siteUrl()}/unsubscribe/${encodeURIComponent(token)}`, 303)
      : NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 404 });
  }

  const result = await suppressEmail(service, target.dealershipId, target.email, "unsubscribed", fromPage ? "unsubscribe_page" : "one_click");
  if (!result.ok) {
    return fromPage
      ? NextResponse.redirect(`${siteUrl()}/unsubscribe/${encodeURIComponent(token)}?error=1`, 303)
      : NextResponse.json({ error: "Unsubscribe is unavailable right now — try again." }, { status: 503 });
  }
  return fromPage ? NextResponse.redirect(`${siteUrl()}/unsubscribe/${encodeURIComponent(token)}?done=1`, 303) : NextResponse.json({ unsubscribed: true });
}
