// Tapping "Review request" — H3's way past a Utility template.
//
// ──────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, and it is the piece that makes a Utility template
// usable at all.
//
// A Utility template CANNOT carry what the approval is. The first one,
// approval_waiting_v2, tried — and Meta recategorised it to MARKETING
// ("did not meet our utility guidelines") on 24 November 2026. The
// cause is structural for this product, not a wording slip: `confirm`
// is a sentence about marketing work ("Send the Diwali email to 40
// customers"), so any template filled with it reads as marketing
// however the rest is written, and the SAMPLE VALUE is part of what
// gets classified.
//
// BUT A TAP IS AN INBOUND MESSAGE, and an inbound message opens the
// 24-hour session window. Inside it a free-form reply is legal — and
// free-form may be sent from the webhook, which channelRules already
// names as the one permitted free-form sender. So the detail the
// template may never contain travels in the reply to the tap, and no
// guard has to move.
//
// A TAP NEVER DECIDES ANYTHING. It means "tell me what this is". The
// decision stays with a typed haan/nahi plus a code — the path H2
// built and M4 verified live. A tap on a five-day-old notice is
// therefore harmless: it re-sends the detail, or says the row is gone.
//
// UNVERIFIED AGAINST A LIVE TAP. Both templates were PENDING on
// 24 November 2026, so no button existed to press. Written from Meta's
// documented `type: "button"` shape, which is the situation M2's own
// header warns about — and here it cannot be probed first, because
// there is no approved template to produce a button.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readInbound } from "@/lib/whatsapp/inbound";
import { code } from "./helpers/source";

const ROUTE = "src/app/api/webhooks/whatsapp/route.ts";

const delivery = (message: Record<string, any>) => ({
  entry: [{ changes: [{ field: "messages", value: { messages: [message] } }] }],
});

const tap = (over: Record<string, any> = {}) =>
  delivery({
    from: "+91 81150 15907",
    type: "button",
    button: { text: "Review request", payload: "a3f29c10-1111-2222-3333-444444444444" },
    ...over,
  });

