// Meta reads and status writes retry transient errors before anything
// reaches the merchant.
//
// WHY: in one evening chat said it couldn't confirm a campaign's status
// (the campaign was running) and couldn't confirm a pause (the pause
// had worked). Meta had done what was asked both times. Our confirmation
// read was a single attempt, so one transient Graph error became a
// reported failure, and Meta's error was discarded, so the logs could
// not say which error it had been.
//
// The Graph responses below are the shapes Meta actually sends:
// transient errors carry is_transient and a code, the ad-account rate
// limit is code 80004, an expired token is code 190.

import { describe, it, expect, vi, afterEach } from "vitest";
import { metaRead, metaWriteIdempotent, classifyGraphError, DEFAULT_META_RETRY_TIMING } from "@/lib/ads/metaRead";
import { setCampaignStatus, readCampaignState } from "@/lib/ads/campaignStatus";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TOKEN = "EAAB-SECRET-TOKEN-123";
const C = "120254652336640260";
const S = "120254652336770260";
const A = "120254652337290260";
const OBJECTS = { campaignId: C, adsetId: S, adId: A };

type Reply = { ok: boolean; status: number; json: () => Promise<any> };
const ok = (body: any): Reply => ({ ok: true, status: 200, json: async () => body });

/** "An unexpected error has occurred. Please retry your request later." — Graph's transient error. */
const UNEXPECTED: Reply = {
  ok: false, status: 500,
  json: async () => ({ error: { message: "An unexpected error has occurred. Please retry your request later.", type: "OAuthException", is_transient: true, code: 2, fbtrace_id: "AbC1" } }),
};
/** The ad-account rate limit. */
const RATE_LIMITED: Reply = {
  ok: false, status: 400,
  json: async () => ({ error: { message: "There have been too many calls to this ad-account. Wait a bit and try again.", type: "OAuthException", code: 80004, error_subcode: 2446079, is_transient: true, fbtrace_id: "AbC2" } }),
};
const EXPIRED: Reply = {
  ok: false, status: 400,
  json: async () => ({ error: { message: "Error validating access token: Session has expired.", type: "OAuthException", code: 190, error_subcode: 463, fbtrace_id: "AbC3" } }),
};
const BAD_PARAM: Reply = {
  ok: false, status: 400,
  json: async () => ({ error: { message: "(#100) Tried accessing nonexisting field (foo)", type: "OAuthException", code: 100, fbtrace_id: "AbC4" } }),
};

/** Answers fetch calls in order; the last answer repeats. A function answer may throw (a network failure). */
function scripted(...answers: (Reply | (() => Reply))[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const node = String(url).split("/v23.0/")[1].split("?")[0];
    calls.push(`${init?.method ?? "GET"} ${node}`);
    const next = answers.length > 1 ? answers.shift()! : answers[0];
    return typeof next === "function" ? next() : next;
  }));
  return calls;
}

const adState = (effective: string, status = "PAUSED") => ok({ id: A, effective_status: effective, status, campaign_id: C, adset_id: S });
const level = (id: string, effective: string, status = "PAUSED") => ok({ id, effective_status: effective, status });
const accepted = ok({ success: true });

