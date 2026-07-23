import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Called by the checkout page on a debounce, only once the customer has
// typed a phone number or email — never captures anonymous browsing.
// Upserts by hand (select-then-insert-or-update) rather than a DB-level
// unique constraint, so a customer refining their details across
// several debounce fires updates one evolving row instead of creating
// duplicates. Fully client-reported and never re-verified — this is a
// visibility/follow-up tool for the dealer, not a source of truth for
// money, so unlike /api/public/orders there's no reason to re-check
// prices or stock here.
export async function POST(request: Request) {
  const body = await request.json();
  const { slug, customerName, customerPhone, customerEmail, shippingAddress, items, honeypot } = body;

  if (honeypot) return NextResponse.json({ success: true });
  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });

  const phone = customerPhone ? String(customerPhone).trim() : null;
  const email = customerEmail ? String(customerEmail).trim() : null;
  const hasContact = (phone && phone.length >= 8) || (email && email.includes("@"));
  if (!hasContact) return NextResponse.json({ error: "No contact info provided" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Cart is empty" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: website } = await supabase.from("websites").select("id, dealership_id").eq("slug", slug).maybeSingle();
  if (!website) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  let existingQuery = supabase.from("abandoned_carts").select("id").eq("website_id", website.id);
  existingQuery = phone ? existingQuery.eq("customer_phone", phone) : existingQuery.eq("customer_email", email);
  const { data: existing } = await existingQuery.maybeSingle();

  const record = {
    dealership_id: website.dealership_id,
    website_id: website.id,
    customer_name: customerName ? String(customerName).trim() : null,
    customer_phone: phone,
    customer_email: email,
    shipping_address: shippingAddress ? String(shippingAddress).trim() : null,
    items,
  };

  if (existing) {
    await supabase.from("abandoned_carts").update(record).eq("id", existing.id);
  } else {
    await supabase.from("abandoned_carts").insert(record);
  }

  return NextResponse.json({ success: true });
}
