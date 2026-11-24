import { createServiceClient } from "@/lib/supabase/service";
import { sendWhatsAppText, sendWhatsAppImage, activeProvider, type WhatsAppProvider } from "@/lib/whatsapp/client";
import { readInbound } from "@/lib/whatsapp/inbound";
import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { checkAndRecordMessageUsage } from "@/lib/usage/messageLimits";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import { applyApprovalDecision } from "@/lib/approvals/decide";
import { describeApproval, approvalCode } from "@/lib/whatsapp/approvalReply";
import { parseDecision, resolvePending, cannotTell, type Pending } from "@/lib/whatsapp/pendingReply";
import { pendingSuggestionRows, applySuggestionDecision } from "@/lib/whatsapp/suggestionReply";
import { pendingSuggestions } from "@/lib/onboarding/suggestions";
import { verifyWhatsAppSender, describeWhatsAppRejection, whatsappChallenge } from "@/lib/whatsapp/verifySender";
import { recordDeliveryStandalone } from "@/lib/webhooks/deliveryLog";
import { NextResponse } from "next/server";

export const maxDuration = 300; // Master Chat's tool loop can take a while, same reasoning as the web route

// WHERE THE PAYLOAD SHAPE LIVES NOW: src/lib/whatsapp/inbound.ts.
//
// `extractIncoming` used to sit here — built against Gupshup's
// documented v2 format, with its own comment admitting it had never
// met live traffic and tried "a couple of plausible field paths". That
// is a reasonable way to ship ahead of credentials and a bad way to
// keep running once there are two providers whose shapes overlap.
//
// It moved out on 23 November 2026 so it could be tested: nothing
// executes this route's POST, and a pure function is the only part of
// this file that can be checked exhaustively.

/**
 * One message, start to finish.
 *
 * EXTRACTED 23 NOVEMBER 2026, because Meta batches: `messages` is an
 * array, and the version of this route that read [0] would have
 * dropped the rest — possibly the "APPROVE 2" that mattered.
 *
 * Every exit here is "done with THIS message", not "done with the
 * request", which is why they are bare returns. The conversion was
 * checked by the compiler rather than by eye: a missed
 * `return NextResponse.json(...)` is a NextResponse where void is
 * expected, and nothing in this file is covered by a test that
 * executes it.
 */
async function handleOneMessage(phone: string, text: string, supabase: ReturnType<typeof createServiceClient>): Promise<void> {
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
        return;
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await supabase.from("whatsapp_verification_codes").update({ code }).eq("id", pending.id);
      await sendWhatsAppText(phone, `Your Hawlai connection code: ${code}\n\nEnter this on the dashboard to finish connecting.`);
      return;
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
        return;
      }
    }

    if (!dealership) {
      // Not the owner — check if it's a verified team member (restricted, task-only access).
      const { data: member } = await supabase.from("team_members").select("id, dealership_id, role").eq("whatsapp_number", phone).eq("whatsapp_verified", true).eq("status", "active").maybeSingle();
      if (!member) {
        await sendWhatsAppText(phone, "This number isn't connected to a Hawlai account. Connect it first from the Hawlai dashboard.");
        return;
      }
      // Team members get a deliberately narrow, safe surface over
      // WhatsApp — their own tasks only, matching the same
      // restriction the dashboard's Task Inbox already enforces.
      // Full Master Chat tool access here would bypass that boundary.
      const { data: tasks } = await supabase.from("tasks").select("title, status").eq("assigned_to", member.id).neq("status", "done").order("created_at", { ascending: false }).limit(10);
      const list = (tasks ?? []).map((t) => `• ${t.title} (${t.status})`).join("\n");
      await sendWhatsAppText(phone, list ? `Your open tasks:\n\n${list}` : "You have no open tasks right now.");
      return;
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
        return;
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
          return;
        }
        const outcome = await applySuggestionDecision(service, dealership.id, match, reply.decision, answers ?? []);
        await sendWhatsAppText(phone, outcome.said);
        return;
      }

      const approval = (approvals ?? []).find((a: any) => String(a.id) === found.row.id);
      if (!approval) {
        await sendWhatsAppText(phone, "That one isn't waiting any more.");
        return;
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
        return;
      }
      await sendWhatsAppText(
        phone,
        reply.decision === "approved"
          ? `Done — approved ${said}.${result?.publish?.message ? `

${result.publish.message}` : ""}`
          : `Rejected ${said}. Nothing was done.`
      );
      return;
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
      return;
    }

    const { data: session } = await supabase.from("whatsapp_chat_sessions").select("id, history").eq("phone_number", phone).maybeSingle();
    const history = (session?.history ?? []).slice(-20);
    // `null` conversationId, "whatsapp" surface. There is no chat
    // conversation row for a WhatsApp turn — the history lives in
    // whatsapp_chat_sessions — and the surface is passed rather than
    // inferred from that absence, because a fresh /chat screen has no
    // conversation either.
    const result = await runMasterBrainChat(supabase, dealership.id, history, text, null, "whatsapp");

    const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: result.reply }];
    await supabase.from("whatsapp_chat_sessions").upsert({ dealership_id: dealership.id, phone_number: phone, history: newHistory, updated_at: new Date().toISOString() }, { onConflict: "phone_number" });

    await sendWhatsAppText(phone, result.reply);
    for (const artifact of result.artifacts) {
      if (artifact.type === "image" && artifact.url) await sendWhatsAppImage(phone, artifact.url, artifact.label);
    }

    return;
  } catch (err: any) {
    // Never let a webhook exception surface as a 500 that makes the
    // provider retry-storm us — log the intent, reply with something
    // useful to the person if possible, and always 200 back.
    console.error("[whatsapp] handling failed:", err?.message ?? err);
    try { await sendWhatsAppText(phone, "Something went wrong on my end — try again in a moment."); } catch {}
    return;
  }
}

