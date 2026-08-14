import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Master audit Part E2 — the highest-value, lowest-risk bulk operation
// identified: toggling one automation setting identically across
// every owned business, instead of switching into each one and
// repeating the same PATCH. Every candidate here is a plain boolean
// column with no immediate side effect (only changes future
// automation behavior) and no external API call — unlike bulk-
// approving pending_approvals (each row is a distinct ₹ decision that
// needs individual judgment) or bulk campaign pause/resume (N
// independently-failable Meta calls), both deliberately out of scope.
const ALLOWED_FIELDS = [
  "dm_auto_reply_enabled",
  "comment_auto_reply_enabled",
  "welcome_email_auto_enabled",
  "follow_up_email_auto_enabled",
  "content_autopilot_enabled",
  "auto_call_new_leads",
  "auto_pause_low_performers",
] as const;

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { field, value, dealershipIds } = await request.json();
  if (!ALLOWED_FIELDS.includes(field)) return NextResponse.json({ error: "Unsupported field" }, { status: 400 });
  if (typeof value !== "boolean") return NextResponse.json({ error: "value must be true or false" }, { status: 400 });
  if (!Array.isArray(dealershipIds) || dealershipIds.length === 0) return NextResponse.json({ error: "dealershipIds required" }, { status: 400 });

  // Re-verify ownership server-side for every id — never trust the
  // client-supplied list blindly, same discipline as the portfolio
  // detail view's ownership check.
  const { data: owned } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).in("id", dealershipIds);
  const ownedIds = (owned ?? []).map((d: any) => d.id);
  if (ownedIds.length === 0) return NextResponse.json({ error: "No matching businesses found" }, { status: 404 });

  const { error } = await supabase.from("dealerships").update({ [field]: value }).in("id", ownedIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, updated: ownedIds.length });
}
