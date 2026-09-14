// Marketing emails go out as a visual email, not a letter.
//
// THE REQUEST (2026-09-14): every email was plain text — five or six
// paragraphs with the call to action as a bare link. A real marketing
// email needs the brand at the top, the product's photo, a short
// scannable message, one bold button, and brand colours.
//
// What must be RIGHT comes from code, not the model: the button's link
// (the real product page or storefront — a promo once linked to a domain
// that doesn't exist), the photo (the product's own), the colours and
// logo (the brand kit), and the length.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; row: Row }[];

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, not: () => api, is: () => api, in: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      insert: (row: Row) => (writes.push({ table, op: "insert", row }), api),
      update: (row: Row) => (writes.push({ table, op: "update", row }), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const PHOTO = "https://cdn.example/lavender.jpg";
const STORE_URL = "https://hawlai.online/site/candle-by-qaaf";
const PRODUCT_URL = `${STORE_URL}/products/p1`;

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow", welcome_email_auto_enabled: true, gmail_email: "shop@gmail.com" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [
    { id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [PHOTO], is_active: true },
    { id: "p2", name: "Mogra Nights candle", price: 650, description: null, images: [], is_active: true },
  ],
  discount_codes: [],
  orders: [],
  brand_kits: [{ kit: { colors: [{ name: "Cream", hex: "#F5EBDD", role: "primary" }, { name: "Clay", hex: "#B06A4F", role: "accent" }] }, logo_url: "https://cdn.example/logo.png" }],
  brand_profiles: [],
});

function anthropic(reply: unknown) {
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: any) => {
      prompts.push(JSON.parse(init.body).messages[0].content);
      return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ text: JSON.stringify(reply) }] }) };
    })
  );
  return prompts;
}

const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" as const }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => sendDealerEmail(...a) }));
const gmailSend = vi.fn(async (..._a: any[]) => ({ success: true }));
vi.mock("@/lib/agents/gmailAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/gmailAgent")>()),
  sendEmail: (...a: any[]) => gmailSend(...a),
}));

import { renderEmailHtml, renderEmailText, pickAccent, textOn, DEFAULT_ACCENT, type EmailDesign } from "@/lib/email/template";
import { composeMarketingEmail, clip, LIMITS } from "@/lib/email/composeEmail";
import { buildMimeMessage } from "@/lib/agents/gmailAgent";
import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { runWorkflows } from "@/lib/automation/workflowEngine";

const PROMO = {
  subject: "Lavender candle is back",
  previewText: "Hand-poured, ₹550",
  headline: "Slow evenings are back",
  intro: "Our Lavender candle is hand-poured in small batches and ready to ship.",
  bullets: ["Hand-poured soy wax", "₹550"],
  ctaLabel: "Shop Lavender",
  product: "Lavender candle",
  body: "Our Lavender candle is back. Hand-poured soy wax, ₹550.",
};

