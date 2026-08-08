import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

function toCsv(rows: { phone?: string | null; email?: string | null; name?: string | null }[]): string {
  const header = "phone,email,name";
  const lines = rows
    .filter((r) => r.phone || r.email)
    .map((r) => [r.phone ?? "", r.email ?? "", (r.name ?? "").replace(/,/g, " ")].join(","));
  return [header, ...lines].join("\n");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const segment = searchParams.get("segment");

  let csv = "";
  if (segment === "abandoned_cart") {
    const { data } = await supabase.from("abandoned_carts").select("customer_phone, customer_email, customer_name").eq("dealership_id", dealershipId).eq("contacted", false);
    csv = toCsv((data ?? []).map((c: any) => ({ phone: c.customer_phone, email: c.customer_email, name: c.customer_name })));
  } else if (segment === "cold_lead") {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("leads").select("phone, email, name").eq("dealership_id", dealershipId).neq("status", "converted").lt("created_at", cutoff);
    csv = toCsv(data ?? []);
  } else if (segment === "lapsed_buyer") {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabase.from("orders").select("customer_phone, customer_email, customer_name, created_at").eq("dealership_id", dealershipId).neq("status", "cancelled").order("created_at", { ascending: false });
    const byCustomer: Record<string, { phone: string; email: string; name: string; count: number; lastOrder: string }> = {};
    for (const o of orders ?? []) {
      const key = o.customer_phone || o.customer_email || o.customer_name;
      if (!key) continue;
      if (!byCustomer[key]) byCustomer[key] = { phone: o.customer_phone, email: o.customer_email, name: o.customer_name, count: 0, lastOrder: o.created_at };
      byCustomer[key].count += 1;
    }
    const lapsed = Object.values(byCustomer).filter((c) => c.count === 1 && c.lastOrder < cutoff);
    csv = toCsv(lapsed);
  } else {
    return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${segment}-audience.csv"`,
    },
  });
}
