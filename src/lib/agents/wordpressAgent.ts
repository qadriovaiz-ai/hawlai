// ------------------------------------------------------------------
// WordPress Agent — Application Passwords, no approval process
// ------------------------------------------------------------------
// Built into WordPress core since version 5.6 — the site owner
// creates one themselves (Users -> Profile -> Application Passwords)
// and pastes it in. No plugin, no OAuth app registration, no review.
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

export async function publishWordPressPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  title: string,
  content: string,
  status: "draft" | "publish" = "draft"
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  try {
    const domain = normalizeSiteUrl(siteUrl);
    const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(`${domain}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body?.message ?? `WordPress returned ${res.status}` };
    }
    const data = await res.json();
    return { success: true, postUrl: data?.link };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
