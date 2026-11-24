// Sending through Meta's WhatsApp Cloud API, directly.
//
// The same three jobs `gupshupClient.ts` does, against Meta instead of
// a reseller. Gupshup is kept rather than deleted — a BSP is a real
// fallback if a direct integration is ever rate-limited or suspended —
// so this sits beside it and `client.ts` chooses between them.
//
// ONLY SESSION MESSAGES, like the Gupshup client: every send in this
// product is a reply inside the 24-hour window after the person
// messaged Hawlai first. Outside that window Meta allows only an
// approved template, and `channelRules` already encodes the rule that
// keeps this true — it is why only the inbound webhook may send.
//
// ──────────────────────────────────────────────────────────────────
// THE SENDER IS AN ID, NOT A PHONE NUMBER, and this is the mistake
// worth naming before anything else. Gupshup's `source` is the
// business's number in digits. Meta's path segment is
// `PHONE_NUMBER_ID` — an opaque numeric id from the app's WhatsApp
// setup screen, which looks enough like a phone number that pasting
// the real one is the obvious error. It fails as a 400 from Graph
// with an "Unsupported post request" message that names an object id,
// not a phone number, so the error does not point at the cause.
// `describeSendFailure` surfaces Meta's own words for that reason.
//
// UNVERIFIED AGAINST A LIVE API. Written from Meta's documented Cloud
// API shape and nothing else, because there is no token yet. The
// calibration for what that costs is in this repo: the Shopify
// adapter needed FOUR corrections after meeting a real store, three
// invisible to a green suite; the WordPress adapter, probed against a
// live site before a line was written, needed none. So this is M1 and
// the live run is M4 — see docs/RESEARCH-WHATSAPP-META-DIRECT.md.
// ──────────────────────────────────────────────────────────────────

/**
 * The Graph version, pinned.
 *
 * Meta deprecates versions on a schedule, and an unpinned call silently
 * changes behaviour the day they roll one. Pinned here rather than in
 * an env var because a version is a code-level compatibility claim: the
 * payload shapes below were written against THIS one, and moving it is
 * a change that should be read and tested, not configured.
 */
const GRAPH_VERSION = "v21.0";

type MetaConfig = { phoneNumberId: string; accessToken: string };

function getConfig(): MetaConfig {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    // THE SAME SHAPE AS gupshupClient's refusal: throw rather than
    // return null, so a caller cannot mistake "not configured" for
    // "sent". The message names both variables because a half-set pair
    // is the common case.
    throw new Error(
      "WhatsApp isn't set up for Meta yet — WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN aren't configured."
    );
  }
  return { phoneNumberId, accessToken };
}

/**
 * Meta's own words when a send fails.
 *
 * Graph answers errors as `{ error: { message, type, code, fbtrace_id } }`
 * and the message is written for a developer — "(#131030) Recipient
 * phone number not in allowed list" tells you the test number is not
 * registered; "400" does not. The fbtrace_id is what Meta support asks
 * for, so it travels too.
 *
 * NEVER THE TOKEN, and never the message body.
 */
function describeSendFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const err = parsed?.error;
    if (err?.message) {
      const code = err.code ? ` [${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""}]` : "";
      const trace = err.fbtrace_id ? ` (fbtrace ${err.fbtrace_id})` : "";
      return `Meta refused the message${code}: ${err.message}${trace}`;
    }
  } catch {
    // Not JSON. A gateway or a WAF in front of Graph answers with
    // HTML, and quoting a page of it at the owner helps nobody.
  }
  return `Meta refused the message (HTTP ${status}).`;
}

async function post(body: Record<string, unknown>): Promise<any> {
  const { phoneNumberId, accessToken } = getConfig();
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    // `messaging_product` IS REQUIRED on every Cloud API send and is
    // the field most often forgotten — Graph rejects the whole call
    // without it, with a message about a missing parameter rather than
    // about WhatsApp.
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(describeSendFailure(res.status, text));
  try {
    return JSON.parse(text);
  } catch {
    // A 200 that is not JSON means something answered in front of
    // Graph. It is NOT a successful send, and returning {} would let
    // the caller report one that never happened.
    throw new Error("Meta's API answered, but not with a result we could read.");
  }
}

