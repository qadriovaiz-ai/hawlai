import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("agency_branding")
    .select("logo_url, primary_color, agency_name, hide_hawlai_branding")
    .eq("owner_id", user.id)
    .maybeSingle();

  return NextResponse.json(data ?? { logo_url: null, primary_color: "#7c3aed", agency_name: "", hide_hawlai_branding: false });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agencyName, primaryColor, hideHawlaiBranding, logoBase64 } = await request.json();

  let logoUrl: string | undefined;
  if (logoBase64) {
    const match = String(logoBase64).match(/^data:(image\/\w+);base64,(.+)$/);
    const mimeType = match?.[1] ?? "image/png";
    const rawBase64 = match?.[2] ?? logoBase64;
    const buffer = Buffer.from(rawBase64, "base64");
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const filePath = `agency-branding/${user.id}/logo-${Date.now()}.${ext}`;

    const serviceClient = createServiceClient();
    const { error: uploadError } = await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    logoUrl = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath).data.publicUrl;
  }

  const { error } = await supabase.from("agency_branding").upsert(
    {
      owner_id: user.id,
      ...(logoUrl !== undefined && { logo_url: logoUrl }),
      ...(primaryColor !== undefined && { primary_color: primaryColor }),
      ...(agencyName !== undefined && { agency_name: agencyName }),
      ...(hideHawlaiBranding !== undefined && { hide_hawlai_branding: hideHawlaiBranding }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, logoUrl });
}
