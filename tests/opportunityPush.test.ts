// An opportunity leaves the app — P-a and P-b.
//
// ──────────────────────────────────────────────────────────────────
// WHAT THIS IS FOR. Hawlai detected plenty and told nobody. A campaign
// read Active in Hawlai and in Ads Manager with zero impressions for
// SEVENTY DAYS — September to November 2026 — and the sentence saying
// so existed the whole time, in a DISPLAY function on a page nobody
// opened. Migration 234 gave it a notification kind. This gets it out
// of the app.
//
// REACH ONLY, which is the owner's decision of 23 November 2026:
// Hawlai says where the opportunity is and what to do or not do, and
// the decision is always his. Nothing here acts.
//
// THREE RULES THIS FILE EXISTS TO HOLD:
//
//   1. THE LIST IS A CHOICE. Three kinds push; three stay in the daily
//      email. A push that fires for everything gets muted, and then
//      the real one is muted too.
//   2. ONLY A NEW FACT. These detectors run daily with a stable
//      dedupe_key, so most calls collide and no-op. Emailing anyway
//      would send the same sentence every morning.
//   3. AND ONLY A FACT THAT EXISTS. Migration 234's story is a kind the
//      database rejected while emitNotification swallowed the error —
//      the detector ran daily, found the silence, and was silent about
//      it. An email about a notification that was never written would
//      be that bug wearing a second hat.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PUSHED_KINDS, isPushedKind, emitNotification } from "@/lib/notifications/emit";
import { opportunityEmail } from "@/lib/notifications/opportunityEmail";
import { code } from "./helpers/source";

const sentMail: { to: string; subject: string; body: string; options?: any }[] = [];
vi.mock("@/lib/email/sendDealerEmail", () => ({
  ownerEmail: async (ownerId: string | null) => (ownerId ? "owner@example.test" : null),
  sendDealerEmail: async (_s: any, _d: string, to: string, subject: string, body: string, options?: any) => {
    sentMail.push({ to, subject, body, options });
    return { sent: true };
  },
}));

import { EVENT_HANDLERS } from "@/lib/events/eventHandlers";

type Row = Record<string, any>;

/**
 * A client whose notifications insert succeeds or collides, and which
 * records what reached event_queue.
 */
function clientThat(insertError: any, business: Row | null = { dealership_name: "candle_by_qaaf", owner_id: "u1" }) {
  const events: Row[] = [];
  const from = (table: string) => {
    const api: any = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: table === "dealerships" ? business : null, error: null }),
      insert: async (row: any) => {
        if (table === "event_queue") events.push(row);
        return { data: null, error: table === "notifications" ? insertError : null };
      },
    };
    return api;
  };
  return { client: { from }, events };
}

const fire = async (payload: Row, dealershipId = "d1", business: Row | null = { dealership_name: "candle_by_qaaf", owner_id: "u1" }) => {
  const { client } = clientThat(null, business);
  for (const handler of EVENT_HANDLERS.opportunity_noticed ?? []) {
    await handler(client as any, { id: "e1", dealership_id: dealershipId, event_type: "opportunity_noticed", payload } as any);
  }
};

