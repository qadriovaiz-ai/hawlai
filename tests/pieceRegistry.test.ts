// One identity for anything published, whichever table wrote it
// (migration 197).
//
// Migration 196 hung attribution off content_pieces directly, which was
// right for one department and wrong for the other four — an email lives
// in email_marketing_pieces, a WhatsApp draft in its own table, and a
// foreign key points at one table only. The registry gives all of them
// one id with a real foreign key behind it, and one static query to
// check ownership with, instead of a lookup on a table named by the
// request.
//
// Covered here: the registry itself, the email send path (a real
// customer-facing link) and the WhatsApp draft path (no send capability
// exists at all, so the mark has to be in the words the owner copies).

import { describe, it, expect, vi, beforeEach } from "vitest";

const DEALER = "d1";
const SRC = "11111111-1111-4111-8111-111111111111";
const SITE = "https://hawlai.online/site/candle-by-qaaf";
const CALENDLY = "https://calendly.com/candlebyqaaf/workshop";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let sent: any[];

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let staged: Row | null = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), ...staged };
        (tables[table] ??= []).push(row);
        return row;
      }
      if (mode === "update") {
        const target = rows()[0];
        if (target) Object.assign(target, staged);
        return target ?? null;
      }
      return rows()[0] ?? null;
    };
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (row: Row) => ((mode = "insert"), (staged = row), api),
      update: (row: Row) => ((mode = "update"), (staged = row), api),
      single: async () => ({ data: run(), error: null }),
      maybeSingle: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

import { registerPiece, ownedPieceId, SOURCE_TABLE } from "@/lib/attribution/pieces";
import { markOutputLinks, PIECE_PARAM } from "@/lib/attribution/contentLink";

