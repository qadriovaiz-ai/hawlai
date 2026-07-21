import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getActiveRegistrar } from "@/lib/domains";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,}$/i;

async function getDealershipAndWebsite(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return { dealershipId: undefined, websiteId: undefined };
  const { data: website } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).maybeSingle();
  return { dealershipId, websiteId: website?.id as string | undefined };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dealershipId } = await getDealershipAndWebsite(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: orders, error } = await supabase
    .from("domain_orders")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: website } = await supabase.from("websites").select("slug, custom_domain, custom_domain_status").eq("dealership_id", dealershipId).maybeSingle();

  return NextResponse.json({ orders: orders ?? [], website, registrarConnected: !!getActiveRegistrar() });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dealershipId, websiteId } = await getDealershipAndWebsite(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });
  if (!websiteId) return NextResponse.json({ error: "Build your website first before requesting a custom domain" }, { status: 400 });

  const { domainName, priceEstimate, currency } = await request.json();
  const domain = String(domainName ?? "").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) return NextResponse.json({ error: "Enter a valid domain, e.g. mybrand.com" }, { status: 400 });

  const { data: existing } = await supabase
    .from("domain_orders")
    .select("id")
    .eq("website_id", websiteId)
    .eq("domain_name", domain)
    .in("status", ["requested", "awaiting_payment", "purchased", "connected"])
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "You already have an active request for this domain" }, { status: 400 });

  const { data: order, error } = await supabase.from("domain_orders").insert({
    dealership_id: dealershipId,
    website_id: websiteId,
    domain_name: domain,
    price_estimate: priceEstimate ?? null,
    currency: currency ?? "INR",
    status: "requested",
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order });
}
