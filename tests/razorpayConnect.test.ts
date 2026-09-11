// Connect Razorpay — the owner signs in on Razorpay; nobody pastes a key.
//
// THE LIVE CASE: the Website Builder's Payments tab asked the owner to
// copy a Key ID and Key Secret out of Razorpay's dashboard and paste
// them in. Now "Connect Razorpay" sends them to Razorpay's own sign-in
// page, the tokens come back to the server, are stored encrypted, and
// are never shown to anyone. The paste form survives only as a fallback
// for a server with no Razorpay partner app — and even then keys are
// checked with Razorpay, encrypted, and never displayed back.
//
// Every route here runs for real against a fake database and a fake
// Razorpay with Razorpay's real response shapes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

process.env.COMMERCE_ENCRYPTION_KEY = process.env.COMMERCE_ENCRYPTION_KEY ?? "b".repeat(64);

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row; filters: [string, any][] }[];
let updateError: string | null;
let signedIn: boolean;
let jar: Map<string, string>;

// A Supabase-shaped fake. Like the live database, a select that NAMES a
// dealerships column the row doesn't have fails — which is what migration
// 178 not having run yet looks like.
function query(table: string) {
  let op: "select" | "update" | "insert" = "select";
  let values: Row = {};
  let cols = "*";
  const filters: [string, any][] = [];
  const matching = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const run = (): { data: any; error: any } => {
    if (op === "insert") {
      const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...values };
      (tables[table] ??= []).push(row);
      writes.push({ table, op, values, filters: [] });
      return { data: [row], error: null };
    }
    if (op === "update") {
      if (updateError) return { data: null, error: { message: updateError } };
      const hit = matching();
      hit.forEach((r) => Object.assign(r, values));
      writes.push({ table, op, values, filters: [...filters] });
      return { data: hit, error: null };
    }
    const rows = matching();
    if (table === "dealerships" && cols !== "*") {
      const missing = cols.split(",").map((c) => c.trim()).filter((c) => rows.some((r) => !(c in r)));
      if (missing.length) return { data: null, error: { message: `column dealerships.${missing[0]} does not exist` } };
    }
    return { data: rows, error: null };
  };
  const one = async () => {
    const r = run();
    return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
  };
  const api: any = {
    select: (c?: string) => {
      if (op === "select" && c) cols = c;
      return api;
    },
    eq: (k: string, v: any) => {
      filters.push([k, v]);
      return api;
    },
    update: (v: Row) => {
      op = "update";
      values = v;
      return api;
    },
    insert: (v: Row) => {
      op = "insert";
      values = v;
      return api;
    },
    maybeSingle: one,
    single: one,
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: "u1" } : null } }) }, from: (t: string) => query(t) }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (t: string) => query(t) }) }));
vi.mock("@/lib/orderPricing", () => ({
  resolveOrderPricing: async () => ({
    ok: true,
    website: { id: "w1", dealership_id: "d1" },
    resolvedItems: [{ name: "Lavender candle", quantity: 1, price: 550 }],
    productMap: {},
    subtotal: 550,
    discountAmount: 0,
    appliedDiscountId: null,
    shippingAmount: 0,
    total: 550,
  }),
}));
vi.mock("@/lib/orderFulfillment", () => ({ applyOrderSideEffects: async () => {} }));
vi.mock("@/lib/storefront/resolveAttribution", () => ({
  resolveOrderAttribution: async () => ({ utm_campaign: null, utm_source: null, meta_campaign_id: null }),
}));

import { POST as start } from "@/app/api/integrations/razorpay/start/route";
import { GET as callback } from "@/app/api/integrations/razorpay/callback/route";
import { POST as disconnect } from "@/app/api/integrations/razorpay/disconnect/route";
import { GET as settingsGet, PATCH as settingsPatch } from "@/app/api/settings/razorpay/route";
import { GET as paymentConfig } from "@/app/api/public/payment-config/route";
import { POST as createOrder } from "@/app/api/public/orders/route";
import { POST as verifyPayment } from "@/app/api/public/orders/verify-payment/route";
import { encryptedWrite, razorpayOAuthAccessToken, razorpayOAuthRefreshToken, razorpaySecret } from "@/lib/crypto/commerceSecrets";

const CLIENT_SECRET = "partner_secret_1";
const TOKENS = {
  token_type: "Bearer",
  expires_in: 7776000,
  access_token: "at_ACCESS_SECRET",
  refresh_token: "rt_REFRESH_SECRET",
  public_token: "rzp_test_oauth_PUBLIC",
  razorpay_account_id: "acc_Candle01",
};
const DAY = 24 * 60 * 60 * 1000;

