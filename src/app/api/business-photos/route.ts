import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  MAX_PHOTOS,
  MAX_RAW_BYTES,
  decodedByteLength,
  photoStoragePath,
  readDataUrl,
  roomForMore,
} from "@/lib/onboarding/photos";

// The photos a business gives Hawlai — onboarding step 5 (migration
// 214), and the gallery afterwards.
//
// RECORDED, NOT JUST STORED. Logos are uploaded and never written to a
// table, so dashboard/assets finds them by listing the storage folder.
// That cannot support "at least one photo before you can continue": a
// gate counting a folder listing fails open the first time the listing
// is slow, paginated or denied.
//
// NO NEW BUCKET. These go under business-photos/<dealership_id>/ in the
// existing `ad-creatives` bucket, which logos, hero images and
// generated creatives already use — a new bucket is a step the owner
// would have to do by hand.
//
// THE SERVICE CLIENT WRITES, AFTER THE SERVER CLIENT HAS RESOLVED THE
// BUSINESS FROM THE SESSION. The same pattern this codebase uses
// everywhere a write needs to bypass RLS but must still belong to the
// signed-in owner: the dealership comes from auth.uid(), never from
// the request body.

async function resolveDealership() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) } as const;

  // Owner-only, re-checked rather than trusted from the profile row.
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("id")
    .eq("id", dealershipId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!dealership) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) } as const;

  return { dealershipId: dealership.id as string } as const;
}

export async function GET() {
  const resolved = await resolveDealership();
  if ("error" in resolved) return resolved.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from("business_photos")
    .select("id, public_url, kind, created_at")
    .eq("dealership_id", resolved.dealershipId)
    .order("created_at", { ascending: false })
    .limit(MAX_PHOTOS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ photos: data ?? [] });
}

export async function POST(request: Request) {
  const resolved = await resolveDealership();
  if ("error" in resolved) return resolved.error;
  const { dealershipId } = resolved;

  const { photo_base64, filename, kind } = await request.json();

  // WHAT IT IS, FROM THE BYTES. An earlier upload route in this
  // codebase defaults a missing type to image/jpeg; a PNG stored as a
  // JPEG renders as a broken image and nothing says why.
  const read = readDataUrl(String(photo_base64 ?? ""));
  if (!read) {
    return NextResponse.json({ error: "Send a JPEG, PNG or WebP image" }, { status: 400 });
  }

  // THE PLATFORM'S LIMIT, SAID AS A SENTENCE. A body over about 4.5 MB
  // is refused by the platform itself, with nothing useful reaching the
  // screen. The component shrinks before sending; this is the ceiling.
  if (decodedByteLength(read.base64) > MAX_RAW_BYTES) {
    return NextResponse.json({ error: "That photo is too large — try a smaller one" }, { status: 400 });
  }

  const service = createServiceClient();

  // THE CAP IS COUNTED, NOT ASSUMED. The screen stops offering the
  // button at fifteen, and a second tab would otherwise walk past it.
  const { count, error: countError } = await service
    .from("business_photos")
    .select("id", { count: "exact", head: true })
    .eq("dealership_id", dealershipId);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if (!roomForMore(count ?? 0)) {
    return NextResponse.json({ error: `That is the most I can keep for now (${MAX_PHOTOS})` }, { status: 400 });
  }

  const storagePath = photoStoragePath(dealershipId, String(filename ?? ""), read.mime);
  const { error: uploadError } = await service.storage
    .from("ad-creatives")
    .upload(storagePath, Buffer.from(read.base64, "base64"), { contentType: read.mime, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = service.storage.from("ad-creatives").getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    return NextResponse.json({ error: "Uploaded, but could not work out its address" }, { status: 500 });
  }

  const { data: row, error: insertError } = await service
    .from("business_photos")
    .insert({
      dealership_id: dealershipId,
      storage_path: storagePath,
      public_url: publicUrl,
      kind: typeof kind === "string" && kind.trim() ? kind.trim().slice(0, 80) : null,
    })
    .select("id, public_url, kind, created_at")
    .single();

  // A FILE IN STORAGE WITH NO ROW IS A PHOTO NOTHING CAN FIND, and it
  // would make the gate's count wrong in the direction that blocks the
  // owner. Put back rather than left behind.
  if (insertError) {
    await service.storage.from("ad-creatives").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ photo: row });
}

export async function DELETE(request: Request) {
  const resolved = await resolveDealership();
  if ("error" in resolved) return resolved.error;

  const { id } = await request.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Which photo?" }, { status: 400 });
  }

  const service = createServiceClient();
  // SCOPED TO THIS BUSINESS IN THE QUERY, not checked afterwards: the
  // service client bypasses RLS, so the scoping has to be written here
  // or it is not there at all.
  const { data: photo } = await service
    .from("business_photos")
    .select("id, storage_path")
    .eq("id", id)
    .eq("dealership_id", resolved.dealershipId)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const { error } = await service.from("business_photos").delete().eq("id", photo.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // THE ROW FIRST, THE FILE SECOND. A row with no file renders as a
  // broken image; a file with no row is invisible and harmless. If this
  // fails the owner is not blocked by it.
  await service.storage.from("ad-creatives").remove([photo.storage_path]);

  return NextResponse.json({ success: true });
}
