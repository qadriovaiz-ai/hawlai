import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { validateDiscountCode } from "@/lib/discounts";

export async function POST(request: Request) {
  const { slug, code, subtotal } = await request.json();
  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: website } = await supabase.from("websites").select("dealership_id, published").eq("slug", slug).maybeSingle();
  if (!website || !website.published) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const result = await validateDiscountCode(supabase, website.dealership_id, code, Number(subtotal) || 0);
  if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ valid: true, discountAmount: result.discountAmount });
}