/** Connected with Connect Razorpay. */
function oauthRow(expiresInMs = 60 * DAY): Row {
  return {
    id: "d1",
    razorpay_key_id: null,
    razorpay_key_secret_encrypted: null,
    ...encryptedWrite("razorpay_oauth_access_token", TOKENS.access_token),
    ...encryptedWrite("razorpay_oauth_refresh_token", TOKENS.refresh_token),
    razorpay_oauth_public_token: TOKENS.public_token,
    razorpay_account_id: TOKENS.razorpay_account_id,
    razorpay_oauth_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    razorpay_oauth_mode: "test",
  };
}

/** Pasted keys, BEFORE migration 178 — the OAuth columns don't exist at all. */
function keysRow(): Row {
  return { id: "d1", razorpay_key_id: "rzp_live_KEYID1", ...encryptedWrite("razorpay_key_secret", "legacy_KEY_SECRET") };
}

type Handler = (body: any) => [number, any];
/** Razorpay, by URL prefix — the first matching prefix answers. */
function razorpay(routes: Record<string, Handler>) {
  const calls: { url: string; body: any; auth: string | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), body, auth: init.headers?.Authorization });
      const key = Object.keys(routes).find((k) => String(url).startsWith(k));
      const [status, json] = key ? routes[key](body) : [404, { error: { description: "not found" } }];
      return { ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json) };
    })
  );
  return calls;
}

const TOKEN_URL = "https://auth.razorpay.com/token";
const req = (path: string, init?: RequestInit) => new Request(`https://app.hawlai.com${path}`, init);
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
const landing = (res: Response) => new URL(res.headers.get("location")!);
const sign = (orderId: string, paymentId: string, secret: string) => crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
const CUSTOMER = { slug: "shop", customerName: "Asha", customerPhone: "9876543210", shippingAddress: "12 MG Road, Pune", items: [] };

