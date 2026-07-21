import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getActiveRegistrar } from "@/lib/domains";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domainName } = await request.json();
  const domain = String(domainName ?? "").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) return NextResponse.json({ error: "Enter a valid domain, e.g. mybrand.com" }, { status: 400 });

  const registrar = getActiveRegistrar();
  if (!registrar) {
    return NextResponse.json({
      configured: false,
      message: "Domain search isn't connected yet — no registrar account is set up. You can still request a domain and the Hawlai team will check availability and pricing manually.",
    });
  }

  try {
    const result = await registrar.checkAvailability(domain);
    return NextResponse.json({ configured: true, registrar: registrar.name, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Couldn't check availability" }, { status: 500 });
  }
}
