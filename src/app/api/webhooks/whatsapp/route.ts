import { createServiceClient } from "@/lib/supabase/service";
import { sendWhatsAppText, sendWhatsAppImage, normalizePhoneNumber } from "@/lib/whatsapp/gupshupClient";
import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { checkAndRecordMessageUsage } from "@/lib/usage/messageLimits";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import { NextResponse } from "next/server";

export const maxDuration = 300; // Master Chat's tool loop can take a while, same reasoning as the web route

// NOTE ON PAYLOAD SHAPE: built against Gupshup's documented v2
// inbound webhook format (payload.payload.type === "text" with the
// message under payload.payload.payload.text, sender number under
// payload.payload.sender.phone). This has NOT been exercised against
// live Gupshup traffic yet — the defensive fallback parsing below
// tries a couple of plausible field paths, but the first real
// incoming message should be checked against actual logs to confirm
// the exact shape, same as any integration built ahead of having
// live credentials to test against.
function extractIncoming(body: any): { phone: string; text: string } | null {
  const payload = body?.payload ?? body;
  const type = payload?.type;
  if (type && type !== "text") return null; // only handle plain text messages in this first pass — media/buttons are a real follow-up, not silently mishandled

  const phone = payload?.sender?.phone ?? payload?.source ?? body?.source;
  const text = payload?.payload?.text ?? payload?.text ?? body?.text;
  if (!phone || typeof text !== "string") return null;
  return { phone: normalizePhoneNumber(phone), text: text.trim() };
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // Gupshup also posts non-message events (delivery receipts, etc.) — always 200 so it doesn't retry-storm us
  }

  const incoming = extractIncoming(body);
  if (!incoming) return NextResponse.json({ ok: true });

  const { phone, text } = incoming;
  const supabase = createServiceClient();

  try {
    // ---------- Verification flow ----------
    if (text.toUpperCase() === "CONNECT") {
      const { data: pending } = await supabase
        .from("whatsapp_verification_codes")
        .select("id")
        .eq("phone_number", phone)
        .is("verified_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pending) {
        await sendWhatsAppText(phone, "This number isn't waiting on a Hawlai connection right now — start the connection from the Hawlai dashboard first (Business → Integrations → Connect WhatsApp), then send CONNECT again.");
        return NextResponse.json({ ok: true });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await supabase.from("whatsapp_verification_codes").update({ code }).eq("id", pending.id);
      await sendWhatsAppText(phone, `Your Hawlai connection code: ${code}\n\nEnter this on the dashboard to finish connecting.`);
      return NextResponse.json({ ok: true });
    }

    // ---------- Identify who's messaging ----------
    const { data: dealership } = await supabase.from("dealerships").select("id, dealership_name").eq("owner_whatsapp_number", phone).eq("owner_whatsapp_verified", true).maybeSingle();

    // A dealership can connect WhatsApp automation while on a plan that
    // includes it, then later downgrade — re-check on every inbound
    // message rather than only at connect time.
    if (dealership) {
      const limits = await getDealershipPlanLimits(supabase, dealership.id);
      if (!hasFeature(limits, "whatsappAutomation")) {
        await sendWhatsAppText(phone, "WhatsApp automation isn't included in your current plan anymore — upgrade from the Hawlai dashboard to keep controlling Hawlai from WhatsApp.");
        return NextResponse.json({ ok: true });
      }
    }

    if (!dealership) {
      // Not the owner — check if it's a verified team member (restricted, task-only access).
      const { data: member } = await supabase.from("team_members").select("id, dealership_id, role").eq("whatsapp_number", phone).eq("whatsapp_verified", true).eq("status", "active").maybeSingle();
      if (!member) {
        await sendWhatsAppText(phone, "This number isn't connected to a Hawlai account. Connect it first from the Hawlai dashboard.");
        return NextResponse.json({ ok: true });
      }
      // Team members get a deliberately narrow, safe surface over
      // WhatsApp — their own tasks only, matching the same
      // restriction the dashboard's Task Inbox already enforces.
      // Full Master Chat tool access here would bypass that boundary.
      const { data: tasks } = await supabase.from("tasks").select("title, status").eq("assigned_to", member.id).neq("status", "done").order("created_at", { ascending: false }).limit(10);
      const list = (tasks ?? []).map((t) => `• ${t.title} (${t.status})`).join("\n");
      await sendWhatsAppText(phone, list ? `Your open tasks:\n\n${list}` : "You have no open tasks right now.");
      return NextResponse.json({ ok: true });
    }

    // ---------- Owner: normal Master Chat turn ----------
    // Deliberately no separate "pending confirmation" state machine —
    // Master Chat already handles a "yes, go ahead" reply correctly
    // through ordinary conversation history (exactly how the web chat
    // works: the model asked something in its last reply, sees the
    // stored history, and understands "yes" in context). Reinventing
    // a parallel confirmation system here would only risk diverging
    // from that already-correct behavior.
    const limitCheck = await checkAndRecordMessageUsage(dealership.id);
    if (!limitCheck.allowed) {
      await sendWhatsAppText(phone, `You've hit today's message limit (${limitCheck.messagesPerDay}/day) for your plan. Upgrade from the Hawlai dashboard for more, or try again tomorrow.`);
      return NextResponse.json({ ok: true });
    }

    const { data: session } = await supabase.from("whatsapp_chat_sessions").select("id, history").eq("phone_number", phone).maybeSingle();
    const history = (session?.history ?? []).slice(-20);
    const result = await runMasterBrainChat(supabase, dealership.id, history, text);

    const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: result.reply }];
    await supabase.from("whatsapp_chat_sessions").upsert({ dealership_id: dealership.id, phone_number: phone, history: newHistory, updated_at: new Date().toISOString() }, { onConflict: "phone_number" });

    await sendWhatsAppText(phone, result.reply);
    for (const artifact of result.artifacts) {
      if (artifact.type === "image" && artifact.url) await sendWhatsAppImage(phone, artifact.url, artifact.label);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Never let a webhook exception surface as a 500 that makes
    // Gupshup retry-storm us — log the intent, reply with something
    // useful to the person if possible, and always 200 back to Gupshup.
    try { await sendWhatsAppText(phone, "Something went wrong on my end — try again in a moment."); } catch {}
    return NextResponse.json({ ok: true });
  }
}
