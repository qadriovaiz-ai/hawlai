// "✅ Updated your live homepage" had nothing behind it.
//
// Chat's copy-edit card posted the new sections to the page endpoint and,
// on a 200, said the live homepage was updated. A written row is not a
// changed page: the site may be unpublished, the response may be cached,
// the page may be a different one. The meta flow was corrected for
// exactly this on 2026-09-28 — "we wrote the row" stopped counting as
// proof — and this is the same claim on the body copy.
//
// So these tests run the REAL PATCH route with a fake page endpoint and a
// fake internet, and assert on what the owner is told.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";

const OLD = "Candles poured by hand in Shahjahanpur";
const NEW = "Hand-poured soy candles, made in Shahjahanpur";

const sections = (headline: string) => [
  { id: "s1", type: "section", props: {}, children: [{ id: "h1", type: "heading", props: { text: headline } }] },
];

let published = true;
let siteSlug: string | null = "candle-by-qaaf";
const written: any[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      let selected = "";
      const chain: any = {
        select(cols?: string) {
          selected = cols ?? "";
          return chain;
        },
        update(values: any) {
          written.push(values);
          return chain;
        },
        eq: () => chain,
        async single() {
          if (table === "profiles") return { data: { dealership_id: "d1" } };
          // The row returned by the update's .select("updated_at")
          return { data: { updated_at: "2026-10-03T00:00:00Z" }, error: null };
        },
        async maybeSingle() {
          if (selected.includes("websites!inner(slug")) {
            return { data: siteSlug === null ? null : { slug: "home", websites: { slug: siteSlug, published } } };
          }
          if (selected.includes("websites!inner(dealership_id)")) {
            return { data: { id: "p1", websites: { dealership_id: "d1" } } };
          }
          if (selected.includes("sections")) return { data: { sections: sections(OLD) } };
          return { data: null };
        },
      };
      return chain;
    },
  }),
}));

/** A homepage as Next.js actually serves it, headline included. */
function servedPage(headline: string): string {
  return `<!DOCTYPE html><html><head><title>Candle by Qaaf</title></head><body>
    <h1 class="text-4xl">${headline}</h1>
    <p>Soy wax<!-- -->, hand-poured.</p>
    <script>self.__next_f.push([1,"{\\"text\\":\\"${NEW}\\"}"])</script>
  </body></html>`;
}

let serve: () => Promise<any>;

beforeEach(() => {
  written.length = 0;
  published = true;
  siteSlug = "candle-by-qaaf";
  process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";
  vi.stubGlobal("fetch", async () => serve());
});
afterEach(() => vi.unstubAllGlobals());

