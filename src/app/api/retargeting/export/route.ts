import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { buildSuppressionList, buildHashedAudienceCsv, type AudienceRow } from "@/lib/ads/audienceHashing";

// Retargeting audience export.
//
// COMPLIANCE FIX: this route previously emitted RAW, UNHASHED phone
// and email to CSV, and filtered by neither dnd_opt_out nor
// consent_status — so a person who had explicitly opted out of contact
// was still exported for ad targeting. Both are now enforced.
//
// Hashing is also simply the correct format: the UI tells dealers to
// upload this to Meta Ads Manager as a Customer List, and Meta
// REQUIRES SHA-256 ("we don't support other hashing mechanisms").
// The old raw file was both a privacy problem and the wrong shape for
// its own stated purpose.

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const segment = searchParams.get("segment");

  let rows: AudienceRow[] = [];

  if (segment === "abandoned_cart") {
    const { data } = await supabase
      .from("abandoned_carts")
      .select("customer_phone, customer_email")
      .eq("dealership_id", dealershipId)
      .eq("contacted", false);
    rows = (data ?? []).map((c: any) => ({ phone: c.customer_phone, email: c.customer_email }));
  } else if (segment === "cold_lead") {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("leads")
      .select("phone, email")
      .eq("dealership_id", dealershipId)
      .neq("status", "converted")
      .lt("created_at", cutoff);
    rows = data ?? [];
  } else if (segment === "lapsed_buyer") {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabase
      .from("orders")
      .select("customer_phone, customer_email, created_at")
      .eq("dealership_id", dealershipId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    const byCustomer: Record<string, { phone: string; email: string; count: number; lastOrder: string }> = {};
    for (const o of orders ?? []) {
      const key = o.customer_phone || o.customer_email;
      if (!key) continue;
      if (!byCustomer[key]) byCustomer[key] = { phone: o.customer_phone, email: o.customer_email, count: 0, lastOrder: o.created_at };
      byCustomer[key].count += 1;
    }
    rows = Object.values(byCustomer)
      .filter((c) => c.count === 1 && c.lastOrder < cutoff)
      .map((c) => ({ phone: c.phone, email: c.email }));
  } else {
    return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
  }

  const suppression = await buildSuppressionList(supabase, dealershipId);
  const result = buildHashedAudienceCsv(rows, suppression);

  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${segment}-audience-hashed.csv"`,
      // Surfaced as headers so the UI can tell the dealer what
      // actually happened — silently exporting fewer people than the
      // segment count showed would look like a bug.
      "X-Audience-Included": String(result.included),
      "X-Audience-Suppressed": String(result.suppressed),
      "X-Audience-Unusable": String(result.skippedNoContact),
    },
  });
}