/**
 * The owner tapped "Review request" on an approval notice.
 *
 * ──────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, and it is the piece that makes a Utility template
 * usable at all.
 *
 * A Utility template CANNOT carry what the approval actually is.
 * approval_waiting_v2 tried, and Meta recategorised it to Marketing —
 * because `confirm` is a sentence about marketing work ("Send the
 * Diwali email to 40 customers"), so any template filled with it
 * reads as marketing however the rest is worded. That is structural
 * for this product, not a wording problem.
 *
 * BUT A TAP IS AN INBOUND MESSAGE, and an inbound message OPENS the
 * 24-hour session window. Inside it a free-form reply is legal — and
 * free-form may be sent from this file, which channelRules already
 * names as the one permitted free-form sender. So the detail the
 * template may never contain travels in the reply to the tap, and no
 * guard has to move.
 *
 * A TAP NEVER DECIDES ANYTHING. It means "tell me what this is". The
 * decision stays with a typed `haan`/`nahi` and a code — the path H2
 * built and M4 verified live. So a tap on a five-day-old notice is
 * harmless: it re-sends the detail, or says the row is gone.
 *
 * UNVERIFIED AGAINST A LIVE TAP. Both templates are PENDING, so no
 * button exists to press — this is written from Meta's documented
 * `type: "button"` shape. An unrecognised payload answers with the
 * pending list rather than guessing, which is the same refusal H2
 * makes when it cannot tell which row is meant.
 * ──────────────────────────────────────────────────────────────────
 */
async function handleOneTap(phone: string, payload: string, supabase: ReturnType<typeof createServiceClient>): Promise<void> {
  try {
    const { data: dealership } = await supabase
      .from("dealerships")
      .select("id, dealership_name, owner_id")
      .eq("owner_whatsapp_number", phone)
      .eq("owner_whatsapp_verified", true)
      .maybeSingle();
    if (!dealership) {
      // Same answer the text path gives an unknown number, and for the
      // same reason: the phone number is not proof of anything.
      await sendWhatsAppText(phone, "This number isn't connected to a Hawlai account. Connect it first from the Hawlai dashboard.");
      return;
    }

    const { data: approvals } = await supabase
      .from("pending_approvals")
      .select("id, action_type, amount, action_details")
      .eq("dealership_id", dealership.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const rows = approvals ?? [];

    // THE PAYLOAD IS OURS, so this is a lookup and not a guess — and
    // it is SCOPED to this business's pending rows, so a payload
    // naming someone else's approval finds nothing.
    const asked = payload.trim();
    const match = asked ? rows.find((a: any) => String(a.id) === asked) : null;

    if (!match) {
      // NEVER A BEST GUESS, even with exactly one pending. A tap whose
      // payload we cannot place means the notice and the row have come
      // apart, and answering with the list says so plainly.
      const pending: Pending[] = rows.map((a: any) => ({ id: String(a.id), kind: "approval" as const, describe: describeApproval(a) }));
      await sendWhatsAppText(phone, cannotTell(pending.length ? "unknown_code" : "none_pending", pending));
      return;
    }

    // WHAT THE TEMPLATE COULD NOT SAY. The row's own stored sentence,
    // word for word — the same one the card and the email carry, so
    // three surfaces cannot drift into three versions of one claim.
    const said = describeApproval(match);
    const confirm = String((match as any).action_details?.confirm ?? "").trim();
    const code = approvalCode(String(match.id));
    await sendWhatsAppText(
      phone,
      [
        confirm || `${said} is waiting for your approval.`,
        "",
        `Reply "haan ${code}" to go ahead, or "nahi ${code}" to drop it.`,
        "",
        "Nothing has happened yet, and nothing will until you answer.",
      ].join("\n")
    );
    return;
  } catch (err: any) {
    console.error("[whatsapp] tap handling failed:", err?.message ?? err);
    try { await sendWhatsAppText(phone, "Something went wrong on my end — try again in a moment."); } catch {}
    return;
  }
}

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

  let provider: WhatsAppProvider;
  try {
    provider = activeProvider();
  } catch (err: any) {
    // The payload cannot be read without knowing whose shape it is,
    // and guessing is what M2 exists to stop.
    console.error("[whatsapp]", err?.message ?? err);
    await recordDeliveryStandalone({ source: "whatsapp", outcome: "nothing_to_reply_to", detail: "WHATSAPP_PROVIDER is not set" });
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  // EVERY MESSAGE, NOT THE FIRST. Meta can carry several in one
  // delivery, and the dropped one is as likely to be the decision as
  // the chat. Sequentially, because two Master Chat turns for the same
  // owner running at once would interleave their tool calls.
  const read = readInbound(body, provider);
  for (const message of read.messages) {
    await handleOneMessage(message.phone, message.text, supabase);
  }

  // A TAP IS NOT A MESSAGE, AND NOT A DECISION — H3.
  //
  // Handled after the text, and through its own function, because the
  // two must not be able to turn into each other: a tap never reaches
  // parseDecision, and the button's label never reaches Master Chat.
  for (const tap of read.taps) {
    await handleOneTap(tap.phone, tap.payload, supabase);
  }

  // WHY NOTHING HAPPENED, recorded rather than guessed at later. An
  // empty read with no explanation is indistinguishable from a
  // provider that never called — which is the hardest WhatsApp report
  // to answer.
  if (!read.messages.length && !read.taps.length && read.skipped.length) {
    await recordDeliveryStandalone({
      source: "whatsapp",
      outcome: "nothing_to_reply_to",
      detail: `nothing actionable: ${read.skipped.slice(0, 3).join("; ")}`,
    });
  }

  return NextResponse.json({ ok: true });
}