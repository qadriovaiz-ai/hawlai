// Turning WhatsApp control off — H4.
//
// There was `start` and `verify` and nothing to undo them: a number
// stayed verified until somebody edited the database, which is not
// something the owner can do. "I've lost that phone" had no answer.
//
// The tests that matter are about WHERE this can be done from, and
// about what goes with it.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const DISCONNECT = "src/app/api/whatsapp-connect/disconnect/route.ts";
const VERIFY = "src/app/api/whatsapp-connect/verify/route.ts";
const WEBHOOK = "src/app/api/webhooks/whatsapp/route.ts";
const CARD = "src/components/settings/ConnectWhatsAppCard.tsx";

describe("1. ONLY FROM THE DASHBOARD, BEHIND A SESSION", () => {
  it("IT REFUSES WITHOUT A SIGNED-IN USER", () => {
    const src = code(DISCONNECT);
    expect(src).toMatch(/const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(\);/);
    expect(src).toMatch(/if \(!user\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  });

  it("AND ONLY THE OWNER OF THIS BUSINESS", () => {
    // Resolved exactly as verify resolves it — through the active
    // dealership AND an owner check, because an owner_id-only lookup
    // breaks for somebody running more than one business.
    const src = code(DISCONNECT);
    expect(src).toMatch(/\.eq\("id", profile\.dealership_id\)/);
    expect(src).toMatch(/\.eq\("owner_id", user\.id\)/);
    expect(src).toMatch(/Only the owner can disconnect/);
  });

  it("THERE IS NO WAY TO DISCONNECT OVER WHATSAPP", () => {
    // THE LOAD-BEARING ONE. The moment revocation matters is the
    // moment the phone is in the wrong hands — and a WhatsApp command
    // is as available to whoever is holding it as to the owner.
    const src = code(WEBHOOK);
    expect(src).not.toMatch(/disconnect/i);
    expect(src).not.toMatch(/owner_whatsapp_verified:\s*false/);
  });

  it("the service client is reached only after the session resolved the business", () => {
    const src = code(DISCONNECT);
    expect(src.indexOf("auth.getUser()")).toBeLessThan(src.indexOf("createServiceClient()"));
    expect(src.indexOf('.eq("owner_id", user.id)')).toBeLessThan(src.indexOf("createServiceClient()"));
  });
});

describe("2. THE NUMBER AND THE FLAG BOTH GO", () => {
  it("CLEARING ONE AND NOT THE OTHER WOULD LET A DISCONNECTED PHONE BACK IN", () => {
    // The webhook requires both before it will answer; a reader that
    // checked one would be the gap.
    //
    // SLICED TO THE WRITE, NOT TO THE FIRST MATCH. This file reads
    // `dealerships` twice — once to resolve the owner and once to
    // clear the number — and indexOf found the SELECT, so the first
    // version of this assertion was checking the wrong statement.
    const src = code(DISCONNECT);
    const at = src.indexOf("createServiceClient()");
    const update = src.slice(at, src.indexOf(";", src.indexOf(".update(", at)));
    expect(update).toMatch(/from\("dealerships"\)/);
    expect(update).toMatch(/owner_whatsapp_number: null, owner_whatsapp_verified: false/);
  });

  it("A FAILED UPDATE CHANGES NOTHING AND SAYS SO", () => {
    const src = code(DISCONNECT);
    expect(src).toMatch(/Couldn't disconnect just now — nothing was changed/);
    expect(src).toMatch(/status: 500/);
  });

  it("AND A HALF-FINISHED CONNECTION GOES TOO", () => {
    // A pending code outlives the thing it was invited to, and
    // CONNECT would answer it.
    const src = code(DISCONNECT);
    expect(src).toMatch(/from\("whatsapp_verification_codes"\)\s*\.delete\(\)/);
    expect(src).toMatch(/\.is\("verified_at", null\)/);
  });
});

describe("3. THE CONVERSATION GOES WITH THE CONNECTION", () => {
  it("DISCONNECTING DELETES THE SESSION FOR THAT NUMBER", () => {
    // whatsapp_chat_sessions is keyed on the phone number. Leaving it
    // means a number reconnected later — or reassigned by a carrier —
    // picking up a conversation about somebody else's business.
    const src = code(DISCONNECT);
    expect(src).toMatch(/from\("whatsapp_chat_sessions"\)\.delete\(\)\.eq\("phone_number", number\)/);
  });

  it("AND CHANGING THE NUMBER DOES THE SAME FOR THE OLD ONE", () => {
    const src = code(VERIFY);
    expect(src).toMatch(/const previous = String\(before\?\.owner_whatsapp_number \?\? ""\)\.trim\(\);/);
    expect(src).toMatch(/if \(previous && previous !== normalized\)/);
    expect(src).toMatch(/from\("whatsapp_chat_sessions"\)\.delete\(\)\.eq\("phone_number", previous\)/);
  });

  it("RECONNECTING THE SAME NUMBER KEEPS ITS CONVERSATION", () => {
    // Re-verifying a number you already had is not a change, and
    // deleting the history for it would lose a conversation nobody
    // asked to end.
    const src = code(VERIFY);
    expect(src).toMatch(/previous !== normalized/);
  });

  it("neither cleanup is fatal — the connection is already correct", () => {
    for (const file of [DISCONNECT, VERIFY]) {
      const src = code(file);
      const at = src.indexOf('from("whatsapp_chat_sessions")');
      expect(src.slice(at, at + 420), file).toMatch(/console\.error/);
    }
  });
});

describe("4. TURNING IT OFF IS NEVER THE SLOW PATH", () => {
  it("ONE BUTTON, NO CONFIRMATION STEP", () => {
    // The same rule that keeps automation toggles ungated: the safe
    // direction must not be the difficult one.
    const src = code(CARD);
    expect(src).toMatch(/fetch\("\/api\/whatsapp-connect\/disconnect", \{ method: "POST" \}\)/);
    expect(src).not.toMatch(/confirm\(/);
    expect(src).not.toMatch(/Are you sure/i);
  });

  it("AND THE CARD GOES BACK TO OFFERING A CONNECTION", () => {
    const src = code(CARD);
    const start = src.indexOf('fetch("/api/whatsapp-connect/disconnect"');
    const block = src.slice(start, start + 420);
    expect(block).toMatch(/setConnected\(false\)/);
    expect(block).toMatch(/setStep\("idle"\)/);
  });

  it("a failure is shown rather than silently leaving it connected", () => {
    const src = code(CARD);
    const start = src.indexOf('fetch("/api/whatsapp-connect/disconnect"');
    expect(src.slice(start, start + 520)).toMatch(/setError\(/);
  });
});
