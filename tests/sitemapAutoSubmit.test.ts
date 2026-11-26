// A PUBLISHED SITE GETS ITS SITEMAP TO GOOGLE WITH NOBODY TOUCHING SEARCH
// CONSOLE — 27 November 2026.
//
// On 26 November the search sync was proven healthy and still stored
// nothing: Google had never seen the shop ("URL is unknown to Google"),
// because no sitemap had ever been submitted. The founder's standing rule
// is that nothing should send a business owner to another tool for their
// own business, so the submission is now automatic: on publish, and
// again every day.
//
// THE CHAIN UNDER TEST, every link real except the network and the
// database:
//
//   setSitePublished(…, true)
//     -> an event_queue row, written through the SERVICE client
//     -> EVENT_HANDLERS.site_published
//     -> a signed service-account JWT exchanged for a token
//     -> PUT /sites/{platform property}/sitemaps/{platform sitemap.xml}
//
// AND WHAT IT MUST NOT DO: call Google's Indexing API, which its own
// terms restrict to job-posting and livestream pages.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { code } from "./helpers/source";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const SA_EMAIL = "sitemap-bot@a-project.iam.gserviceaccount.com";
const SA_JSON = JSON.stringify({ type: "service_account", client_email: SA_EMAIL, private_key: privateKey });

// ---- the two database clients ----------------------------------------

type Row = Record<string, any>;
let serviceInserts: { table: string; row: Row }[];
let ownerInserts: { table: string; row: Row }[];
let serviceInsertError: string | null;

/** The SERVICE client: RLS off, so its inserts land. */
function serviceDb() {
  return {
    from: (table: string) => ({
      insert: async (row: Row) => {
        serviceInserts.push({ table, row });
        return { error: serviceInsertError ? { message: serviceInsertError } : null };
      },
    }),
  };
}

/**
 * The OWNER'S session, as the publish route passes it. event_queue has no
 * client INSERT policy, so an insert here is refused — exactly as in
 * production.
 */
function ownerDb() {
  const from = (table: string) => {
    const api: any = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: table === "websites" ? { id: "w1" } : null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async (row: Row) => {
        ownerInserts.push({ table, row });
        return { error: { message: 'new row violates row-level security policy for table "event_queue"' } };
      },
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => serviceDb() }));

// ---- Google, faked at the network --------------------------------------

let calls: { url: string; method: string; body: string; auth: string | null }[];
let sitemapStatus: number;

function fakeGoogle() {
  return vi.fn(async (input: any, init: any = {}) => {
    const url = String(input);
    const body = init.body ? String(init.body) : "";
    calls.push({ url, method: init.method ?? "GET", body, auth: init.headers?.Authorization ?? null });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "platform-token", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("/sitemaps/")) {
      return sitemapStatus < 300
        ? new Response(null, { status: sitemapStatus })
        : new Response(JSON.stringify({ error: { message: "User does not have sufficient permission" } }), { status: sitemapStatus });
    }
    return new Response("{}", { status: 404 });
  });
}

import { setSitePublished } from "@/lib/website/setSitePublished";
import { EVENT_HANDLERS } from "@/lib/events/eventHandlers";
import { ensurePlatformSitemap, readServiceAccount, SITE_PUBLISHED_EVENT, SUBMIT_SITEMAP_ACTION } from "@/lib/seo/sitemapSubmit";
import { ACTION_POLICIES } from "@/lib/executionPolicy";

const savedEnv = { ...process.env };

