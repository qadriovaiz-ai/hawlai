// THE INSTAGRAM ACCOUNT ID META ROUTES BY — 28 November 2026.
//
// Instagram Login's /me answers with TWO ids for one account: `id` is
// app-scoped, `user_id` is the professional account's own id, and Meta
// names the account in every webhook by `user_id`. The connect callback
// stored `id`. So the day the signature fix let DMs through, every one came
// back "no_business_matched", measured in production:
//
//   webhook entry.id           17841432344301688
//   stored instagram_business  28844011251865336
//   /me → id / user_id         28844011251865336 / 17841432344301688
//
// Both ids answer the read and subscription edges (checked live), so the
// fix is the stored value — at the callback for new connections, and by
// the health check for every connection made before.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const APP_SCOPED = "28844011251865336";
const USER_ID = "17841432344301688";

// ---- the service client -------------------------------------------------
let updates: any[];
let holderOfUserId: { id: string } | null;
let subscribedWith: any[];

function service() {
  return {
    from: (table: string) => {
      const filters: Record<string, any> = {};
      const api: any = {
        select: () => api,
        eq: (k: string, v: any) => ((filters[k] = v), api),
        neq: () => api,
        is: () => api,
        update: (values: any) => {
          updates.push({ table, values });
          return api;
        },
        upsert: async () => ({ error: null }),
        maybeSingle: async () => {
          if (table === "dealerships" && filters.instagram_business_id === USER_ID) return { data: holderOfUserId, error: null };
          if (table === "dealerships") return { data: { instagram_business_id: APP_SCOPED, instagram_access_token: "tok" }, error: null };
          return { data: null, error: null };
        },
        then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej),
      };
      return api;
    },
  };
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => service() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/webhooks/subscribeWebhooks", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    subscribeAndRecord: async (_s: any, _d: string, _p: string, account: any) => {
      subscribedWith.push(account);
      return { ok: true };
    },
  };
});

// ---- Instagram, faked ---------------------------------------------------
let meBody: any;
beforeEach(() => {
  updates = [];
  subscribedWith = [];
  holderOfUserId = null;
  meBody = { id: APP_SCOPED, user_id: USER_ID, username: "a_shop" };
  process.env.INSTAGRAM_APP_ID = "ig-app";
  process.env.INSTAGRAM_APP_SECRET = "ig-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "short" }), { status: 200 });
      if (url.includes("graph.instagram.com/access_token")) return new Response(JSON.stringify({ access_token: "long" }), { status: 200 });
      if (url.includes("/me?")) return new Response(JSON.stringify(meBody), { status: 200 });
      if (url.includes("/subscribed_apps")) return new Response(JSON.stringify({ data: [{ subscribed_fields: ["messages", "comments"] }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import { GET as callback } from "@/app/api/auth/instagram/callback/route";
import { probeAndRecord } from "@/lib/integrations/probes";

const connect = () => callback(new Request("https://hawlai.online/api/auth/instagram/callback?code=c&state=d1"));
const storedId = () => updates.find((u) => u.table === "dealerships" && "instagram_business_id" in u.values)?.values.instagram_business_id;

describe("1. A NEW CONNECTION STORES THE ID WEBHOOKS USE", () => {
  it("THE PRODUCTION CASE: user_id IS STORED, NOT THE APP-SCOPED id", async () => {
    const res = await connect();
    expect(res.headers.get("location")).toContain("instagram_connected=a_shop");
    expect(storedId()).toBe(USER_ID);
  });

  it("AND THE WEBHOOK SUBSCRIPTION IS MADE WITH THE SAME ID", async () => {
    await connect();
    expect(subscribedWith[0].id).toBe(USER_ID);
  });

  it("NO user_id FAILS THE CONNECTION — it never falls back to the id that broke routing", async () => {
    meBody = { id: APP_SCOPED, username: "a_shop" };
    const res = await connect();
    expect(res.headers.get("location")).toContain("instagram_error=");
    expect(storedId()).toBeUndefined();
  });
});

describe("2. AN EXISTING CONNECTION IS CORRECTED BY ITS HEALTH CHECK — no reconnect, no SQL", () => {
  it("A STORED APP-SCOPED ID IS REPLACED WITH user_id, and the check still reads working", async () => {
    const health = await probeAndRecord(service(), "d1", "instagram");
    expect(storedId()).toBe(USER_ID);
    expect(health.state).toBe("working");
  });

  it("NOT WHEN ANOTHER BUSINESS ALREADY HOLDS THAT ID — routing one account's DMs to two businesses is worse than to none", async () => {
    holderOfUserId = { id: "someone-else" };
    const health = await probeAndRecord(service(), "d1", "instagram");
    expect(storedId()).toBeUndefined();
    expect(health.state).toBe("incomplete");
    expect(health.reason).toMatch(/already linked to another business/);
  });

  it("AN ALREADY-CORRECT ID IS LEFT ALONE", async () => {
    meBody = { id: APP_SCOPED, user_id: APP_SCOPED, username: "a_shop" };
    await probeAndRecord(service(), "d1", "instagram");
    expect(storedId()).toBeUndefined();
  });
});