beforeEach(() => {
  sentMail.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("1. THE LIST IS A CHOICE SOMEBODY MADE", () => {
  it("EXACTLY THREE KINDS PUSH, and these three", () => {
    // THE LOAD-BEARING ONE. A fourth entry must fail the suite until
    // somebody writes down why — otherwise the list grows by
    // convenience until the push is noise.
    expect([...PUSHED_KINDS].sort()).toEqual(["campaign_budget_overrun", "campaign_not_delivering", "hot_lead"]);
  });

  it("AND THE READING MATERIAL DELIBERATELY DOES NOT", () => {
    // The owner's own cut: these belong in the daily email.
    for (const quiet of ["competitor_alert", "topic_alert", "content_performance", "variant_draft_generated"]) {
      expect(isPushedKind(quiet), quiet).toBe(false);
    }
  });

  it("AND THE NEAR MISSES ARE THE ONES THAT MATTER", () => {
    // FOUND BY MUTATION. The four above all differ from a pushed kind
    // in their first letters, so a LOOSE match — prefix instead of
    // equality — passed every one of them. These do not, and they are
    // exactly the pairs the owner's choice draws a line between:
    //
    //   budget WARNING is a heads-up; budget OVERRUN is money gone.
    //   auto_paused is Hawlai having already acted, which is the one
    //   thing this push is not about.
    //
    // A push that cannot tell those apart would fire on the kinds he
    // deliberately left in the daily email.
    for (const nearMiss of ["campaign_budget_warning", "campaign_auto_paused", "hot_lead_followup", "campaign"]) {
      expect(isPushedKind(nearMiss), nearMiss).toBe(false);
    }
  });

  it("every pushed kind is really emitted by a detector somewhere", () => {
    // A list pointing at a kind nothing produces would read as wired
    // and push nothing, forever.
    const detectors = [
      "src/lib/ads/deliveryWatch.ts",
      "src/app/api/webhooks/meta-leads/route.ts",
      "src/lib/agents/budgetAlertAgent.ts",
    ].map((f) => code(f)).join("\n");
    for (const kind of PUSHED_KINDS) {
      expect(detectors, `nothing emits ${kind}`).toContain(`kind: "${kind}"`);
    }
  });
});

describe("2. THE PUSH RIDES A ROW THAT WAS ACTUALLY WRITTEN", () => {
  it("A NEW NOTIFICATION OF A PUSHED KIND RAISES THE EVENT", async () => {
    const { client, events } = clientThat(null);
    await emitNotification(client as any, {
      dealershipId: "d1",
      kind: "campaign_not_delivering",
      title: "A campaign is Active and reaching nobody",
      body: "Diwali Sale has had 0 impressions since 10 September.",
      href: "/dashboard/ads",
      dedupeKey: "not_delivering:camp-1",
    });
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("opportunity_noticed");
    expect(events[0].payload.kind).toBe("campaign_not_delivering");
    expect(events[0].payload.title).toContain("reaching nobody");
    expect(events[0].payload.dedupeKey).toBe("not_delivering:camp-1");
  });

  it("A DEDUPE COLLISION RAISES NOTHING — the same fact tomorrow", async () => {
    // THE RULE THAT KEEPS THIS FROM BECOMING NOISE. deliveryWatch runs
    // daily with a stable key, so "still not delivering" collides.
    const { client, events } = clientThat({ code: "23505", message: "duplicate key value violates unique constraint" });
    await emitNotification(client as any, {
      dealershipId: "d1",
      kind: "campaign_not_delivering",
      title: "A campaign is Active and reaching nobody",
      dedupeKey: "not_delivering:camp-1",
    });
    expect(events.length, "the same fact was pushed twice").toBe(0);
  });

  it("AND NEITHER DOES ANY OTHER INSERT FAILURE", async () => {
    // Migration 234's exact shape: a kind the DB constraint rejects,
    // with the error swallowed. An email about a notification that
    // does not exist is that bug wearing a second hat.
    const { client, events } = clientThat({ code: "23514", message: "violates check constraint notifications_kind_check" });
    await emitNotification(client as any, {
      dealershipId: "d1",
      kind: "campaign_not_delivering",
      title: "A campaign is Active and reaching nobody",
    });
    expect(events.length).toBe(0);
  });

  it("A KIND THAT IS NOT PUSHED RAISES NOTHING, even on a clean insert", async () => {
    const { client, events } = clientThat(null);
    await emitNotification(client as any, {
      dealershipId: "d1",
      kind: "competitor_alert",
      title: "A competitor changed their pricing",
    });
    expect(events.length).toBe(0);
  });

  it("and a throwing client still cannot break the detector it rides along with", async () => {
    const throwing = { from: () => ({ insert: async () => { throw new Error("no connection"); } }) };
    await expect(
      emitNotification(throwing as any, { dealershipId: "d1", kind: "hot_lead", title: "A hot lead came in" })
    ).resolves.toBeUndefined();
  });
});

describe("3. WHAT THE OWNER READS, AND WHAT IT DOES NOT CLAIM", () => {
  it("EVERY MESSAGE SAYS NOTHING HAS BEEN DONE", () => {
    // THE LOAD-BEARING ONE for "reach only". "Your campaign is
    // reaching nobody" with no such line invites the reasonable
    // assumption that Hawlai is already fixing it — and then nobody
    // fixes it.
    for (const kind of PUSHED_KINDS) {
      const { body } = opportunityEmail("Candle by Qaaf", { kind, title: "Something happened" });
      expect(body, kind).toContain("Hawlai hasn't changed anything");
      expect(body, kind).toContain("yours to decide");
    }
  });

  it("AND IT NEVER SAYS IT ACTED", () => {
    for (const kind of PUSHED_KINDS) {
      const { subject, body } = opportunityEmail("Candle by Qaaf", { kind, title: "Something happened" });
      expect(`${subject} ${body}`, kind).not.toMatch(/\b(we fixed|we paused|we changed|has been fixed|we have updated)\b/i);
    }
  });

  it("THE FACT IS IN THE SUBJECT, which is what a phone shows unopened", () => {
    const { subject } = opportunityEmail("Candle by Qaaf", {
      kind: "campaign_not_delivering",
      title: "Diwali Sale is Active and reaching nobody",
    });
    expect(subject).toBe("Candle by Qaaf: Diwali Sale is Active and reaching nobody");
  });

  it("THE ADVICE SAYS WHAT NOT TO DO WHERE THAT IS THE POINT", () => {
    // The instinct on an overrun is to raise the budget. The money is
    // already spent.
    const over = opportunityEmail("X", { kind: "campaign_budget_overrun", title: "Over budget" }).body;
    expect(over).toMatch(/already spent/);
    expect(over).toMatch(/not the fix/);
    // And more budget is explicitly not the answer to a dead campaign.
    const dead = opportunityEmail("X", { kind: "campaign_not_delivering", title: "Reaching nobody" }).body;
    expect(dead).toMatch(/more budget changes nothing/);
  });

  it("an unknown kind sends with no advice line rather than a generic one", () => {
    // "Take a look" is worse than silence: it spends a line the eye
    // has learned to skip.
    const { body } = opportunityEmail("X", { kind: "something_new", title: "A thing" });
    expect(body).not.toContain("What to do:");
    expect(body).toContain("Hawlai hasn't changed anything");
  });

  it("the body and link travel when they exist, and are absent when they do not", () => {
    const withAll = opportunityEmail("X", { kind: "hot_lead", title: "T", body: "B", href: "/dashboard/leads" }).body;
    expect(withAll).toContain("B");
    expect(withAll).toContain("/dashboard/leads");
    const bare = opportunityEmail("X", { kind: "hot_lead", title: "T" }).body;
    expect(bare).not.toMatch(/\bnull\b|\bundefined\b/);
  });
});

describe("4. THE HANDLER SENDS IT, ONCE", () => {
  it("A PUSHED EVENT REACHES THE OWNER'S INBOX", async () => {
    await fire({
      kind: "hot_lead",
      title: "A hot lead came in",
      body: "Asha asked about the workshop.",
      href: "/dashboard/leads",
      dedupeKey: "hot_lead:lead-1",
    });
    expect(sentMail.length).toBe(1);
    // The handle becomes words — not the raw signup handle.
    expect(sentMail[0].subject).toBe("Candle by Qaaf: A hot lead came in");
    expect(sentMail[0].body).toContain("Reply to this one today");
  });

  it("ONE EMAIL PER FACT, keyed on the notification's own dedupe key", async () => {
    // The event queue retries a failed handler. A retry must not ask
    // him twice about one thing.
    await fire({ kind: "hot_lead", title: "A hot lead came in", dedupeKey: "hot_lead:lead-1" });
    expect(sentMail[0].options?.idempotencyKey).toBe("opportunity:hot_lead:lead-1");
  });

  it("NO OWNER ADDRESS SENDS NOTHING, and is not an error", async () => {
    await fire({ kind: "hot_lead", title: "A hot lead came in" }, "d1", { dealership_name: "x", owner_id: null });
    expect(sentMail.length).toBe(0);
  });

  it("A PAYLOAD WITH NO TITLE SENDS NOTHING", async () => {
    // An email whose subject is just the business name tells him
    // nothing and trains him to ignore the next one.
    await fire({ kind: "hot_lead" });
    expect(sentMail.length).toBe(0);
    await fire({ title: "A hot lead came in" });
    expect(sentMail.length).toBe(0);
  });

  it("and it is registered under the event emitNotification raises", () => {
    const src = code("src/lib/notifications/emit.ts");
    expect(src).toMatch(/eventType: "opportunity_noticed"/);
    expect(EVENT_HANDLERS.opportunity_noticed?.length ?? 0).toBeGreaterThan(0);
  });
});
