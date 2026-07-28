import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Called after the invitee has (a) created an account or (b) logged
// into an existing one, from the /invite/[token] page. Uses the
// service client to look up the invite by token (an invitee has no
// RLS access to team_members until this linking happens — chicken-
// and-egg), but only ever writes to the ONE row matching that exact
// token, and only sets user_id to the currently authenticated caller
// — never lets a request claim a different row's invite.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You need to be signed in to accept an invite" }, { status: 401 });

  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: "Missing invite token" }, { status: 400 });

  const service = createServiceClient();
  const { data: invite } = await service.from("team_members").select("id, dealership_id, email, role, status").eq("invite_token", token).maybeSingle();
  if (!invite) return NextResponse.json({ error: "This invite link is invalid or has expired" }, { status: 404 });
  if (invite.status === "removed") return NextResponse.json({ error: "This invite has been revoked" }, { status: 400 });
  if (invite.status === "active") return NextResponse.json({ error: "This invite has already been accepted" }, { status: 400 });

  const { error: updateError } = await service.from("team_members").update({
    user_id: user.id,
    status: "active",
    joined_at: new Date().toISOString(),
  }).eq("id", invite.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // So the person's own profile reflects which dealership they're
  // part of and what role they hold — used for display/lookups, not
  // as an RLS grant (dealership-table RLS still only recognizes the
  // actual owner; this is informational for the team member's own
  // account, not a security boundary).
  const { data: dealership } = await service.from("dealerships").select("dealership_name").eq("id", invite.dealership_id).maybeSingle();
  await supabase.from("profiles").update({ dealership_id: invite.dealership_id, role: invite.role }).eq("id", user.id);

  return NextResponse.json({ success: true, dealershipName: dealership?.dealership_name ?? "the business", role: invite.role });
}
