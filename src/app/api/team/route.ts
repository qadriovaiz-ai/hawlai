import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendViaResend } from "@/lib/email/resendClient";

async function requireOwner(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // Resolve via the currently-active dealership (profiles.dealership_id),
  // not a fresh owner_id-only lookup — an owner_id-only .maybeSingle()
  // silently returns null (and 403s the real owner) the moment that
  // owner has 2+ dealerships, which is exactly what Agency-tier
  // multi-business ownership produces. .eq("id", ...) is scoped by
  // primary key first, so this can never match more than one row.
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id, dealership_name").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return { error: NextResponse.json({ error: "Only the owner can manage the team" }, { status: 403 }) };
  return { user, dealership };
}

export async function GET() {
  const supabase = await createClient();
  const { error, dealership } = await requireOwner(supabase);
  if (error) return error;

  const { data: members } = await supabase
    .from("team_members")
    .select("id, email, role, status, invited_at, joined_at, feature_scope")
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

  // Best-effort — the invite is already created and the link is
  // returned to the owner either way (the UI's copy-link flow stays
  // as a fallback), so a failed send here never blocks the invite
  // itself from existing.
  const emailResult = await sendViaResend(
    email.trim().toLowerCase(),
    `You've been invited to join ${dealership!.dealership_name ?? "a team"} on Hawlai`,
    `You've been invited to join ${dealership!.dealership_name ?? "a business"}'s team on Hawlai as a ${role.replace("_", " ")}.\n\nClick here to accept: ${inviteUrl}`,
    dealership!.dealership_name ?? "Hawlai"
  );

  return NextResponse.json({ success: true, member, inviteUrl, emailSent: emailResult.success });
}
