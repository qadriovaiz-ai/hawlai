// YouTube publishing — token refresh (access tokens expire hourly,
// unlike Meta's long-lived page tokens) + the actual resumable upload
// YouTube's Data API requires for video files (a single POST with the
// video bytes isn't supported the way Facebook's /photos endpoint
// allows for images).

interface YoutubeCreds {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string | null;
}

// Refreshes the access token if it's expired or about to be — returns
// the token to use plus, if a refresh happened, the new expiry to
// persist. Callers are responsible for saving that back to the DB;
// this function doesn't touch Supabase itself, keeping it a pure
// token-management concern.
export async function getValidYoutubeAccessToken(creds: YoutubeCreds): Promise<{ accessToken: string; refreshed?: { accessToken: string; expiry: string } }> {
  const expiresAt = creds.tokenExpiry ? new Date(creds.tokenExpiry).getTime() : 0;
  const stillValid = expiresAt - Date.now() > 5 * 60 * 1000; // 5 min buffer
  if (stillValid) return { accessToken: creds.accessToken };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: creds.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.error ?? "Couldn't refresh YouTube access — reconnect the channel in Integrations.");

  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { accessToken: data.access_token, refreshed: { accessToken: data.access_token, expiry } };
}

export async function uploadVideoToYouTube(
  accessToken: string,
  videoUrl: string,
  title: string,
  description: string
): Promise<{ videoId: string; url: string }> {
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error("Couldn't fetch the generated video to upload it");
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  const metadata = {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 5000), categoryId: "22" }, // 22 = People & Blogs, a reasonable default for business/marketing content
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };

  // Step 1: initiate the resumable upload session with metadata only.
  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(videoBuffer.length),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Couldn't start the YouTube upload (${initRes.status})`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube didn't return an upload session — try again");

  // Step 2: PUT the actual video bytes to the session URL.
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBuffer.length) },
    body: videoBuffer,
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.id) {
    throw new Error(uploadData?.error?.message ?? "YouTube upload failed");
  }

  return { videoId: uploadData.id, url: `https://www.youtube.com/watch?v=${uploadData.id}` };
}
