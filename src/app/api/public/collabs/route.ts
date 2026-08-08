import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Public board — no login required, same pattern as the storefront's
// /api/public/orders using the service client directly rather than
// relying on an anon RLS policy.
export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("collab_listings")
    .select("id, title, description, compensation_type, compensation_details, created_at, dealerships(dealership_name, business_category, city)")
    .eq("is_public", true)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data ?? [] });
}