beforeEach(() => {
  serviceInserts = [];
  ownerInserts = [];
  serviceInsertError = null;
  calls = [];
  sitemapStatus = 204;
  process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";
  process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT = SA_JSON;
  delete process.env.SEARCH_CONSOLE_PLATFORM_PROPERTY;
  vi.stubGlobal("fetch", fakeGoogle());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Publish, then run whatever the dispatcher would run for what was queued. */
async function publishAndDispatch() {
  const result = await setSitePublished(ownerDb(), "d1", true);
  for (const { table, row } of serviceInserts) {
    if (table !== "event_queue") continue;
    for (const handler of EVENT_HANDLERS[row.event_type] ?? []) {
      await handler(null, { id: "e1", dealership_id: row.dealership_id, event_type: row.event_type, payload: row.payload });
    }
  }
  return result;
}

const sitemapPut = () => calls.find((c) => c.method === "PUT" && c.url.includes("/sitemaps/"));

describe("1. PUBLISHING A SITE SUBMITS THE SITEMAP, AND NOBODY OPENS SEARCH CONSOLE", () => {
  it("THE WHOLE CHAIN: publish -> queued event -> handler -> the sitemap is PUT on the platform property", async () => {
    const result = await publishAndDispatch();
    expect(result).toEqual({ ok: true });

    const put = sitemapPut();
    expect(put, "no sitemap was submitted").toBeDefined();
    expect(put!.url).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/" +
        encodeURIComponent("sc-domain:hawlai.online") +
        "/sitemaps/" +
        encodeURIComponent("https://hawlai.online/sitemap.xml")
    );
    expect(put!.auth).toBe("Bearer platform-token");
  });

  it("THE EVENT GOES THROUGH THE SERVICE CLIENT — the owner's session would be refused by RLS", async () => {
    await setSitePublished(ownerDb(), "d1", true);
    expect(serviceInserts).toEqual([{ table: "event_queue", row: { dealership_id: "d1", event_type: SITE_PUBLISHED_EVENT, payload: {} } }]);
    expect(ownerInserts).toEqual([]);
  });

  it("THE TOKEN COMES FROM A REAL, VERIFIABLE SIGNATURE with the write scope", async () => {
    await publishAndDispatch();
    const tokenCall = calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!;
    const params = new URLSearchParams(tokenCall.body);
    expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [h, c, s] = params.get("assertion")!.split(".");
    const verify = createVerify("RSA-SHA256");
    verify.update(`${h}.${c}`);
    expect(verify.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);

    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims.iss).toBe(SA_EMAIL);
    expect(claims.scope).toBe("https://www.googleapis.com/auth/webmasters");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
  });

  it("AND IT NEVER CALLS THE INDEXING API — Google restricts it to job and livestream pages", async () => {
    await publishAndDispatch();
    expect(calls.some((c) => c.url.includes("indexing.googleapis.com"))).toBe(false);
  });

  it("UNPUBLISHING SUBMITS NOTHING — the safe direction stays the fast one", async () => {
    await setSitePublished(ownerDb(), "d1", false);
    expect(serviceInserts).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("2. WHEN IT CANNOT HAPPEN, IT SAYS SO", () => {
  it("NO CREDENTIAL IS AN ERROR, NOT A SKIP — the event fails with the reason", async () => {
    delete process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT;
    await expect(publishAndDispatch()).rejects.toThrow(/GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT is not set/);
    expect(calls).toEqual([]);
  });

  it("GOOGLE REFUSING THE SITEMAP FAILS THE EVENT, with Google's own words", async () => {
    sitemapStatus = 403;
    await expect(publishAndDispatch()).rejects.toThrow(/refused the sitemap \(403\).*sufficient permission/);
  });

  it("A MALFORMED KEY READS AS MALFORMED, never as 'nobody configured it'", () => {
    expect(readServiceAccount("{not json")).toEqual({ error: expect.stringContaining("not valid JSON") });
    expect(readServiceAccount(JSON.stringify({ client_email: "x@y" }))).toEqual({ error: expect.stringContaining("private_key") });
    expect(readServiceAccount("")).toBeNull();
  });

  it("A QUEUE THAT REFUSES THE EVENT DOES NOT FAIL THE PUBLISH, and it is logged", async () => {
    serviceInsertError = "connection reset";
    const errors: string[] = [];
    (console.error as any).mockImplementation((...a: any[]) => errors.push(a.join(" ")));
    expect(await setSitePublished(ownerDb(), "d1", true)).toEqual({ ok: true });
    expect(errors.some((e) => e.includes("couldn't queue the sitemap submission") && e.includes("connection reset"))).toBe(true);
  });
});

describe("3. RULE 6: THE REGISTRY DECIDES WHETHER IT RUNS", () => {
  it("IT IS CLASSIFIED, low risk, and needs no approval", () => {
    const p = ACTION_POLICIES[SUBMIT_SITEMAP_ACTION];
    expect(p).toBeDefined();
    expect(p.riskLevel).toBe("low");
    expect(p.requiresApproval).toBe(false);
  });

  it("RECLASSIFIED AS NEEDING APPROVAL, it stops on its own and calls nobody", async () => {
    const original = ACTION_POLICIES[SUBMIT_SITEMAP_ACTION];
    ACTION_POLICIES[SUBMIT_SITEMAP_ACTION] = { ...original, requiresApproval: true };
    try {
      const r = await ensurePlatformSitemap();
      expect(r.submitted).toBe(false);
      expect(calls).toEqual([]);
    } finally {
      ACTION_POLICIES[SUBMIT_SITEMAP_ACTION] = original;
    }
  });
});

describe("4. AND EVERY DAY, so a site published before this existed is covered too", () => {
  it("THE DAILY RUN'S PLATFORM TASKS SUBMIT IT", () => {
    const src = code("src/app/api/autopilot/daily-run/route.ts");
    const start = src.indexOf("platformTasks: async () => {");
    const end = src.indexOf("return {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).toMatch(/await\s+ensurePlatformSitemap\s*\(/);
  });
});