describe("metaRead retries what is worth retrying", () => {
  it("a 500 'unexpected error' on the first attempt → retried, and the value comes back", async () => {
    const calls = scripted(UNEXPECTED, ok({ id: A, effective_status: "ACTIVE" }));
    const r = await metaRead(A, "effective_status", TOKEN, { stage: "t" });
    expect(r.ok && r.data.effective_status).toBe("ACTIVE");
    expect(calls).toHaveLength(2);
  });

  it("the ad-account rate limit (80004) → retried", async () => {
    const calls = scripted(RATE_LIMITED, ok({ id: A }));
    expect((await metaRead(A, "id", TOKEN, { stage: "t" })).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("no response at all (network failure) → retried", async () => {
    const calls = scripted(() => { throw new Error("ECONNRESET"); }, ok({ id: A }));
    expect((await metaRead(A, "id", TOKEN, { stage: "t" })).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("stops after three attempts and reports Meta's error, not a guess", async () => {
    const calls = scripted(UNEXPECTED);
    const r = await metaRead(A, "id", TOKEN, { stage: "t" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(3);
    expect(!r.ok && r.error).toMatchObject({ http: 500, code: 2, transient: true });
  });

  it.each([["expired token (190)", EXPIRED], ["bad request (100)", BAD_PARAM]])(
    "a permanent error — %s — is NOT retried: asking again cannot fix it",
    async (_name, reply) => {
      const calls = scripted(reply);
      const r = await metaRead(A, "id", TOKEN, { stage: "t" });
      expect(r.ok).toBe(false);
      expect(calls).toHaveLength(1);
    }
  );

  it("logs Meta's http status and code on failure — and never the token", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((l: any) => { lines.push(String(l)); });
    vi.spyOn(console, "log").mockImplementation((l: any) => { lines.push(String(l)); });
    scripted(RATE_LIMITED);
    await metaRead(A, "effective_status", TOKEN, { stage: "status.read.ad" });
    const all = lines.join("\n");
    expect(all).toMatch(/graph\.failed/);
    expect(all).toMatch(/code=80004/);
    expect(all).toMatch(/http=400/);
    expect(all).not.toContain(TOKEN);
  });

  it("status writes retry too — setting a status twice is harmless", async () => {
    const calls = scripted(UNEXPECTED, accepted);
    const r = await metaWriteIdempotent(C, { status: "PAUSED" }, TOKEN, { stage: "t" });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([`POST ${C}`, `POST ${C}`]);
  });

  it("production really waits between attempts (the test setup only zeroes it)", () => {
    expect(DEFAULT_META_RETRY_TIMING.delaysMs).toHaveLength(2);
    expect(DEFAULT_META_RETRY_TIMING.delaysMs.every((ms) => ms > 0)).toBe(true);
    expect(DEFAULT_META_RETRY_TIMING.settleMs.every((ms) => ms > 0)).toBe(true);
  });

  it("classifies Meta's own is_transient flag even on an unlisted code", () => {
    expect(classifyGraphError(400, { error: { code: 99999, is_transient: true } }).transient).toBe(true);
    expect(classifyGraphError(400, { error: { code: 190 } }).transient).toBe(false);
  });
});

describe("the two reported cases, with one transient error each", () => {
  it("STATUS CHECK: the first read fails transiently → the real state comes back", async () => {
    scripted(UNEXPECTED, adState("ACTIVE", "ACTIVE"), level(C, "ACTIVE", "ACTIVE"), level(S, "ACTIVE", "ACTIVE"));
    const s = await readCampaignState(OBJECTS, TOKEN);
    expect(s.ok && s.running).toBe(true);
  });

  it("PAUSE: the confirmation read fails once → retried, and the pause is confirmed", async () => {
    // Pause does no read first: three accepted writes, then the read-back.
    const calls = scripted(accepted, accepted, accepted, UNEXPECTED, adState("CAMPAIGN_PAUSED"), level(C, "PAUSED"), level(S, "CAMPAIGN_PAUSED"));
    const r = await setCampaignStatus({ objects: OBJECTS, token: TOKEN, status: "PAUSED" });
    expect(r.ok).toBe(true);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(3);
  });

  it("PAUSE: Meta still shows it running for a moment after accepting → waits, then confirms", async () => {
    // Accepted, but the first read-back still says ACTIVE.
    scripted(
      accepted, accepted, accepted,
      adState("ACTIVE", "PAUSED"), level(C, "ACTIVE", "PAUSED"), level(S, "ACTIVE", "PAUSED"),
      adState("CAMPAIGN_PAUSED"), level(C, "PAUSED"), level(S, "CAMPAIGN_PAUSED"),
    );
    const r = await setCampaignStatus({ objects: OBJECTS, token: TOKEN, status: "PAUSED" });
    expect(r.ok).toBe(true);
  });

  it("PAUSE accepted but never readable → UNCONFIRMED, worded as sent, not as failed", async () => {
    scripted(accepted, accepted, accepted, UNEXPECTED);
    const r = await setCampaignStatus({ objects: OBJECTS, token: TOKEN, status: "PAUSED" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.unconfirmed).toBe(true);
    expect(!r.ok && r.reason).toMatch(/accepted the pause for the campaign, ad set and ad/i);
    expect(!r.ok && r.reason).toMatch(/should have stopped/i);
    expect(!r.ok && r.reason).not.toMatch(/network|didn't work|failed/i);
  });

  it("ACTIVATION: a rate limit on the first check → retried, and the start goes through", async () => {
    scripted(
      RATE_LIMITED, adState("CAMPAIGN_PAUSED"), level(C, "PAUSED"), level(S, "CAMPAIGN_PAUSED"),
      accepted, accepted, accepted,
      adState("ACTIVE", "ACTIVE"), level(C, "ACTIVE", "ACTIVE"), level(S, "ACTIVE", "ACTIVE"),
    );
    const r = await setCampaignStatus({ objects: OBJECTS, token: TOKEN, status: "ACTIVE" });
    expect(r.ok).toBe(true);
  });

  it("a status WRITE hit by a transient error is retried, not reported as refused", async () => {
    const calls = scripted(UNEXPECTED, accepted, accepted, accepted, adState("CAMPAIGN_PAUSED"), level(C, "PAUSED"), level(S, "CAMPAIGN_PAUSED"));
    const r = await setCampaignStatus({ objects: OBJECTS, token: TOKEN, status: "PAUSED" });
    expect(r.ok).toBe(true);
    expect(calls.filter((c) => c === `POST ${C}`)).toHaveLength(2);
  });
});
