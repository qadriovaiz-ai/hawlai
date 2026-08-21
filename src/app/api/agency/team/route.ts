import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendViaResend } from "@/lib/email/resendClient";

// P3 piece 7b — cross-business team management.
//
// team_members is already per-dealership (one row per person per
// business), so granular per-client access ALREADY existed in the
// data model — a person can be `sales` on one client and `viewer` on
// another today. What was missing was only the management surface:
// /dashboard/team is scoped to the currently-active business, so an
// agency owner had to switch business -> invite -> switch -> invite.
// This is that missing surface, not a new permissions model.

const VALID_ROLES = ["admin", "marketing_manager", "designer", "content_writer", "sales", "viewer"];

// Every write here targets a specific dealership by id, so ownership
// of THAT business must be proven — not just "owns some business".
async function ownedDealershipIds(supabase: any, userId: string): Promise<{ id: string; dealership_name: string }[]> {
  const { data } = await supabase
    .from("dealerships")
    .select("id, dealership_name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businesses = await ownedDealershipIds(supabase, user.id);
  if (businesses.length === 0) return NextResponse.json({ businesses: [], people: [] });

  const { data: members } = await supabase
    .from("team_members")
    .select("id, dealership_id, email, role, status, invited_at, joined_at")
    .in("dealership_id", businesses.map((b) => b.id))
    .neq("status", "removed");

  // Grouped by person (email), since that's how an agency owner
  // thinks about it — "who is Priya on my accounts?" — rather than
  // as N separate per-business member lists.
  type Membership = { id: string; role: string; status: string };
  type PersonRow = { email: string; memberships: Record<string, Membership> };
  const byEmail = new Map<string, PersonRow>();
  for (const m of members ?? []) {
    const entry: PersonRow = byEmail.get(m.email) ?? { email: m.email, memberships: {} };
    entry.memberships[m.dealership_id] = { id: m.id, role: m.role, status: m.status };
    byEmail.set(m.email, entry);
  }

  return NextResponse.json({
    businesses: businesses.map((b) => ({ id: b.id, name: b.dealership_name })),
    people: Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email)),
  });
}

// Grant a person access to one specific business — same invite
// mechanism /api/team already uses, not a parallel one.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, role, dealershipId } = await request.json();
  if (!email || !VALID_ROLES.includes(role) || !dealershipId) {
    return NextResponse.json({ error: "email, a valid role, and dealershipId are required" }, { status: 400 });
  }

  const businesses = await ownedDealershipIds(supabase, user.id);
  const target = businesses.find((b) => b.id === dealershipId);
  if (!target) return NextResponse.json({ error: "You don't own that business" }, { status: 403 });

  const cleanEmail = String(email).trim().toLowerCase();
  const { data: existing } = await supabase
    .from("team_members").select("id").eq("dealership_id", dealershipId).eq("email", cleanEmail).neq("status", "removed").maybeSingle();
  if (existing) return NextResponse.json({ error: "This person already has access to that business" }, { status: 400 });

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const { data: member, error: insertError } = await supabase.from("team_members").insert({
    dealership_id: dealershipId,
    email: cleanEmail,
    role,
    status: "invited",
    invite_token: inviteToken,
    invited_by: user.id,
  }).select("id, dealership_id, email, role, status").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.vercel.app"}/invite/${inviteToken}`;

  // Best-effort, same as /api/team — the invite exists and the link is
  // returned either way, so a failed send never blocks it.
  const emailResult = await sendViaResend(
    cleanEmail,
    `You've been invited to join ${target.dealership_name ?? "a team"} on Hawlai`,
    `You've been invited to join ${target.dealership_name ?? "a business"}'s team on Hawlai as a ${role.replace("_", " ")}.\n\nClick here to accept: ${inviteUrl}`,
    target.dealership_name ?? "Hawlai"
  );

  return NextResponse.json({ success: true, member, inviteUrl, emailSent: emailResult.success });
}

// Change a role, or revoke access entirely (status: removed — same
// soft-delete the existing team management uses, never a hard delete).
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberId, role, revoke } = await request.json();
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  if (!revoke && !VALID_ROLES.includes(role)) return NextResponse.json({ error: "A valid role is required" }, { status: 400 });

  // Confirm this membership belongs to a business this user owns —
  // a membership id alone proves nothing.
  const { data: member } = await supabase.from("team_members").select("id, dealership_id").eq("id", memberId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const businesses = await ownedDealershipIds(supabase, user.id);
  if (!businesses.some((b) => b.id === member.dealership_id)) {
    return NextResponse.json({ error: "You don't own that business" }, { status: 403 });
  }

  const { error } = await supabase
    .from("team_members")
    .update(revoke ? { status: "removed" } : { role })
    .eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
