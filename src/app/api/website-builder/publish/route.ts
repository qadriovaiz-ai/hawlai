import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { setSitePublished } from "@/lib/website/setSitePublished";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { published } = await request.json();

  // The work lives in src/lib/website/setSitePublished.ts so the
  // approvals route can flip the flag without calling this app over HTTP
  // (G-3 step 2). The placeholder check moved WITH it rather than being
  // left here and re-implemented there.
  const result = await setSitePublished(supabase, dealershipId, !!published);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
