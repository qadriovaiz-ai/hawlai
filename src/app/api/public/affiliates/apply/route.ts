import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { dealershipSlug, name, email, phone, notes, honeypot } = body;

  if (honeypot) return NextResponse.json({ success: true });
  if (!dealershipSlug) return NextResponse.json({ error: "Missing business reference" }, { status: 400 });
  if (!name || String(name).trim().length < 2) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Email or phone is required" }, { status: 400 });

  const supabase = createServiceClient();

  // Resolve the business from its storefront slug — the same identifier
  // used on their public website, so an applicant just needs the store's
  // public URL, not an internal id.
  const { data: website } = await supabase.from("websites").select("dealership_id").eq("slug", dealershipSlug).maybeSingle();
  if (!website) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { error } = await supabase.from("affiliates").insert({
    dealership_id: website.dealership_id,
    name: String(name).trim(),
    email: email ?? null,
    phone: phone ?? null,
    notes: notes ?? null,
    status: "pending", // dealer reviews and approves — no code generated until then
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