beforeEach(() => {
  sent = [];
  tables = { marketing_pieces: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the registry", () => {
  it("registers a piece once, and gives back the same id next time", async () => {
    const first = await registerPiece(db(), { dealershipId: DEALER, kind: "email", sourceId: SRC, label: "Diwali offer" });
    expect(first).toBeTruthy();
    expect(tables.marketing_pieces[0]).toMatchObject({
      dealership_id: DEALER, kind: "email", source_table: "email_marketing_pieces", source_id: SRC, label: "Diwali offer",
    });

    const again = await registerPiece(db(), { dealershipId: DEALER, kind: "email", sourceId: SRC, label: "Diwali offer" });
    expect(again).toBe(first);
    expect(tables.marketing_pieces).toHaveLength(1);
  });

  it("each department writes to its own source table, autopilot alongside content", () => {
    expect(SOURCE_TABLE).toEqual({
      content: "content_pieces",
      autopilot: "content_pieces",
      email: "email_marketing_pieces",
      whatsapp: "whatsapp_marketing_pieces",
    });
  });

  it("nonsense in, null out — attribution never fails a send", async () => {
    expect(await registerPiece(db(), { dealershipId: DEALER, kind: "email", sourceId: "not-an-id" })).toBeNull();
    expect(await registerPiece(db(), { dealershipId: "", kind: "email", sourceId: SRC })).toBeNull();
    // A database that throws is not allowed to take the send with it.
    const broken = { from: () => { throw new Error("down"); } };
    expect(await registerPiece(broken, { dealershipId: DEALER, kind: "email", sourceId: SRC })).toBeNull();
    expect(tables.marketing_pieces).toHaveLength(0);
  });

  it("ownership is one static query — never a table named by the request", async () => {
    const id = (await registerPiece(db(), { dealershipId: DEALER, kind: "content", sourceId: SRC }))!;
    expect(await ownedPieceId(db(), DEALER, id)).toBe(id);
    // Another business asking about the same row gets nothing.
    expect(await ownedPieceId(db(), "d2", id)).toBeNull();
    expect(await ownedPieceId(db(), DEALER, "' or 1=1 --")).toBeNull();
  });
});

describe("marking a generated result of any shape", () => {
  it("every string is marked, and metadata keys are left alone", () => {
    const out = markOutputLinks(
      { message: `Book: ${SITE}`, variants: [`Aaj: ${SITE}`, "No link here"], _claimsNote: `see ${SITE}`, count: 2 },
      SRC
    );
    expect(out.message).toContain(`${PIECE_PARAM}=${SRC}`);
    expect(out.variants[0]).toContain(`${PIECE_PARAM}=${SRC}`);
    expect(out.variants[1]).toBe("No link here");
    expect(out._claimsNote).toBe(`see ${SITE}`);
    expect(out.count).toBe(2);
  });
});

// ---- email: a real link reaching a real customer ---------------------------
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/email/consent", () => ({ recipientOnRecord: async () => "lead", CSV_CONSENT_SOURCES: [] }));
vi.mock("@/lib/claims/businessFacts", () => ({ gatherBusinessFactsSafely: async () => ({ links: { store: SITE, products: [], booking: CALENDLY }, products: [] }) }));
vi.mock("@/lib/claims/claimCheck", () => ({ findUnsupportedLinks: () => [] }));
vi.mock("@/lib/expertise/channelRules", () => ({ misleadingSubject: () => null }));
vi.mock("@/lib/email/sendMarketingEmail", () => ({
  sendMarketingEmail: async (_s: any, _d: string, to: string, payload: any) => (sent.push({ to, ...payload }), { success: true }),
}));

import { POST as sendEmail } from "@/app/api/email/send/route";

describe("email", () => {
  beforeEach(() => {
    tables = {
      profiles: [{ id: "u1", dealership_id: DEALER }],
      dealerships: [{ id: DEALER, dealership_name: "Candle by Qaaf" }],
      email_marketing_pieces: [{ id: SRC, dealership_id: DEALER, topic: "Diwali offer" }],
      marketing_pieces: [],
    };
  });

  const send = (body: any) =>
    sendEmail(new Request("https://hawlai.online/api/email/send", { method: "POST", body: JSON.stringify(body) }));

  it("THE SENT BODY carries the mark on the site link, and leaves the third-party booking link alone", async () => {
    await send({ to: "a@b.com", subject: "Diwali", body: `Shop: ${SITE}\nBook: ${CALENDLY}`, piece_id: SRC });

    const piece = tables.marketing_pieces[0];
    expect(piece).toMatchObject({ kind: "email", source_table: "email_marketing_pieces", source_id: SRC });
    expect(sent[0].text).toContain(`${SITE}?${PIECE_PARAM}=${piece.id}`);
    // Our tracker never runs on Calendly, so a parameter there buys nothing.
    expect(sent[0].text).toContain(`Book: ${CALENDLY}\n`.trim());
    expect(sent[0].text).not.toContain(`${CALENDLY}?`);
  });

  it("no piece id: the email goes out exactly as written", async () => {
    await send({ to: "a@b.com", subject: "Diwali", body: `Shop: ${SITE}` });
    expect(sent[0].text).toBe(`Shop: ${SITE}`);
    expect(tables.marketing_pieces).toHaveLength(0);
  });

  it("another business's email piece marks nothing", async () => {
    tables.email_marketing_pieces = [{ id: SRC, dealership_id: "d2", topic: "Theirs" }];
    await send({ to: "a@b.com", subject: "Diwali", body: `Shop: ${SITE}`, piece_id: SRC });
    expect(sent[0].text).toBe(`Shop: ${SITE}`);
    expect(tables.marketing_pieces).toHaveLength(0);
  });
});

// ---- WhatsApp: no send exists, so the mark goes in the saved words ---------
vi.mock("@/lib/agents/whatsappMarketingAgent", () => ({
  generateWhatsappContent: async () => ({ output: { message: `Workshop Saturday. Book: ${SITE}` }, _fallback: false }),
}));

import { POST as generateWhatsapp } from "@/app/api/whatsapp/generate/route";

describe("WhatsApp", () => {
  beforeEach(() => {
    tables = {
      profiles: [{ id: "u1", dealership_id: DEALER }],
      dealerships: [{ id: DEALER, dealership_name: "Candle by Qaaf", business_category: "Home fragrance" }],
      brand_profiles: [{ dealership_id: DEALER, tone_of_voice: "warm" }],
      whatsapp_marketing_pieces: [],
      marketing_pieces: [],
    };
  });

  it("THE SAVED DRAFT carries the mark — there is no send, the owner copies these words", async () => {
    const res = await generateWhatsapp(
      new Request("https://hawlai.online/api/whatsapp/generate", { method: "POST", body: JSON.stringify({ taskType: "promo", topic: "Workshop" }) })
    );
    const body = await res.json();

    const piece = tables.marketing_pieces[0];
    expect(piece).toMatchObject({ kind: "whatsapp", source_table: "whatsapp_marketing_pieces" });
    // Returned to the page AND stored, so the copy button and the saved
    // row can't disagree about what the owner is sending.
    expect(body.output.message).toContain(`${PIECE_PARAM}=${piece.id}`);
    expect(tables.whatsapp_marketing_pieces[0].output.message).toContain(`${PIECE_PARAM}=${piece.id}`);
  });
});
