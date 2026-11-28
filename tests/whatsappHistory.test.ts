// WHAT THE WHATSAPP CHAT REMEMBERS — the founder's bug, 28 November 2026.
//
// "haan DD23" approved a price change, handled before Master Chat, and the
// chat's history never heard of it — so when the owner asked to change
// the stock, the chat said the price card was still waiting and made no
// card. Every exchange handled outside the chat is now written into it.

import { describe, it, expect, beforeEach } from "vitest";
import { code } from "./helpers/source";
import { rememberInWhatsAppChat, HISTORY_KEPT } from "@/lib/whatsapp/sessionHistory";

let stored: any;
let readError: any;
let upserts: any[];
function db() {
  return {
    from: () => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: stored, error: readError }),
        upsert: async (row: any, opts: any) => (upserts.push({ row, opts }), { error: null }),
      };
      return api;
    },
  };
}

beforeEach(() => {
  stored = { history: [{ role: "user", content: "Lavender ka price 499 karo" }, { role: "assistant", content: "Card ready." }] };
  readError = null;
  upserts = [];
});

describe("1. REMEMBERING A DECISION", () => {
  it("THE OWNER'S WORDS AND THE REPLY, APPENDED AFTER WHAT WAS THERE", async () => {
    await rememberInWhatsAppChat(db(), "d1", "919800000001", [
      { role: "user", content: "haan DD23" },
      { role: "assistant", content: "Done — approved DD23: update product price — ₹499." },
    ]);
    expect(upserts[0].row.history.slice(-3)).toEqual([
      { role: "assistant", content: "Card ready." },
      { role: "user", content: "haan DD23" },
      { role: "assistant", content: "Done — approved DD23: update product price — ₹499." },
    ]);
    expect(upserts[0].row).toMatchObject({ dealership_id: "d1", phone_number: "919800000001" });
    expect(upserts[0].opts).toEqual({ onConflict: "phone_number" });
  });

  it("A CHAT THAT DIDN'T EXIST YET STARTS WITH THE DECISION", async () => {
    stored = null;
    await rememberInWhatsAppChat(db(), "d1", "91", [{ role: "user", content: "haan A3F2" }, { role: "assistant", content: "Done." }]);
    expect(upserts[0].row.history).toHaveLength(2);
  });

  it("KEPT TO A BOUNDED LENGTH — the newest stays", async () => {
    stored = { history: Array.from({ length: HISTORY_KEPT }, (_, i) => ({ role: "user", content: `m${i}` })) };
    await rememberInWhatsAppChat(db(), "d1", "91", [{ role: "user", content: "newest" }]);
    expect(upserts[0].row.history).toHaveLength(HISTORY_KEPT);
    expect(upserts[0].row.history.at(-1).content).toBe("newest");
  });

  it("AN UNREADABLE CHAT IS NOT OVERWRITTEN WITH ONLY THE NEW LINES — and nothing throws", async () => {
    readError = { message: "boom" };
    await expect(rememberInWhatsAppChat(db(), "d1", "91", [{ role: "user", content: "x" }])).resolves.toBeUndefined();
    expect(upserts).toEqual([]);
  });
});

describe("2. THE WEBHOOK REMEMBERS EVERY DECISION IT HANDLES — read with comments stripped", () => {
  const src = code("src/app/api/webhooks/whatsapp/route.ts");
  const start = src.indexOf("const reply = parseDecision(text);");
  const end = src.indexOf("const limitCheck = await checkAndRecordMessageUsage", start);
  const branch = src.slice(start, end);

  it("THE DECISION BRANCH IS FOUND", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("tell() SENDS AND REMEMBERS — the owner's words, then the reply", () => {
    expect(branch).toMatch(
      /const tell = async \(said: string\) => \{\s*await sendWhatsAppText\(phone, said\);\s*await rememberInWhatsAppChat\(supabase, dealership\.id, phone, \[\s*\{ role: "user", content: text \},\s*\{ role: "assistant", content: said \},\s*\]\);\s*\};/
    );
  });

  it("EVERY REPLY IN THE BRANCH GOES THROUGH tell() — none is sent and forgotten", () => {
    const sends = branch.match(/sendWhatsAppText\(/g) ?? [];
    expect(sends).toHaveLength(1); // the one inside tell()
    expect((branch.match(/await tell\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("A CHAT TURN REMEMBERS THE CARD'S CODE LINE WITH ITS REPLY", () => {
    expect(src).toMatch(/const assistantSaid = cards \? `\$\{result\.reply\}\\n\\n\$\{cards\}` : result\.reply;/);
    expect(src).toMatch(/\{ role: "assistant", content: assistantSaid \}/);
  });

  it("A PAYMENT BUTTON TAP IS REMEMBERED", () => {
    const tap = src.slice(src.indexOf("async function handleOneTap("), src.indexOf("async function handleOnePhoto("));
    expect(tap).toMatch(/await rememberInWhatsAppChat\(supabase, dealership\.id, phone, \[\s*\{ role: "user", content: `\[Tapped/);
  });
});
