import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

async function requireOwner(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: dealership } = await supabase.from("dealerships").select("id, dealership_name").eq("owner_id", user.id).maybeSingle();
  if (!dealership) return { error: NextResponse.json({ error: "Only the owner can manage the team" }, { status: 403 }) };
  return { user, dealership };
}

export async function GET() {
  const supabase = await createClient();
  const { error, dealership } = await requireOwner(supabase);
  if (error) return error;

  const { data: members } = await supabase
    .from("team_members")
    .select("id, email, role, status, invited_at, joined_at")
    .eq("dealership_id", dealership!.id)
    .neq("status", "removed")
    .order("invited_at", { ascending: false });

  return NextResponse.json({ members: members ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { error, user, dealership } = await requireOwner(supabase);
  if (error) return error;

  const { email, role } = await request.json();
  const validRoles = ["admin", "marketing_manager", "designer", "content_writer", "sales", "viewer"];
  if (!email || !validRoles.includes(role)) {
    return NextResponse.json({ error: "A valid email and role are required" }, { status: 400 });
  }

  const { data: existing } = await supabase.from("team_members").select("id").eq("dealership_id", dealership!.id).eq("email", email.trim().toLowerCase()).neq("status", "removed").maybeSingle();
  if (existing) return NextResponse.json({ error: "This person is already invited or on the team" }, { status: 400 });

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const { data: member, error: insertError } = await supabase.from("team_members").insert({
    dealership_id: dealership!.id,
    email: email.trim().toLowerCase(),
    role,
    status: "invited",
    invite_token: inviteToken,
    invited_by: user!.id,
  }).select("id, email, role, status").single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.vercel.app"}/invite/${inviteToken}`;
  return NextResponse.json({ success: true, member, inviteUrl });
}