beforeEach(() => {
  process.env.RAZORPAY_OAUTH_CLIENT_ID = "partner_client_1";
  process.env.RAZORPAY_OAUTH_CLIENT_SECRET = CLIENT_SECRET;
  delete process.env.RAZORPAY_OAUTH_MODE;
  jar = new Map();
  signedIn = true;
  writes = [];
  updateError = null;
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [keysRow()],
    websites: [{ slug: "shop", dealership_id: "d1" }],
    orders: [],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Connect Razorpay: the owner signs in on Razorpay, nobody pastes a key", () => {
  it("starting sends the owner to Razorpay's own sign-in page, with a one-time state", async () => {
    const res = await start(req("/api/integrations/razorpay/start", { method: "POST" }));
    const u = new URL((await res.json()).url);
    expect(u.origin + u.pathname).toBe("https://auth.razorpay.com/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "partner_client_1",
      response_type: "code",
      redirect_uri: "https://app.hawlai.com/api/integrations/razorpay/callback",
      scope: "read_write",
      state: jar.get("razorpay_oauth_state"),
    });
  });

  it("isn't offered at all when the partner app isn't configured", async () => {
    delete process.env.RAZORPAY_OAUTH_CLIENT_SECRET;
    const res = await start(req("/api/integrations/razorpay/start", { method: "POST" }));
    expect(res.status).toBe(503);
    expect(jar.size).toBe(0);
  });

  it("coming back approved stores the tokens ENCRYPTED, removes the pasted keys, and lands on Payments", async () => {
    jar.set("razorpay_oauth_state", "s1");
    const calls = razorpay({ [TOKEN_URL]: () => [200, TOKENS] });
    const res = await callback(req("/api/integrations/razorpay/callback?code=CODE1&state=s1"));

    expect(landing(res).pathname).toBe("/dashboard/website-builder");
    expect(Object.fromEntries(landing(res).searchParams)).toEqual({ tab: "payments", razorpay: "connected" });
    expect(calls[0].body).toEqual({
      client_id: "partner_client_1",
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: "CODE1",
      redirect_uri: "https://app.hawlai.com/api/integrations/razorpay/callback",
      mode: "live",
    });

    const row = tables.dealerships[0];
    expect(JSON.stringify(row)).not.toContain(TOKENS.access_token);
    expect(JSON.stringify(row)).not.toContain(TOKENS.refresh_token);
    expect(razorpayOAuthAccessToken(row)).toBe(TOKENS.access_token);
    expect(razorpayOAuthRefreshToken(row)).toBe(TOKENS.refresh_token);
    expect(row).toMatchObject({
      razorpay_oauth_public_token: TOKENS.public_token,
      razorpay_account_id: "acc_Candle01",
      razorpay_oauth_mode: "live",
      razorpay_key_id: null,
      razorpay_key_secret_encrypted: null,
    });
    expect(Date.parse(row.razorpay_oauth_expires_at) - Date.now()).toBeGreaterThan(89 * DAY);
    expect(jar.has("razorpay_oauth_state")).toBe(false);
  });

  it("a callback whose state doesn't match this browser is refused before Razorpay is asked anything", async () => {
    jar.set("razorpay_oauth_state", "s1");
    const calls = razorpay({ [TOKEN_URL]: () => [200, TOKENS] });
    const res = await callback(req("/api/integrations/razorpay/callback?code=CODE1&state=forged"));
    expect(landing(res).searchParams.get("reason")).toBe("mismatch");
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("cancelling on Razorpay's page changes nothing and says so plainly", async () => {
    jar.set("razorpay_oauth_state", "s1");
    const calls = razorpay({});
    const res = await callback(req("/api/integrations/razorpay/callback?error=access_denied&state=s1"));
    expect(landing(res).searchParams.get("razorpay")).toBe("cancelled");
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("a refused exchange saves nothing, and the log keeps Razorpay's words but never the client secret", async () => {
    const err = quiet();
    jar.set("razorpay_oauth_state", "s1");
    razorpay({ [TOKEN_URL]: () => [400, { error: "invalid_grant", error_description: "The authorization code has expired" }] });
    const res = await callback(req("/api/integrations/razorpay/callback?code=OLD&state=s1"));
    expect(landing(res).searchParams.get("reason")).toBe("exchange_failed");
    expect(writes).toHaveLength(0);
    const logged = err.mock.calls.flat().join(" ");
    expect(logged).toMatch(/authorization code has expired/);
    expect(logged).not.toContain(CLIENT_SECRET);
  });

  it("if the connection can't be saved (migration 178 not run), the pasted keys are untouched", async () => {
    quiet();
    updateError = "column dealerships.razorpay_oauth_public_token does not exist";
    jar.set("razorpay_oauth_state", "s1");
    razorpay({ [TOKEN_URL]: () => [200, TOKENS] });
    const res = await callback(req("/api/integrations/razorpay/callback?code=CODE1&state=s1"));
    expect(landing(res).searchParams.get("reason")).toBe("save_failed");
    expect(razorpaySecret(tables.dealerships[0])).toBe("legacy_KEY_SECRET");
  });
});

describe("checkout runs on the connection", () => {
  it("Pay Online is offered with the public token — no token or secret leaves the server", async () => {
    tables.dealerships = [oauthRow()];
    const calls = razorpay({});
    const body = await (await paymentConfig(req("/api/public/payment-config?slug=shop"))).json();
    expect(body).toEqual({ razorpayEnabled: true, keyId: TOKENS.public_token });
    expect(calls).toHaveLength(0); // 60 days left — no refresh
  });

  it("orders are created with the connection's Bearer token, and Checkout gets the public token", async () => {
    tables.dealerships = [oauthRow()];
    const calls = razorpay({ "https://api.razorpay.com/v1/orders": (b) => [200, { id: "order_R1", amount: b.amount, currency: "INR" }] });
    const body = await (await createOrder(req("/api/public/orders", post({ ...CUSTOMER, paymentMethod: "razorpay" })))).json();
    expect(calls[0].auth).toBe(`Bearer ${TOKENS.access_token}`);
    expect(calls[0].body.amount).toBe(55000);
    expect(body.razorpay).toMatchObject({ orderId: "order_R1", keyId: TOKENS.public_token });
  });

  const confirm = (signature: string, orderId = "order_R1") =>
    verifyPayment(req("/api/public/orders/verify-payment", post({ ...CUSTOMER, razorpayOrderId: orderId, razorpayPaymentId: "pay_P1", razorpaySignature: signature })));

  it("a genuine payment on this business's order is saved as paid", async () => {
    tables.dealerships = [oauthRow()];
    const calls = razorpay({ "https://api.razorpay.com/v1/orders/order_R1": () => [200, { id: "order_R1", amount: 55000, currency: "INR" }] });
    const res = await confirm(sign("order_R1", "pay_P1", CLIENT_SECRET));
    expect(res.status).toBe(200);
    expect(tables.orders[0]).toMatchObject({ payment_status: "paid", razorpay_payment_id: "pay_P1", total: 550 });
    expect(calls[0].auth).toBe(`Bearer ${TOKENS.access_token}`);
  });

  it("another store's payment can't be replayed here, even though Connect Razorpay stores share a signing secret", async () => {
    tables.dealerships = [oauthRow()];
    // Razorpay: that order isn't visible to THIS business's token.
    razorpay({ "https://api.razorpay.com/v1/orders/order_OTHER": () => [400, { error: { description: "The id provided does not exist" } }] });
    const res = await confirm(sign("order_OTHER", "pay_P1", CLIENT_SECRET), "order_OTHER");
    expect(res.status).toBe(400);
    expect(tables.orders).toHaveLength(0);
  });

  it("a cheaper payment can't be replayed to pay for a dearer cart", async () => {
    quiet();
    tables.dealerships = [oauthRow()];
    razorpay({ "https://api.razorpay.com/v1/orders/order_R1": () => [200, { id: "order_R1", amount: 1000, currency: "INR" }] });
    const res = await confirm(sign("order_R1", "pay_P1", CLIENT_SECRET));
    expect(res.status).toBe(409);
    expect(tables.orders).toHaveLength(0);
  });

  it("Razorpay not answering is never reported as a failed payment, and never invites paying again", async () => {
    quiet();
    tables.dealerships = [oauthRow()];
    razorpay({ "https://api.razorpay.com/v1/orders/order_R1": () => [503, {}] });
    const res = await confirm(sign("order_R1", "pay_P1", CLIENT_SECRET));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/payment went through.*don't pay again.*pay_P1/);
    expect(tables.orders).toHaveLength(0);
  });

  it("a business on pasted keys keeps working, with migration 178 not yet run", async () => {
    // keysRow has no OAuth columns, and the fake rejects any select naming one.
    const calls = razorpay({
      "https://api.razorpay.com/v1/orders/order_R1": () => [200, { id: "order_R1", amount: 55000, currency: "INR" }],
      "https://api.razorpay.com/v1/orders": (b) => [200, { id: "order_R1", amount: b.amount, currency: "INR" }],
    });
    expect(await (await paymentConfig(req("/api/public/payment-config?slug=shop"))).json()).toEqual({ razorpayEnabled: true, keyId: "rzp_live_KEYID1" });

    await createOrder(req("/api/public/orders", post({ ...CUSTOMER, paymentMethod: "razorpay" })));
    expect(Buffer.from(calls[0].auth!.replace("Basic ", ""), "base64").toString()).toBe("rzp_live_KEYID1:legacy_KEY_SECRET");

    const res = await confirm(sign("order_R1", "pay_P1", "legacy_KEY_SECRET"));
    expect(res.status).toBe(200);
    // The partner app's secret is NOT accepted for a business on its own keys.
    tables.orders = [];
    expect((await confirm(sign("order_R1", "pay_P1", CLIENT_SECRET))).status).toBe(400);
  });
});

describe("tokens are refreshed before they lapse", () => {
  it("within 7 days of expiry: refreshed once, stored encrypted, and pushed out ~90 days", async () => {
    tables.dealerships = [oauthRow(2 * DAY)];
    const NEW = { ...TOKENS, access_token: "at_NEW_SECRET", refresh_token: "rt_NEW_SECRET" };
    const calls = razorpay({ [TOKEN_URL]: () => [200, NEW] });

    const body = await (await paymentConfig(req("/api/public/payment-config?slug=shop"))).json();
    expect(body.razorpayEnabled).toBe(true);
    expect(calls.map((c) => c.body?.grant_type)).toEqual(["refresh_token"]);
    expect(calls[0].body.refresh_token).toBe(TOKENS.refresh_token);

    const row = tables.dealerships[0];
    expect(razorpayOAuthAccessToken(row)).toBe("at_NEW_SECRET");
    expect(razorpayOAuthRefreshToken(row)).toBe("rt_NEW_SECRET");
    expect(JSON.stringify(row)).not.toContain("_NEW_SECRET");
    expect(Date.parse(row.razorpay_oauth_expires_at) - Date.now()).toBeGreaterThan(89 * DAY);

    await paymentConfig(req("/api/public/payment-config?slug=shop"));
    expect(calls).toHaveLength(1);
  });

  it("lapsed and refused a refresh: Cash on Delivery only — never a crash, never a payment it can't verify", async () => {
    quiet();
    tables.dealerships = [oauthRow(-DAY)];
    razorpay({ [TOKEN_URL]: () => [400, { error: "invalid_grant" }] });
    const body = await (await paymentConfig(req("/api/public/payment-config?slug=shop"))).json();
    expect(body).toEqual({ razorpayEnabled: false, keyId: null });
  });

  it("if the server loses the partner app's secret, Pay Online switches off rather than guessing", async () => {
    delete process.env.RAZORPAY_OAUTH_CLIENT_SECRET;
    tables.dealerships = [oauthRow()];
    razorpay({});
    expect((await (await paymentConfig(req("/api/public/payment-config?slug=shop"))).json()).razorpayEnabled).toBe(false);
  });
});

describe("the Payments tab never hands a credential back", () => {
  it("pasted keys: says connected, and shows neither the Key ID nor the secret", async () => {
    const res = await settingsGet();
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ method: "keys", connected: true, needsReconnect: false, accountId: null, mode: null, oauthAvailable: true });
    expect(text).not.toContain("rzp_live_KEYID1");
    expect(text).not.toContain("legacy_KEY_SECRET");
  });

  it("Connect Razorpay: shows the account, never a token", async () => {
    tables.dealerships = [oauthRow()];
    const text = await (await settingsGet()).text();
    expect(JSON.parse(text)).toMatchObject({ method: "oauth", connected: true, accountId: "acc_Candle01", mode: "test" });
    for (const secret of [TOKENS.access_token, TOKENS.refresh_token, CLIENT_SECRET]) expect(text).not.toContain(secret);
  });

  it("keys can't be pasted at all when Connect Razorpay is available", async () => {
    const calls = razorpay({});
    const res = await settingsPatch(req("/api/settings/razorpay", { method: "PATCH", body: JSON.stringify({ keyId: "rzp_live_NEW", keySecret: "s" }) }));
    expect(res.status).toBe(409);
    expect(writes).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("the fallback (no partner app): keys Razorpay rejects are not saved", async () => {
    delete process.env.RAZORPAY_OAUTH_CLIENT_SECRET;
    tables.dealerships = [{ id: "d1", razorpay_key_id: null, razorpay_key_secret_encrypted: null }];
    razorpay({ "https://api.razorpay.com/v1/orders": () => [401, { error: { description: "Authentication failed" } }] });
    const res = await settingsPatch(req("/api/settings/razorpay", { method: "PATCH", body: JSON.stringify({ keyId: "rzp_live_NEW1", keySecret: "wrong" }) }));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("the fallback: accepted keys are stored encrypted only, and the response carries no secret", async () => {
    delete process.env.RAZORPAY_OAUTH_CLIENT_SECRET;
    tables.dealerships = [{ id: "d1", razorpay_key_id: null, razorpay_key_secret_encrypted: null }];
    const calls = razorpay({ "https://api.razorpay.com/v1/orders": () => [200, { items: [] }] });
    const res = await settingsPatch(req("/api/settings/razorpay", { method: "PATCH", body: JSON.stringify({ keyId: " rzp_live_NEW1 ", keySecret: " fresh_SECRET " }) }));
    const text = await res.text();

    expect(JSON.parse(text)).toEqual({ connected: true, method: "keys" });
    expect(text).not.toContain("fresh_SECRET");
    expect(Buffer.from(calls[0].auth!.replace("Basic ", ""), "base64").toString()).toBe("rzp_live_NEW1:fresh_SECRET");
    expect(JSON.stringify(writes[0].values)).not.toContain("fresh_SECRET");
    expect(razorpaySecret(tables.dealerships[0])).toBe("fresh_SECRET");
    expect(tables.dealerships[0].razorpay_key_id).toBe("rzp_live_NEW1");
  });

  it("disconnecting revokes Hawlai's access at Razorpay, then clears every stored credential", async () => {
    tables.dealerships = [oauthRow()];
    const calls = razorpay({ "https://auth.razorpay.com/revoke": () => [200, { message: "Token Revoked" }] });
    const body = await (await disconnect()).json();

    expect(body).toEqual({ connected: false, revokedAtRazorpay: true });
    expect(calls[0].body).toEqual({ client_id: "partner_client_1", client_secret: CLIENT_SECRET, token_type_hint: "access_token", token: TOKENS.access_token });
    const row = tables.dealerships[0];
    for (const [k, v] of Object.entries(row)) if (k !== "id") expect(v, k).toBeNull();
  });

  it("disconnecting pasted keys before migration 178 only names columns that exist", async () => {
    const calls = razorpay({});
    const body = await (await disconnect()).json();
    expect(body).toEqual({ connected: false, revokedAtRazorpay: null });
    expect(calls).toHaveLength(0);
    expect(writes[0].values).toEqual({ razorpay_key_id: null, razorpay_key_secret_encrypted: null });
  });
});
