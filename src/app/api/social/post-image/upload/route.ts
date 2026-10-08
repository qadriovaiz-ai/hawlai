// The owner's own photo, for a post.
//
// The first of the three options the post card offers (see
// src/lib/chat/postImages.ts). It exists because the chat stopped
// inventing product photos on 8 October 2026 and the honest replacement
// is the picture the owner already has on her phone.
//
// Reuses the "ad-creatives" bucket every other upload path in this app
// uses, under a post-images/ prefix, so no new bucket and no migration.
// The upload runs through the service client, as all app uploads do;
// nothing uploads from the browser directly.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { checkUpload, uploadPath } from "@/lib/chat/postImages";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { imageBase64 } = await request.json();
  if (!imageBase64) return NextResponse.json({ error: "No image provided" }, { status: 400 });

  const match = String(imageBase64).match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });

  const buffer = Buffer.from(match[2], "base64");
  const check = checkUpload(match[1], buffer.length);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // EXIF GOES, INCLUDING WHERE THE PHOTO WAS TAKEN.
  //
  // A phone photo of a candle on a kitchen table carries GPS
  // coordinates, and this image is about to be public on a Facebook
  // Page. .rotate() with no argument bakes the EXIF orientation into
  // the pixels FIRST, so stripping the metadata doesn't leave the
  // picture sideways; sharp then writes the output with no EXIF at all.
  let clean: Buffer;
  try {
    const sharp = (await import("sharp")).default;
    clean = await sharp(buffer).rotate().toBuffer();
  } catch (err: any) {
    // A file sharp cannot read is not a file worth publishing.
    return NextResponse.json({ error: "That image couldn't be read — try a different file." }, { status: 400 });
  }

  const filePath = uploadPath(dealershipId, check.ext);
  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from("ad-creatives")
    .upload(filePath, clean, { contentType: check.mimeType, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
  return NextResponse.json({ url: publicUrlData.publicUrl, source: "uploaded" });
}