export async function sendWhatsAppText(destination: string, text: string) {
  // `preview_url: false` deliberately. A link preview is rendered by
  // Meta from whatever the URL resolves to at send time, which for an
  // approval card means an unrelated image can appear under a decision
  // the owner is about to take.
  return post({ to: destination, type: "text", text: { preview_url: false, body: text } });
}

/**
 * One template variable's value, as Meta will accept it.
 *
 * ──────────────────────────────────────────────────────────────────
 * META REJECTS THIS AT SEND TIME, NOT AT APPROVAL. A parameter may not
 * contain a newline, a tab, or four or more consecutive spaces, and may
 * not be empty. The template itself passes review either way — the
 * refusal arrives on the send, which is the worst place for it here:
 * the notice's own error reply would travel the same broken path, so
 * the owner would get NOTHING and the only trace would be a Vercel log.
 * Exactly M1's shape.
 *
 * AND THE VALUE IS NOT OURS TO CONTROL. `confirm` is composed from
 * whatever a caller wrote plus the dispatcher's clause, and some of
 * those are long and joined with " · " — `propose_page_meta`'s summary
 * is the one to look at. So it is collapsed and capped here rather
 * than trusted.
 *
 * EMPTY THROWS RATHER THAN SENDING. A notice whose sentence collapsed
 * to nothing would ask the owner to approve a blank, which is worse
 * than not arriving.
 */
export function templateVariable(value: string, limit = 600): string {
  const flat = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!flat) throw new Error("A WhatsApp template variable came out empty, so nothing was sent.");
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/**
 * A template message — the only thing Meta accepts outside the
 * 24-hour session window.
 *
 * WHY IT EXISTS AT ALL: H3. An approval can be raised at any hour, so
 * most notices fall outside the window where a free-form message is
 * allowed. `channelRules` encodes that, and it now constrains THIS
 * function separately — the one-sender rule used to name only
 * `sendWhatsAppText`/`Image`, so a template sender would have been
 * invisible to it. H3-b and H3-c therefore ship together: a transport
 * added without the guard is an ungated send for however long the gap
 * lasts.
 *
 * PARAMETER ORDER IS THE CALLER'S, AND IT IS POSITIONAL. {{1}}, {{2}},
 * {{3}} are filled in array order, and a count that does not match the
 * APPROVED body is Graph error 132000 — not a validation message about
 * the thing that is actually wrong. The approved body is the contract;
 * this function does not know it.
 */
export async function sendWhatsAppTemplate(
  destination: string,
  template: { name: string; language?: string; variables: string[]; buttonPayload?: string | null }
) {
  const parameters = template.variables.map((value) => ({ type: "text", text: templateVariable(value) }));

  // THE QUICK-REPLY PAYLOAD IS SET PER SEND, and that is why it can be
  // trusted. The approved template stores no payload of its own (read
  // off Graph on 24 November 2026: its QUICK_REPLY button has no
  // payload or example field), so without this a tap would come back
  // carrying nothing to look up and the reply would have to guess.
  //
  // Index "0", because a template's buttons are addressed by position
  // and this one has exactly one. A second button would need its own
  // component and its own decision about what tapping it means.
  const buttons = template.buttonPayload
    ? [
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: templateVariable(template.buttonPayload, 128) }],
        },
      ]
    : [];

  return post({
    to: destination,
    type: "template",
    template: {
      name: template.name,
      // Pinned per call rather than defaulted globally: a template is
      // approved per language, and sending `en` against an `en_US`
      // approval fails as "template not found" — which reads like the
      // template was never approved at all.
      language: { code: template.language ?? "en" },
      components: [...(parameters.length ? [{ type: "body", parameters }] : []), ...buttons],
    },
  });
}

export async function sendWhatsAppImage(destination: string, imageUrl: string, caption?: string) {
  // `link` rather than an uploaded media id: the images this product
  // sends already live at a public storage URL, and uploading them
  // first would be a second round trip and a second thing to clean up.
  return post({
    to: destination,
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  });
}