async function patch(body: any) {
  const { PATCH } = await import("@/app/api/website-builder/pages/[id]/route");
  const response = await PATCH(
    new Request("https://hawlai.online/api/website-builder/pages/p1", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1" }) }
  );
  return { status: response.status, body: await response.json() };
}

describe("the live page is read back before anyone says it's live", () => {
  it("REFUSES to call it live when the page is still serving the old words", async () => {
    // The bug, reproduced: the write succeeds, the page has not changed.
    serve = async () => ({ ok: true, status: 200, text: async () => servedPage(OLD) });

    const { body } = await patch({ sections: sections(NEW), verifyText: [NEW] });

    expect(body.success).toBe(true);
    expect(body.liveCheck.verified).toBe(false);
    expect(body.liveCheck.message).toMatch(/^Saved, but not live yet/);
    // And it names the line that isn't there, so the owner can look.
    expect(body.liveCheck.message).toContain(NEW);
    expect(body.liveCheck.message).toContain("https://hawlai.online/site/candle-by-qaaf");
    expect(body.liveCheck.missing).toEqual([NEW]);
  });

  it("confirms live only when the page is serving the new words", async () => {
    serve = async () => ({ ok: true, status: 200, text: async () => servedPage(NEW) });

    const { body } = await patch({ sections: sections(NEW), verifyText: [NEW] });

    expect(body.liveCheck.verified).toBe(true);
    expect(body.liveCheck.message).toMatch(/^Live — I read https:\/\/hawlai\.online\/site\/candle-by-qaaf back/);
    expect(body.liveCheck.missing).toEqual([]);
  });

  it("is not fooled by the text sitting in Next's own script payload", async () => {
    // THE TRAP THIS CHECK EXISTS FOR. Next embeds every block's props as
    // JSON in a <script> tag, so the new headline is in the HTML of a
    // page that is displaying the old one. A raw substring search would
    // confirm "live" for precisely the case above — note servedPage(OLD)
    // still carries NEW inside __next_f.
    serve = async () => ({ ok: true, status: 200, text: async () => servedPage(OLD) });
    const { body } = await patch({ sections: sections(NEW), verifyText: [NEW] });
    expect(body.liveCheck.verified).toBe(false);
  });

  it("reports a page it could not read as unverified, never as a failed save", async () => {
    serve = async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    };
    const { body } = await patch({ sections: sections(NEW), verifyText: [NEW] });
    expect(body.success).toBe(true);
    expect(written.length).toBe(1);
    expect(body.liveCheck.verified).toBe(false);
    expect(body.liveCheck.message).toMatch(/Saved\. The live page didn't answer in time/);
    expect(body.liveCheck.message).not.toMatch(/not saved|couldn't save/i);
  });

  it("says plainly that an unpublished site has nothing public to check", async () => {
    published = false;
    let fetched = false;
    serve = async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => servedPage(NEW) };
    };
    const { body } = await patch({ sections: sections(NEW), verifyText: [NEW] });
    expect(body.liveCheck.verified).toBe(false);
    expect(body.liveCheck.message).toMatch(/isn't published yet/);
    // No point fetching a page that cannot exist.
    expect(fetched).toBe(false);
  });

  it("leaves Website Builder's own saves alone — no verifyText, no outbound request", async () => {
    let fetched = false;
    serve = async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => servedPage(NEW) };
    };
    const { body } = await patch({ sections: sections(NEW) });
    expect(body.success).toBe(true);
    expect(body.liveCheck).toBeUndefined();
    expect(fetched).toBe(false);
  });

  it("takes the public address from the page, not from the caller", async () => {
    // A client-supplied slug could be pointed at a page that does have
    // the text. The route reads it off the row instead.
    const route = readFileSync("src/app/api/website-builder/pages/[id]/route.ts", "utf8");
    expect(route).toMatch(/async function publicAddressOf/);
    expect(route).not.toMatch(/body\.(slug|siteSlug|pageSlug|verifyUrl)/);
  });
});

describe("the card says what the read-back found, not what it hoped", () => {
  it("prefers the endpoint's sentence over its own `done`", () => {
    const chat = readFileSync("src/components/chat/MasterChatPage.tsx", "utf8");
    expect(chat).toMatch(/const liveCheck = action === "publish" \? \(data\?\.liveCheck/);
    expect(chat).toMatch(/setNote\(liveCheck\.verified \? `\\u2705 \$\{liveCheck\.message\}` : liveCheck\.message\)/);
    // Amber, not green and not red: saved is not an error.
    expect(chat).toMatch(/savedNotLive \? "text-amber-600" : "text-emerald-600"/);
  });

  it("no longer asserts the homepage is live from a 200 alone", () => {
    const actions = readFileSync("src/lib/chat/publishActions.ts", "utf8");
    // In the code, not in the comment that records why it went.
    expect(actions).not.toMatch(/done: opts\.published \? "✅ Updated your live homepage"/);
    expect(actions).toMatch(/I haven't confirmed the live page is serving it/);
  });

  it("sends the approved wording so there is something to check", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/newText: \(result\.changed \?\? \[\]\)\.map\(\(c: any\) => String\(c\.to \?\? ""\)\)/);
  });
});
