// THE PHOTOS STEP'S RULES — onboarding P5.
//
// Pure, so the gate, the limits and the storage path are all checked
// without a browser, a bucket or a request.
//
// THE SIZE LIMIT IS NOT A PREFERENCE, IT IS THE PLATFORM. A serverless
// request body on Vercel is capped at about 4.5 MB, and base64 inflates
// a file by roughly a third on the way up. A photo straight off a phone
// is commonly 3-5 MB, so an untouched upload would fail for most of the
// people this screen exists for — and it would fail as a platform error
// with nothing useful on the screen. The component shrinks every image
// before it is sent; these are the numbers it shrinks to and the
// ceiling the API refuses above.

/** The founder's rule: one photo before setup can continue. */
export const MIN_PHOTOS = 1;

/** The design's own counter reads "0 / 15". */
export const MAX_PHOTOS = 15;

/** Longest edge after shrinking. Enough for a post or an ad creative. */
export const MAX_EDGE_PX = 1600;

/** Re-encoding quality. Visually indistinguishable, a fraction of the bytes. */
export const JPEG_QUALITY = 0.85;

/**
 * The most we will accept for one photo, in raw bytes, BEFORE base64.
 *
 * Deliberately well under the platform's ~4.5 MB body cap: base64 adds
 * about a third, and the JSON around it is not free either.
 */
export const MAX_RAW_BYTES = 3_000_000;

/** What a phone camera or a gallery will actually hand over. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isAcceptedImageType(mime: unknown): boolean {
  return typeof mime === "string" && (ACCEPTED_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/** Can setup move on from the photos step? */
export function enoughPhotos(count: number): boolean {
  return Number.isFinite(count) && count >= MIN_PHOTOS;
}

/** Is there room for another? */
export function roomForMore(count: number): boolean {
  return count < MAX_PHOTOS;
}

/**
 * Pull the bytes and the type out of a data URL.
 *
 * NULL RATHER THAN A GUESS. The upload route defaulted a missing type
 * to image/jpeg once; a PNG stored as a JPEG renders as a broken image
 * and nothing says why.
 */
export function readDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = /^data:([a-z]+\/[a-z0-9+.-]+);base64,(.+)$/i.exec(String(dataUrl ?? "").trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!isAcceptedImageType(mime)) return null;
  return { mime, base64: match[2] };
}

/** Roughly how many bytes a base64 payload decodes to. */
export function decodedByteLength(base64: string): number {
  const clean = String(base64 ?? "").replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Where this photo goes inside the existing `ad-creatives` bucket.
 *
 * THE OWNER'S FILENAME IS NOT A PATH. It is reduced to a short safe
 * stem and the timestamp is what makes it unique, so a name with a
 * slash, a traversal or a hundred characters of Hindi cannot decide
 * where the file lands.
 *
 * AND THE EXTENSION COMES FROM THE TYPE WE READ, not from the name.
 * The name is the owner's; the type is what the bytes actually are, and
 * a PNG stored as .jpg renders as a broken image with nothing saying
 * why.
 */
export function photoStoragePath(dealershipId: string, filename: string, mime: string, now: Date = new Date()): string {
  // AND A STEM OF NOTHING BUT SEPARATORS IS NOT A NAME EITHER. The
  // first version fell back to "photo" only for a completely empty
  // stem, so a filename in any non-Latin script — "मेरी-दुकान.jpg" —
  // kept its hyphen and produced "--1000.jpg". Found by a test, not in
  // production, but it would have been every Hindi filename.
  const stem =
    String(filename ?? "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 40) || "photo";
  const ext = EXTENSION[String(mime ?? "").toLowerCase()] ?? "jpg";
  return `business-photos/${dealershipId}/${stem}-${now.getTime()}.${ext}`;
}