beforeEach(() => {
  tables = STORE();
  writes = [];
  sendDealerEmail.mockClear();
  gmailSend.mockClear();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the live case: a Lavender candle promo", () => {
  it("has the logo, the product's own photo, a short message, and a bold button to the real product page", async () => {
    const email = composeMarketingEmail(PROMO, await gatherBusinessFacts(db(), "d1"));
    const d = email.design;

    expect(d.brandName).toBe("Candle by Qaaf");
    expect(d.logoUrl).toBe("https://cdn.example/logo.png");
    expect(d.image).toEqual({ url: PHOTO, alt: "Lavender candle" });
    expect(d.cta).toEqual({ label: "Shop Lavender", url: PRODUCT_URL });
    expect(d.headline).toBe("Slow evenings are back");
    expect(d.paragraphs).toEqual(["Our Lavender candle is hand-poured in small batches and ready to ship."]);
    expect(d.bullets).toEqual(["Hand-poured soy wax", "₹550"]);

    expect(email.html).toContain(`<img src="${PHOTO}" alt="Lavender candle"`);
    expect(email.html).toContain(`<a href="${PRODUCT_URL}" target="_blank"`);
    expect(email.html).toContain(">Shop Lavender</a>");
    expect(email.subject).toBe("Lavender candle is back");
  });

  it("uses the brand kit's colour — skipping a primary too pale to see on white", async () => {
    const email = composeMarketingEmail(PROMO, await gatherBusinessFacts(db(), "d1"));
    expect(email.design.accent).toBe("#b06a4f");
    expect(email.html).toContain('bgcolor="#b06a4f"');
    expect(email.html).toContain("border-top:4px solid #b06a4f");
  });

  it("the plain-text part carries the same message, link and footer", async () => {
    const email = composeMarketingEmail(PROMO, await gatherBusinessFacts(db(), "d1"));
    expect(email.text).toBe(
      [
        "Slow evenings are back",
        "Our Lavender candle is hand-poured in small batches and ready to ship.",
        "• Hand-poured soy wax\n• ₹550",
        `Shop Lavender: ${PRODUCT_URL}`,
        "—",
        "You're receiving this because you shared your email with Candle by Qaaf.",
        "Candle by Qaaf",
      ].join("\n\n")
    );
  });
});

describe("what comes from code, not the model", () => {
  it("an email about the business in general links to the store and shows its best-photographed product", async () => {
    const email = composeMarketingEmail({ subject: "Welcome", headline: "Welcome to Candle by Qaaf", intro: "Thanks for stopping by." }, await gatherBusinessFacts(db(), "d1"));
    expect(email.design.cta).toEqual({ label: "Visit the store", url: STORE_URL });
    expect(email.design.image).toEqual({ url: PHOTO, alt: "Lavender candle" });
  });

  it("a product with no photo links to its own page and shows no picture — never a different product's", async () => {
    const email = composeMarketingEmail({ subject: "Mogra Nights", headline: "Meet Mogra Nights", product: "Mogra Nights candle" }, await gatherBusinessFacts(db(), "d1"));
    expect(email.design.cta?.url).toBe(`${STORE_URL}/products/p2`);
    expect(email.design.cta?.label).toBe("Shop Mogra Nights candle");
    expect(email.design.image).toBeNull();
    expect(email.html).not.toContain(PHOTO);
  });

  it("a product named only in the words is still found, and its own page used", async () => {
    const email = composeMarketingEmail({ subject: "Meet the Lavender candle", headline: "Slow evenings" }, await gatherBusinessFacts(db(), "d1"));
    expect(email.design.cta?.url).toBe(PRODUCT_URL);
  });

  it("with no published store there is no button at all — never a made-up link", async () => {
    tables.websites[0].published = false;
    const email = composeMarketingEmail(PROMO, await gatherBusinessFacts(db(), "d1"));
    expect(email.design.cta).toBeNull();
    expect(email.html).not.toContain("<a href=");
  });

  it("long copy is cut to scannable: headline, two paragraphs, three bullets, a short button", async () => {
    const long = "word ".repeat(200);
    const email = composeMarketingEmail(
      { subject: "s", headline: long, body: `one ${long}\n\ntwo\n\nthree\n\nfour`, bullets: ["a", "b", "c", "d", "e"], ctaLabel: long },
      await gatherBusinessFacts(db(), "d1")
    );
    expect(email.design.headline.length).toBeLessThanOrEqual(LIMITS.headline);
    expect(email.design.paragraphs).toHaveLength(2);
    expect(email.design.paragraphs[0].length).toBeLessThanOrEqual(LIMITS.paragraph);
    expect(email.design.paragraphs[1]).toBe("two");
    expect(email.design.bullets).toEqual(["a", "b", "c"]);
    expect(email.design.cta!.label.length).toBeLessThanOrEqual(LIMITS.ctaLabel);
  });

  it("clip cuts at a word and marks the cut; short text is untouched", () => {
    expect(clip("Slow evenings are back", 70)).toBe("Slow evenings are back");
    expect(clip("Slow evenings are back for the whole festive season", 30)).toBe("Slow evenings are back for…");
  });
});

