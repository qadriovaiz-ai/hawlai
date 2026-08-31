// ------------------------------------------------------------------
// Canva design creation, asset upload and export.
// ------------------------------------------------------------------
// VERIFIED endpoints:
//   POST /v1/designs        create (scope design:content:write).
//                           Response carries urls.edit_url and
//                           urls.view_url, valid 30 days, and usable
//                           only by the user who requested them.
//   POST /v1/exports        start an export (scope design:content:read
//                           — there is no separate export scope).
//   GET  /v1/exports/{id}   poll it. There is NO export webhook; this
//                           polling is the only completion signal.
//   POST /v1/asset-uploads  binary upload, Content-Type
//                           application/octet-stream, name base64'd
//                           into an Asset-Upload-Metadata header
//                           (scope asset:write). Also asynchronous.
//
// Export download URLs are valid for 24 HOURS ONLY, which is why
// nothing here ever hands one back to be stored — the caller copies
// the bytes into Supabase Storage and keeps that path instead.
// ------------------------------------------------------------------

import { canvaFetch } from "./client";

export interface CreatedDesign {
  designId: string;
  editUrl: string;
}

async function readError(res: Response, action: string): Promise<never> {
  const text = await res.text();
  throw new Error(`Canva ${action} failed (${res.status}): ${text.slice(0, 300)}`);
}

/**
 * Creates an empty design at the given pixel size.
 *
 * Canva caps each side at 40-8000px and the total area at 25 million
 * square pixels; both are enforced by the caller before we get here so
 * the failure is a helpful message rather than a raw Canva error.
 */
export async function createDesign(
  accessToken: string,
  opts: { title: string; width: number; height: number; assetId?: string }
): Promise<CreatedDesign> {
  const body: Record<string, unknown> = {
    design_type: { type: "custom", width: opts.width, height: opts.height },
    title: opts.title,
  };
  // When an asset is supplied the design opens with that image already
  // placed — this is what makes "edit an existing photo" one click
  // rather than a create-then-upload-then-find-it dance.
  if (opts.assetId) body.asset_id = opts.assetId;

  const res = await canvaFetch(accessToken, "/designs", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) await readError(res, "design creation");

  const data = await res.json();
  const designId = data?.design?.id;
  const editUrl = data?.design?.urls?.edit_url;
  if (!designId || !editUrl) throw new Error("Canva created a design but returned no edit link.");
  return { designId, editUrl };
}

/**
 * Uploads bytes to the user's Canva account and returns the asset id.
 *
 * Asynchronous like everything else here: the POST returns a job, and
 * the job has to be polled until the asset actually exists.
 */
export async function uploadAsset(accessToken: string, bytes: Buffer, name: string): Promise<string> {
  // Canva caps unencoded asset names at 50 characters.
  const safeName = name.slice(0, 50);
  const res = await fetch("https://api.canva.com/rest/v1/asset-uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(safeName).toString("base64") }),
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) await readError(res, "asset upload");

  const started = await res.json();
  let job = started?.job;
  if (job?.status === "success" && job?.asset?.id) return job.asset.id;

  const jobId = job?.id;
  if (!jobId) throw new Error("Canva accepted the upload but returned no job to track.");

  // Bounded rather than open-ended: this runs inside a request, and an
  // unbounded loop would hold the connection open until the platform
  // killed it with no explanation for the user.
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await canvaFetch(accessToken, `/asset-uploads/${jobId}`);
    if (!poll.ok) continue;
    job = (await poll.json())?.job;
    if (job?.status === "success" && job?.asset?.id) return job.asset.id;
    if (job?.status === "failed") throw new Error("Canva couldn't process that image.");
  }
  throw new Error("Canva is taking longer than expected to process that image. Please try again.");
}

// ---------------- Export ----------------

export type ExportFormat = "png" | "jpg" | "mp4" | "pdf";

export async function startExport(accessToken: string, designId: string, format: ExportFormat): Promise<string> {
  const res = await canvaFetch(accessToken, "/exports", {
    method: "POST",
    body: JSON.stringify({ design_id: designId, format: { type: format } }),
  });
  if (!res.ok) await readError(res, "export");

  const jobId = (await res.json())?.job?.id;
  if (!jobId) throw new Error("Canva started an export but returned no job id.");
  return jobId;
}

export interface ExportStatus {
  status: "in_progress" | "success" | "failed";
  urls?: string[];
  error?: string;
}

export async function getExportStatus(accessToken: string, jobId: string): Promise<ExportStatus> {
  const res = await canvaFetch(accessToken, `/exports/${jobId}`);
  if (!res.ok) await readError(res, "export status check");

  const job = (await res.json())?.job;
  return {
    status: job?.status ?? "in_progress",
    urls: job?.urls,
    // Canva's export failures are often actionable in a way the user
    // can fix — an unlicensed stock photo, or a design awaiting team
    // approval — so the reason is carried through rather than dropped.
    error: job?.error?.message ?? job?.error?.code,
  };
}

export const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
};