describe("1. A TAP IS READ, AND IT IS NOT A MESSAGE", () => {
  it("A QUICK-REPLY TAP LANDS IN `taps`, NEVER IN `messages`", () => {
    // THE LOAD-BEARING ONE. The tempting shortcut is to read
    // `button.text` as text — and it is wrong twice over: the label
    // would reach Master Chat, spending a model call to answer a
    // sentence nobody wrote, and it would pass through parseDecision
    // where a label could one day read as an instruction.
    const read = readInbound(tap(), "meta");
    expect(read.messages, "a tap was read as a text message").toEqual([]);
    expect(read.taps.length).toBe(1);
    expect(read.taps[0].payload).toBe("a3f29c10-1111-2222-3333-444444444444");
    expect(read.taps[0].label).toBe("Review request");
  });

  it("AND THE SENDER IS NORMALISED, like every other inbound", () => {
    // Meta sends digits without a plus; the stored number is digits
    // with the country code. A mismatch here reads as "this number
    // isn't connected".
    expect(readInbound(tap(), "meta").taps[0].phone).toBe("918115015907");
  });

  it("A TAP WITH NO SENDER IS SKIPPED, AND COUNTED", () => {
    const read = readInbound(tap({ from: null }), "meta");
    expect(read.taps).toEqual([]);
    expect(read.skipped.join(" ")).toContain("button tap with no sender");
  });

  it("AN EMPTY PAYLOAD IS KEPT, not dropped", () => {
    // The route answers an unresolvable tap with the pending list,
    // which is honest. Dropping it would be silence.
    const read = readInbound(tap({ button: { text: "Review request" } }), "meta");
    expect(read.taps.length).toBe(1);
    expect(read.taps[0].payload).toBe("");
  });

  it("A TEXT MESSAGE STILL READS AS TEXT, and taps stay empty", () => {
    const read = readInbound(delivery({ from: "918115015907", type: "text", text: { body: "haan A3F2" } }), "meta");
    expect(read.messages.length).toBe(1);
    expect(read.taps).toEqual([]);
  });

  it("A BATCH CARRYING BOTH KEEPS THEM APART", () => {
    // Meta batches, and the pair in one delivery is the realistic
    // case: he taps, then types.
    const body = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { from: "918115015907", type: "button", button: { text: "Review request", payload: "id-1" } },
                  { from: "918115015907", type: "text", text: { body: "haan A3F2" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const read = readInbound(body, "meta");
    expect(read.taps.length).toBe(1);
    expect(read.messages.length).toBe(1);
    expect(read.messages[0].text).toBe("haan A3F2");
  });

  it("INTERACTIVE REPLIES ARE STILL SKIPPED AND COUNTED, not guessed at", () => {
    // This product does not send a list picker or reply buttons, so a
    // path for them would be another unverified guess. Counted, so
    // "I tapped and nothing happened" stays answerable.
    const read = readInbound(
      delivery({ from: "918115015907", type: "interactive", interactive: { button_reply: { id: "x" } } }),
      "meta"
    );
    expect(read.taps).toEqual([]);
    expect(read.messages).toEqual([]);
    expect(read.skipped.join(" ")).toContain("interactive");
  });

  it("and Gupshup has no taps, because no button was ever built for it", () => {
    const read = readInbound({ payload: { type: "text", sender: { phone: "918115015907" }, payload: { text: "hi" } } }, "gupshup");
    expect(read.taps).toEqual([]);
  });
});

describe("2. THE ROUTE ANSWERS A TAP WITHOUT DECIDING ANYTHING", () => {
  const src = () => code(ROUTE);

  it("A TAP NEVER REACHES parseDecision OR MASTER CHAT", () => {
    // THE SAFETY PROPERTY. A decision must come from words the owner
    // typed, not from a button that stays tappable in his chat history
    // forever — stale approvals are closed after 14 days precisely
    // because a decision from weeks ago is not one anybody still wants.
    const s = src();
    const start = s.indexOf("async function handleOneTap(");
    expect(start).toBeGreaterThan(-1);
    const body = s.slice(start, s.indexOf("export async function GET("));
    expect(body.length).toBeLessThan(3000);
    expect(body, "a tap can reach the decision parser").not.toMatch(/parseDecision/);
    expect(body, "a tap can reach Master Chat").not.toMatch(/runMasterBrainChat/);
    expect(body, "a tap can apply an approval decision").not.toMatch(/applyApprovalDecision/);
  });

  it("AND THE TAP LOOP IS SEPARATE FROM THE MESSAGE LOOP", () => {
    const s = src();
    expect(s).toMatch(/for \(const tap of read\.taps\) \{\s*await handleOneTap\(tap\.phone, tap\.payload, supabase\);/);
    expect(s).toMatch(/for \(const message of read\.messages\) \{\s*await handleOneMessage\(/);
  });

  it("IT ANSWERS AS THE OWNER'S BUSINESS ONLY, verified", () => {
    // Same check the text path makes, and for the same reason: the
    // phone number in a payload is not proof of anything.
    const s = src();
    const start = s.indexOf("async function handleOneTap(");
    const body = s.slice(start, s.indexOf("export async function GET("));
    expect(body).toMatch(/\.eq\("owner_whatsapp_number", phone\)/);
    expect(body).toMatch(/\.eq\("owner_whatsapp_verified", true\)/);
  });

  it("AND IT READS ONLY THIS BUSINESS'S PENDING ROWS", () => {
    const s = src();
    const start = s.indexOf("async function handleOneTap(");
    const body = s.slice(start, s.indexOf("export async function GET("));
    const query = body.slice(body.indexOf('from("pending_approvals")'));
    expect(query).toMatch(/\.eq\("dealership_id", dealership\.id\)/);
    expect(query).toMatch(/\.eq\("status", "pending"\)/);
  });

  it("AN UNPLACEABLE PAYLOAD GETS THE LIST, NEVER A BEST GUESS", () => {
    // Not even with exactly one pending. A payload we cannot place
    // means the notice and the row have come apart, and saying so is
    // the same refusal H2 makes when it cannot tell which row is meant.
    const s = src();
    const start = s.indexOf("async function handleOneTap(");
    const body = s.slice(start, s.indexOf("export async function GET("));
    expect(body).toMatch(/if \(!match\) \{/);
    expect(body).toMatch(/cannotTell\(/);
    expect(body, "a tap falls back to whichever row happens to be first").not.toMatch(/rows\[0\]/);
  });

  it("THE DETAIL IT SENDS IS THE ROW'S OWN STORED SENTENCE", () => {
    // What the template may never say. Word for word from the row, so
    // the card, the email and this cannot drift into three versions of
    // one claim.
    const s = src();
    const start = s.indexOf("async function handleOneTap(");
    const body = s.slice(start, s.indexOf("export async function GET("));
    // FOUND BY MUTATION. `action_details?.confirm` appears in the const
    // declaration, so dropping `confirm ||` from the message itself
    // survived — the sentence was read and then not used. The
    // assertion has to be on the MESSAGE, not on the file.
    // SLICED TO THE MESSAGE, BOTH ENDS BOUNDED. `lastIndexOf` on the
    // sender found the CATCH block's error reply instead — the last
    // send in the function is not the one being asserted.
    const from = body.indexOf("const code = approvalCode(");
    const to = body.indexOf("} catch");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const message = body.slice(from, to);
    expect(message.length).toBeLessThan(900);
    expect(message, "the reply paraphrases instead of using the stored sentence").toMatch(
      /confirm \|\| `\$\{said\} is waiting/
    );
    expect(body).toMatch(/action_details\?\.confirm/);
    expect(body).toMatch(/haan \$\{code\}/);
    expect(body).toMatch(/nahi \$\{code\}/);
    expect(body).toMatch(/Nothing has happened yet/);
  });

  it("and a delivery of only taps is not recorded as nothing to reply to", () => {
    // webhook_deliveries would otherwise say the tap was unactionable.
    const s = src();
    expect(s).toMatch(/if \(!read\.messages\.length && !read\.taps\.length && read\.skipped\.length\)/);
  });
});
