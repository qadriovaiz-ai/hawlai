// ------------------------------------------------------------------
// WordPress Agent — the CONNECTION TEST, and nothing that writes
// ------------------------------------------------------------------
// Application Passwords are built into WordPress core since 5.6: the
// site owner creates one themselves (Users -> Profile -> Application
// Passwords) and pastes it in. No plugin, no OAuth app registration,
// no review.
//
// `publishWordPressPost` WAS HERE AND WAS DELETED on 22 November 2026,
// at the owner's instruction, while sizing the WordPress work.
//
// It had ZERO callers and had never run. What it did was POST to
// /wp-json/wp/v2/posts on a live site with no approval record, no
// preview, no claims check, no staleness re-read and no idempotency
// key — every protection this codebase has for a public-facing write,
// absent. It was not a Rule 6 violation, because nothing called it.
// It was worse than that: a working publisher sitting one import away
// from a chat tool, in the file anyone building WordPress support
// would open first.
//
// THE REPLACEMENT IS NOT A FUNCTION HERE. WordPress publishing goes
// through the PublishPlatform contract like every other platform —
// preview reads, execute re-reads and compares against the approved
// before-value, undo proposes rather than writes, and the approval row
// is the record of what was agreed. See docs/RESEARCH-WOO-WP.md.
//
// tests/wordpressNoUngatedPublisher.test.ts fails if a writing
// function reappears in this file.
// ------------------------------------------------------------------

function normalizeSiteUrl(siteUrl: string): string {
  let url = siteUrl.trim();
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url.replace(/\/$/, "");
}

export async function testWordPressConnection(siteUrl: string, username: string, appPassword: string): Promise<{ success: boolean; siteName?: string; error?: string }> {
  try {
    const domain = normalizeSiteUrl(siteUrl);
    const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(`${domain}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return { success: false, error: `WordPress returned ${res.status} — check the site URL, username, and application password` };
    const data = await res.json();
    return { success: true, siteName: data?.name ?? domain };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
