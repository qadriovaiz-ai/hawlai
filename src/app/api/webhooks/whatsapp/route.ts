import { createServiceClient } from "@/lib/supabase/service";
import { sendWhatsAppText, sendWhatsAppImage, normalizePhoneNumber } from "@/lib/whatsapp/gupshupClient";
import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { checkAndRecordMessageUsage } from "@/lib/usage/messageLimits";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import { applyApprovalDecision } from "@/lib/approvals/decide";
import { describeApproval } from "@/lib/whatsapp/approvalReply";
import { parseDecision, resolvePending, cannotTell, type Pending } from "@/lib/whatsapp/pendingReply";
import { pendingSuggestionRows, applySuggestionDecision } from "@/lib/whatsapp/suggestionReply";
import { pendingSuggestions } from "@/lib/onboarding/suggestions";
import { verifyWhatsAppSender, describeWhatsAppRejection, whatsappChallenge } from "@/lib/whatsapp/verifySender";
import { recordDeliveryStandalone } from "@/lib/webhooks/deliveryLog";
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

/**
 * Meta's subscription handshake.
 *
 * It calls the callback URL once with `hub.mode=subscribe` and the
 * token the owner typed into both places, and will not deliver
 * anything until the challenge comes back as plain text. This route
 * exported POST only until 23 November 2026, so a Meta webhook could
 * never have been registered against it.
 */
export async function GET(request: Request) {
  const result = whatsappChallenge(request.url);
  if (!result.ok) {
    console.error("[whatsapp] verification handshake refused:", result.detail);
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  return new NextResponse(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  // THE RAW BODY, AND THE ORDER IS THE POINT.
  //
  // Meta's digest is over the exact bytes it sent, so `request.json()`
  // would both consume the stream and make the signature unmatchable —
  // different key order, different whitespace, different bytes. Same
  // reasoning as meta-leads and meta-messaging.
  //
  // And the check happens BEFORE anything is parsed. Until today this
  // route read `phone` straight out of an unauthenticated body and
  // acted on it, so a forged payload reached Master Chat as the owner
  // and `APPROVE n` on their pending actions. The phone number was the
  // only thing identifying the caller, and the caller wrote it.
  const rawBody = await request.text();

  const sender = verifyWhatsAppSender(rawBody, request.headers);
  if (!sender.ok) {
    const why = describeWhatsAppRejection(sender);
    console.error("[whatsapp]", why);
    // RECORDED, NOT ONLY LOGGED (migration 226). A console line in
    // Vercel is invisible to the owner, and "no secret is set",
    // rejecting every delivery, looks identical from outside to the
    // provider never calling at all.
    await recordDeliveryStandalone({ source: "whatsapp", outcome: "signature_rejected", detail: why });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true }); // Providers also post non-message events (delivery receipts, etc.) — always 200 so they don't retry-storm us
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
    const { data: dealership } = await supabase.from("dealerships").select("id, dealership_name, owner_id").eq("owner_whatsapp_number", phone).eq("owner_whatsapp_verified", true).maybeSingle();

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

    // ---------- Owner: approving from the phone — H2 ----------
    //
    // BEFORE MASTER CHAT, because "haan A3F2" is an instruction about a
    // record and not a sentence for a model to interpret. Handing it to
    // the chat would mean a language model deciding whether money gets
    // spent, which is the one thing a registry of approvals exists to
    // stop.
    //
    // PARSING IS DELIBERATELY NARROW (see lib/whatsapp/approvalReply):
    // anything that is not plainly a short approval instruction falls
    // through to the chat exactly as before, so an ordinary message
    // containing "no" is still an ordinary message.
    const reply = parseDecision(text);
    if (reply) {
      // ───────────────────────────────────────────────────────────────
      // ONE POOL, AND THAT IS THE WHOLE POINT — D4
      // ───────────────────────────────────────────────────────────────
      //
      // Approvals and onboarding suggestions both wait on a one-word
      // answer from this phone. Resolving them SEPARATELY is the bug
      // this shape exists to prevent: with one of each waiting, two
      // resolvers would each find exactly one match and each act, so a
      // "haan" meant for a phone number would approve a spend.
      //
      // Together, "two things are waiting" is the honest answer and the
      // owner is asked which — the same refusal H2 already makes when
      // two approvals are waiting.
      const [{ data: approvals }, { data: answers }] = await Promise.all([
        supabase
          .from("pending_approvals")
          .select("id, action_type, amount")
          .eq("dealership_id", dealership.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("interview_answers")
          .select("id, question_key, status, attempts, weak, source, suggested_value, evidence")
          .eq("dealership_id", dealership.id),
      ]);

      const pending: Pending[] = [
        ...(approvals ?? []).map((a: any) => ({ id: String(a.id), kind: "approval" as const, describe: describeApproval(a) })),
        ...pendingSuggestionRows(answers ?? []),
      ];

      const found = resolvePending(pending, reply);
      if (!found.ok) {
        // NEVER A BEST GUESS. Every failure is a question back, which
        // costs him one message; guessing costs him whatever the wrong
        // one did.
        await sendWhatsAppText(phone, cannotTell(found.reason, pending));
        return NextResponse.json({ ok: true });
      }

      if (found.row.kind === "suggestion") {
        // CONFIRMING GOES THROUGH saveInterviewAnswer, the same
        // function the web form calls — judged, written to
        // business_knowledge, origin kept. Anything less would record
        // the fact where nothing reads it.
        const service = createServiceClient();
        const match = pendingSuggestions(answers ?? []).find(
          (s) => String((answers ?? []).find((r: any) => r.question_key === s.questionKey)?.id ?? s.questionKey) === found.row.id
        );
        if (!match) {
          await sendWhatsAppText(phone, "That one isn't waiting any more.");
          return NextResponse.json({ ok: true });
        }
        const outcome = await applySuggestionDecision(service, dealership.id, match, reply.decision, answers ?? []);
        await sendWhatsAppText(phone, outcome.said);
        return NextResponse.json({ ok: true });
      }

      const approval = (approvals ?? []).find((a: any) => String(a.id) === found.row.id);
      if (!approval) {
        await sendWhatsAppText(phone, "That one isn't waiting any more.");
        return NextResponse.json({ ok: true });
      }

      // THE OWNER'S OWN auth.users ID, which is truthful: he really is
      // the one deciding. `label` is what the audit trail records, and
      // it says whatsapp — so nothing later claims a button was pressed
      // in a browser nobody opened.
      const outcome = await applyApprovalDecision(
        approval.id,
        { status: reply.decision },
        { userId: String(dealership.owner_id ?? ""), role: "owner", label: `whatsapp:${phone}` }
      );
      const result = await outcome.json().catch(() => ({} as any));

      const said = describeApproval(approval);
      if (!outcome.ok) {
        await sendWhatsAppText(phone, `Couldn't do that one (${said}): ${result?.error ?? "something went wrong"}`);
        return NextResponse.json({ ok: true });
      }
      await sendWhatsAppText(
        phone,
        reply.decision === "approved"
          ? `Done — approved ${said}.${result?.publish?.message ? `

${result.publish.message}` : ""}`
          : `Rejected ${said}. Nothing was done.`
      );
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