describe("the HTML itself", () => {
  const base = (over: Partial<EmailDesign> = {}): EmailDesign => ({
    brandName: "Candle by Qaaf", logoUrl: null, accent: "#1f2937", preheader: "p", headline: "h", paragraphs: [], bullets: [], sections: [], image: null,
    cta: { label: "Shop", url: STORE_URL },
    footer: { reason: "r", address: null, unsubscribeUrl: null },
    ...over,
  });

  it("everything written into it is escaped", () => {
    const html = renderEmailHtml(base({ headline: '<script>alert("x")</script>', paragraphs: ["Tom & Jerry's <b>"] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; Jerry&#39;s &lt;b&gt;");
  });

  it("only https links and images are used", () => {
    const html = renderEmailHtml(base({ cta: { label: "Shop", url: "javascript:alert(1)" }, image: { url: "http://cdn.example/x.jpg", alt: "x" }, logoUrl: "data:image/png;base64,AAA" }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("http://cdn.example");
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("<a href=");
  });

  it("is built for inboxes: tables, inline styles, a 600px column, no <style> block or web fonts", () => {
    const html = renderEmailHtml(base());
    expect(html).toContain('role="presentation"');
    expect(html).toContain("max-width:600px");
    expect(html).not.toMatch(/<style|<link|@import|fonts\.googleapis/);
  });

  it("the button's text is white on a dark brand colour and near-black on a light one", () => {
    expect(textOn("#1f2937")).toBe("#ffffff");
    expect(textOn("#f5c518")).toBe("#111111");
    expect(renderEmailHtml(base({ accent: "#f5c518" }))).toContain("color:#111111;text-decoration:none");
  });

  it("brand colour choice: primary first, pale colours skipped, invalid ignored, a safe default otherwise", () => {
    expect(pickAccent([{ hex: "#2E7D32", role: "accent" }, { hex: "#8E24AA", role: "primary" }])).toBe("#8e24aa");
    expect(pickAccent([{ hex: "#FFF8E7", role: "primary" }, { hex: "#2E7D32", role: "accent" }])).toBe("#2e7d32");
    expect(pickAccent([{ hex: "not-a-colour", role: "primary" }])).toBe(DEFAULT_ACCENT);
    expect(pickAccent([])).toBe(DEFAULT_ACCENT);
  });

  it("the footer shows the address and an unsubscribe link when they're given", () => {
    const d = base({ footer: { reason: "Because you signed up.", address: "12 Hazratganj, Lucknow", unsubscribeUrl: "https://hawlai.online/u/abc" } });
    expect(renderEmailHtml(d)).toContain("Candle by Qaaf · 12 Hazratganj, Lucknow");
    expect(renderEmailHtml(d)).toContain('<a href="https://hawlai.online/u/abc" target="_blank"');
    expect(renderEmailText(d)).toContain("Unsubscribe: https://hawlai.online/u/abc");
  });
});

describe("the generator returns the finished email beside the draft", () => {
  it("a promotional email comes back composed from the checked words, the real link and the photo", async () => {
    const prompts = anthropic({ ...PROMO, intro: "Loved by 500+ homes across India. Our Lavender candle is back." });
    const r = await generateEmailContent("promotional", "candle_by_qaaf", "Home fragrance", "restock", null, undefined, undefined, await gatherBusinessFacts(db(), "d1"));

    expect(prompts[0]).toContain("Never put a link or web address in any field — Hawlai adds the button link.");
    expect(prompts[0]).toContain("ctaLabel (2–4 words for the button)");
    expect(r.email?.html).toContain(PRODUCT_URL);
    expect(r.email?.html).toContain(PHOTO);
    // The claims guard ran first — the invented count never reaches the email.
    expect(r.email?.html).not.toContain("500+");
    // Not stored inside the saved draft.
    expect(JSON.stringify(r.output)).not.toContain("<html");
  });

  it("tasks that aren't a single customer email get no composed email", async () => {
    anthropic({ emails: [{ step: 1, subject: "a", body: "b" }] });
    const r = await generateEmailContent("sales_sequence", "candle_by_qaaf", "Home fragrance", "", null, undefined, undefined, await gatherBusinessFacts(db(), "d1"));
    expect(r.email).toBeUndefined();
  });
});

describe("Gmail sends both versions", () => {
  const decode = (mime: string, type: string) => {
    const part = mime.split(/--hawlai_[^\r\n]+/).find((p) => p.includes(`Content-Type: ${type}`))!;
    return Buffer.from(part.split("\r\n\r\n")[1].replace(/\r\n/g, "").trim(), "base64").toString("utf-8");
  };

  it("as multipart/alternative: plain text first, HTML second, both intact", () => {
    const html = `<p>${"नमस्ते ".repeat(40)}</p>`;
    const mime = buildMimeMessage({ from: "Candle by Qaaf <shop@gmail.com>", to: "a@example.com", subject: "Diwali ✨", text: "Hello — ₹550", html });
    expect(mime).toMatch(/Content-Type: multipart\/alternative; boundary="hawlai_/);
    expect(mime.indexOf("text/plain")).toBeLessThan(mime.indexOf("text/html"));
    expect(decode(mime, "text/plain")).toBe("Hello — ₹550");
    expect(decode(mime, "text/html")).toBe(html);
    expect(mime.split("\r\n").every((l) => l.length <= 998)).toBe(true);
  });

  it("without HTML, one plain-text part", () => {
    const mime = buildMimeMessage({ from: "x", to: "y", subject: "s", text: "Just text" });
    expect(mime).not.toContain("multipart");
    expect(Buffer.from(mime.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf-8")).toBe("Just text");
  });
});

describe("automation sends the visual email", () => {
  it("a welcome email goes out as HTML with its plain-text part", async () => {
    tables.leads = [{ id: "L1", name: "Asha", email: "asha@example.com", dealership_id: "d1", dnd_opt_out: false }];
    anthropic({ ...PROMO, subject: "Welcome, Asha", headline: "Welcome, Asha", product: "" });
    const r = await runEmailAutomation(db(), "d1");

    expect(r.welcomesSent).toBe(1);
    const [, , to, subject, text, opts] = sendDealerEmail.mock.calls[0] as any[];
    expect([to, subject]).toEqual(["asha@example.com", "Welcome, Asha"]);
    expect(text).toContain("Welcome, Asha");
    expect(opts.html).toContain(`<h1 style=`);
    expect(opts.html).toContain(STORE_URL);
  });

  it("a generated workflow step goes out through Gmail as HTML; an owner's custom step goes as written", async () => {
    tables.leads = [{ id: "L1", name: "Asha", email: "asha@example.com", created_at: "2026-01-01T00:00:00Z", dealership_id: "d1", dnd_opt_out: false }];
    tables.workflows = [
      {
        id: "wf1", dealership_id: "d1", enabled: true, trigger_type: "new_lead", name: "Welcome flow",
        workflow_steps: [
          { id: "s1", step_order: 0, delay_days: 0, action_type: "email", email_task_type: "promotional" },
          { id: "s2", step_order: 1, delay_days: 0, action_type: "email", email_task_type: "custom", custom_subject: "A note", custom_body: "Hi Asha, just me." },
        ],
      },
    ];
    tables.workflow_step_runs = [];
    anthropic(PROMO);
    await runWorkflows(db(), "d1");

    const [first, second] = gmailSend.mock.calls as any[][];
    expect(first[3]).toBe("Lavender candle is back");
    expect(first[5].html).toContain(PRODUCT_URL);
    expect(second.slice(3, 5)).toEqual(["A note", "Hi Asha, just me."]);
    expect(second[5]).toEqual({ html: null });
  });
});
