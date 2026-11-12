// Asking Meta to send the webhooks — the half of the auto-reply bug
// that was a missing API call.
//
// Nothing in this codebase had ever subscribed a Facebook Page or an
// Instagram account to the app. Meta does not deliver `messages` or
// `feed` for an unsubscribed Page, so the handler's gates were never
// reached and `auto_reply_log` stayed empty for months.
//
// These calls cannot be exercised live from here — there is no Meta app
// and no real business — so every assertion below is about the request
// being RIGHT ON THE FIRST TRY in production: the host, the auth style,
// the fields, and what counts as success.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  subscribeFacebookPage,
  subscribeInstagramAccount,
  subscribeAndRecord,
  FB_WEBHOOK_FIELDS,
  IG_WEBHOOK_FIELDS,
} from "@/lib/webhooks/subscribeWebhooks";
import { code, sql, sourceWithComments } from "./helpers/source";

type Call = { url: string; init: any };
let calls: Call[];
let updates: Record<string, any>[];

function meta(body: any, ok = true, status = 200) {
  return vi.fn(async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    return { ok, status, json: async () => body };
  }) as any;
}

function db() {
  return {
    from: () => ({
      update: (row: Record<string, any>) => {
        updates.push(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  } as any;
}

beforeEach(() => {
  calls = [];
  updates = [];
});

describe("1. THE FACEBOOK REQUEST", () => {
  it("POSTS TO THE PAGE'S OWN subscribed_apps EDGE", async () => {
    // A Page is installed on an app per Page. Configuring the webhook
    // product in the Meta dashboard is necessary and NOT sufficient,
    // and this second step is the one that was missing.
    const r = await subscribeFacebookPage("page-1", "tok-1", meta({ success: true }));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toContain("https://graph.facebook.com/");
    expect(calls[0].url).toContain("/page-1/subscribed_apps");
  });

  it("SUBSCRIBES messages AND feed, and nothing else", async () => {
    await subscribeFacebookPage("page-1", "tok-1", meta({ success: true }));
    const fields = new URL(calls[0].url).searchParams.get("subscribed_fields");
    expect(fields).toBe("messages,feed");
  });

  it("THE COMMENT FIELD IS `feed`, WHICH IS WHAT THE HANDLER READS", async () => {
    // THE LOAD-BEARING CROSS-CHECK. Subscribing to a field called
    // "comments" on a Facebook Page succeeds and then delivers nothing
    // the handler recognises: handleAutoReplyEntry matches
    // change.field === "feed". These are not two names for one thing.
    expect([...FB_WEBHOOK_FIELDS]).toContain("feed");
    expect([...FB_WEBHOOK_FIELDS]).not.toContain("comments");
    const handler = code("src/lib/webhooks/autoReplyHandler.ts");
    expect(handler).toMatch(/change\?\.field !== "feed"/);
  });

  it("the token goes in the query, as everywhere else on graph.facebook.com", async () => {
    await subscribeFacebookPage("page-1", "tok-1", meta({ success: true }));
    expect(new URL(calls[0].url).searchParams.get("access_token")).toBe("tok-1");
  });

  it("the page id is escaped into the path", async () => {
    await subscribeFacebookPage("a/b", "tok-1", meta({ success: true }));
    expect(calls[0].url).toContain("a%2Fb");
  });
});

describe("2. THE INSTAGRAM REQUEST IS A DIFFERENT API, not the same one renamed", () => {
  it("POSTS TO graph.instagram.com WITH A BEARER HEADER", async () => {
    const r = await subscribeInstagramAccount("ig-1", "tok-ig", meta({ success: true }));
    expect(r.ok).toBe(true);
    expect(calls[0].url).toContain("https://graph.instagram.com/");
    expect(calls[0].url).toContain("/ig-1/subscribed_apps");
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok-ig");
  });

  it("AND THE TOKEN IS NOT IN THE URL", async () => {
    await subscribeInstagramAccount("ig-1", "tok-ig", meta({ success: true }));
    expect(calls[0].url).not.toContain("tok-ig");
  });

  it("SUBSCRIBES messages AND comments — `comments` HERE, NOT `feed`", async () => {
    // Instagram comments arrive on their own field. Asking for `feed`
    // here subscribes successfully and delivers nothing.
    await subscribeInstagramAccount("ig-1", "tok-ig", meta({ success: true }));
    expect(new URL(calls[0].url).searchParams.get("subscribed_fields")).toBe("messages,comments");
    expect([...IG_WEBHOOK_FIELDS]).toContain("comments");
    expect([...IG_WEBHOOK_FIELDS]).not.toContain("feed");
  });

  it("the two field lists are deliberately different", () => {
    expect([...FB_WEBHOOK_FIELDS]).not.toEqual([...IG_WEBHOOK_FIELDS]);
  });
});

describe("3. WHAT COUNTS AS SUCCESS", () => {
  it("A 200 WITHOUT success:true IS A FAILURE", async () => {
    // Meta answers { success: true }. Anything else is not a
    // subscription, however encouraging the status code was — and
    // recording it as one would put a timestamp on a connection that
    // still receives nothing.
    const r = await subscribeFacebookPage("page-1", "tok-1", meta({}));
    expect(r.ok).toBe(false);
    const r2 = await subscribeFacebookPage("page-1", "tok-1", meta({ success: false }));
    expect(r2.ok).toBe(false);
    const r3 = await subscribeFacebookPage("page-1", "tok-1", meta({ success: "true" }));
    expect(r3.ok).toBe(false);
  });

  it("A NON-OK RESPONSE CARRIES META'S OWN REASON", async () => {
    const r = await subscribeFacebookPage(
      "page-1", "tok-1",
      meta({ error: { message: "(#200) Requires pages_manage_metadata" } }, false, 403)
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("pages_manage_metadata");
  });

  it("and a response with no reason still says something useful", async () => {
    const r = await subscribeFacebookPage("page-1", "tok-1", meta(null, false, 500));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("500");
  });

  it("MISSING IDS AND TOKENS MAKE NO CALL AT ALL", async () => {
    const fetcher = meta({ success: true });
    for (const [id, token] of [[null, "t"], ["p", null], ["", "t"], ["  ", "t"]] as any[]) {
      const r = await subscribeFacebookPage(id, token, fetcher);
      expect(r.ok).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("NEVER THROWS, so a connect flow cannot break on it", async () => {
    const thrower = (async () => {
      throw new Error("network down");
    }) as any;
    await expect(subscribeFacebookPage("p", "t", thrower)).resolves.toMatchObject({ ok: false });
    await expect(subscribeInstagramAccount("i", "t", thrower)).resolves.toMatchObject({ ok: false });
  });

  it("A 200 OF GARBAGE READS AS 'did not confirm', not as 'could not reach'", async () => {
    // Mutation M19 removed the `.catch(() => null)` on res.json() and
    // survived: the outer try/catch still returns ok:false, so the
    // OUTCOME is identical. What the catch is actually for is the
    // REASON — "Meta answered but did not confirm" and "we could not
    // reach Meta" send the owner to two different places. Asserting
    // only ok:false left the guard untested.
    const badJson = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } })) as any;
    const r = await subscribeFacebookPage("p", "t", badJson);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/did not confirm/i);
      expect(r.reason).not.toMatch(/could not reach/i);
    }
  });
});

describe("4. THE RECORD — A TIMESTAMP AND AN ERROR, NEVER BOTH", () => {
  it("SUCCESS STAMPS THE TIME AND CLEARS THE ERROR", async () => {
    const at = new Date("2026-11-12T10:00:00Z");
    await subscribeAndRecord(db(), "d1", "facebook", { id: "p", token: "t" }, { fetcher: meta({ success: true }), now: at });
    expect(updates).toHaveLength(1);
    expect(updates[0].fb_webhook_subscribed_at).toBe(at.toISOString());
    expect(updates[0].fb_webhook_error).toBeNull();
  });

  it("FAILURE NULLS THE TIMESTAMP AND WRITES THE REASON", async () => {
    // A stale "subscribed at" beside a live error would read as "it
    // worked once", which is the exact ambiguity that made this bug
    // take eight days to diagnose.
    await subscribeAndRecord(db(), "d1", "facebook", { id: "p", token: "t" }, {
      fetcher: meta({ error: { message: "Requires pages_manage_metadata" } }, false, 403),
    });
    expect(updates[0].fb_webhook_subscribed_at).toBeNull();
    expect(updates[0].fb_webhook_error).toContain("pages_manage_metadata");
  });

  it("INSTAGRAM WRITES ITS OWN PAIR, not Facebook's", async () => {
    await subscribeAndRecord(db(), "d1", "instagram", { id: "i", token: "t" }, { fetcher: meta({ success: true }) });
    expect(updates[0]).toHaveProperty("ig_webhook_subscribed_at");
    expect(updates[0]).not.toHaveProperty("fb_webhook_subscribed_at");
  });

  it("A FAILING WRITE DOES NOT THROW", async () => {
    const broken = { from: () => ({ update: () => ({ eq: async () => { throw new Error("no column"); } }) }) } as any;
    await expect(
      subscribeAndRecord(broken, "d1", "facebook", { id: "p", token: "t" }, { fetcher: meta({ success: true }) })
    ).resolves.toMatchObject({ ok: true });
  });

  it("AND THE RESULT IS HANDED BACK, FAILURE INCLUDED", async () => {
    // Mutation M24 replaced the return with a hardcoded { ok: true }
    // and survived, because this only ever checked the success path —
    // so a caller would have been told the subscription worked when it
    // had not, which is the whole fault this feature exists to end.
    const good = await subscribeAndRecord(db(), "d1", "facebook", { id: "p", token: "t" }, { fetcher: meta({ success: true }) });
    expect(good.ok).toBe(true);

    const bad = await subscribeAndRecord(db(), "d1", "facebook", { id: "p", token: "t" }, {
      fetcher: meta({ error: { message: "Requires pages_manage_metadata" } }, false, 403),
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("pages_manage_metadata");
  });
});

describe("5. THE THREE SCOPES THAT WERE MISSING", () => {
  const connect = () => code("src/app/api/auth/facebook/connect/route.ts");

  it("pages_messaging — WITHOUT IT NO DM REPLY CAN BE SENT", () => {
    expect(connect()).toMatch(/"pages_messaging"/);
  });

  it("pages_manage_metadata — WITHOUT IT THE WEBHOOK NEVER ARRIVES", () => {
    // This is the one that makes the subscription above possible at
    // all, and therefore the one that made the whole feature dead.
    expect(connect()).toMatch(/"pages_manage_metadata"/);
  });

  it("pages_manage_engagement — WITHOUT IT NO COMMENT REPLY CAN BE POSTED", () => {
    expect(connect()).toMatch(/"pages_manage_engagement"/);
  });

  it("the ones that were already there are still there", () => {
    // Removing an ads scope to make room would break ad launching,
    // which is a different department entirely.
    const src = connect();
    for (const scope of [
      "pages_show_list", "pages_read_engagement", "pages_manage_ads",
      "pages_manage_posts", "ads_management", "ads_read", "leads_retrieval",
    ]) {
      expect(src, scope).toMatch(new RegExp(`"${scope}"`));
    }
  });

  it("AND THE RECONNECT REQUIREMENT IS WRITTEN DOWN", () => {
    // A token is issued with the permissions asked for when it was
    // granted. No server-side change can give an existing token a new
    // one, so the owner has to reconnect — and a future reader must not
    // have to work that out again.
    const src = sourceWithComments("src/app/api/auth/facebook/connect/route.ts");
    expect(src).toMatch(/RECONNECT/);
    expect(src).toMatch(/APP REVIEW/);
  });

  it("Instagram already asked for its own two, so it is not blocked on this", () => {
    const start = code("src/app/api/auth/instagram/start/route.ts");
    expect(start).toMatch(/instagram_business_manage_messages/);
    expect(start).toMatch(/instagram_business_manage_comments/);
  });
});

describe("6. BOTH CONNECTION FLOWS ACTUALLY SUBSCRIBE", () => {
  it("THE FACEBOOK FINALIZE ROUTE CALLS IT", () => {
    const src = code("src/app/api/auth/facebook/finalize/route.ts");
    expect(src).toMatch(/subscribeAndRecord\(serviceClient, dealershipId, "facebook"/);
  });

  it("AFTER THE ROW IS WRITTEN, so it subscribes with the stored token", () => {
    // Before the update, a failure here would leave a connection
    // half-saved.
    // THE CALL, NOT THE IMPORT. The first version compared against
    // indexOf("subscribeAndRecord"), which lands on the import at the
    // top of the file and inverted the whole assertion — the
    // satisfied-by-any-occurrence fault this project keeps finding.
    const src = code("src/app/api/auth/facebook/finalize/route.ts");
    const call = src.indexOf('subscribeAndRecord(serviceClient');
    expect(call).toBeGreaterThan(0);
    expect(src.indexOf(".update(update)")).toBeLessThan(call);
  });

  it("AND DOES NOT FAIL THE CONNECTION WHEN IT FAILS", () => {
    // The connection itself succeeded. A subscription failure is
    // reported, not fatal.
    const src = code("src/app/api/auth/facebook/finalize/route.ts");
    const after = src.slice(src.indexOf('subscribeAndRecord(serviceClient'));
    expect(after.length).toBeGreaterThan(50);
    expect(after).not.toMatch(/status: 500/);
    expect(after).toMatch(/webhooksSubscribed/);
  });

  it("THE INSTAGRAM CALLBACK CALLS IT TOO", () => {
    const src = code("src/app/api/auth/instagram/callback/route.ts");
    expect(src).toMatch(/subscribeAndRecord\(service, dealershipId, "instagram"/);
    expect(src).toMatch(/instagram_webhook_error/);
  });

  it("and the owner is told either way, not left waiting for a DM", () => {
    expect(code("src/app/api/auth/facebook/finalize/route.ts")).toMatch(/webhooksError/);
  });
});

describe("7. THE MIGRATION", () => {
  const migration = () => sql("supabase/migrations/227_webhook_subscription_status.sql");

  it("FOUR NULLABLE COLUMNS, two pairs", () => {
    const m = migration();
    for (const column of [
      "fb_webhook_subscribed_at timestamptz",
      "fb_webhook_error text",
      "ig_webhook_subscribed_at timestamptz",
      "ig_webhook_error text",
    ]) {
      expect(m, column).toContain(column);
    }
    expect(m).not.toMatch(/webhook_subscribed_at timestamptz not null/);
  });

  it("EVERY COLUMN THE CODE WRITES EXISTS IN THE MIGRATION", () => {
    // The failure this prevents: an update naming a column that was
    // never added, which fails at runtime and makes the subscription
    // status silently unrecordable — the same shape of silence this
    // whole fix is about.
    const m = migration();
    const src = code("src/lib/webhooks/subscribeWebhooks.ts");
    const written = (src.match(/"(fb|ig)_webhook_[a-z_]+"/g) ?? []).map((s) => s.replace(/"/g, ""));
    expect(written.length).toBe(4);
    for (const column of written) {
      expect(m, `the code writes ${column}`).toContain(column);
    }
  });

  it("and it says what the owner has to do that is not SQL", () => {
    const withComments = sourceWithComments("supabase/migrations/227_webhook_subscription_status.sql");
    expect(withComments).toMatch(/RECONNECTED/);
    expect(withComments).toMatch(/APP REVIEW/);
  });
});
