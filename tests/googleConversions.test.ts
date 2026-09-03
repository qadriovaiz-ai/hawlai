// A4 — the dealer never types a Google Ads conversion ID or label.
//
// Both were text boxes. The instruction was "Google Ads → Goals →
// Conversions → your purchase action", where you open the tag setup
// and copy two separate fragments out of a block of JavaScript.
//
// The label is the interesting half: it only exists inside the event
// snippet, as `'send_to': 'AW-123456789/AbC-D_efG'`. Parsing that is
// pure string work and gets real tests, which matters more than usual
// here — GOOGLE_ADS_DEVELOPER_TOKEN does not exist in this
// environment, so the network path CANNOT be exercised at all.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseSendTo, mapConversionActions, listConversionActions } from "@/lib/ads/googleConversions";

const SNIPPET = `
<!-- Event snippet for Purchase conversion page -->
<script>
  gtag('event', 'conversion', {
      'send_to': 'AW-123456789/AbC-D_efGhIjKlMn',
      'value': 1.0,
      'currency': 'INR'
  });
</script>
`;

describe("parseSendTo", () => {
  it("splits a real event snippet into id and label", () => {
    expect(parseSendTo(SNIPPET)).toEqual({
      conversionId: "AW-123456789",
      conversionLabel: "AbC-D_efGhIjKlMn",
    });
  });

  it("accepts double quotes and an unquoted key", () => {
    // Google has shipped all three spellings over the years.
    expect(parseSendTo(`gtag('event','conversion',{"send_to":"AW-1/lbl"})`).conversionLabel).toBe("lbl");
    expect(parseSendTo(`gtag('event','conversion',{send_to: 'AW-1/lbl'})`).conversionLabel).toBe("lbl");
  });

  it("returns null label for a send_to with no slash", () => {
    // A GA4-style send_to carries no label. Returning "" would let an
    // empty string be saved over a working label, turning conversion
    // tracking off while the UI still looked configured.
    expect(parseSendTo(`{'send_to': 'AW-123456789'}`)).toEqual({
      conversionId: "AW-123456789",
      conversionLabel: null,
    });
  });

  it("returns nulls rather than throwing on junk", () => {
    for (const input of ["", null, undefined, "<script>nothing here</script>", "send_to"]) {
      expect(parseSendTo(input as any)).toEqual({ conversionId: null, conversionLabel: null });
    }
  });
});

describe("mapConversionActions", () => {
  const row = (name: string, snippets: any[]) => ({
    conversionAction: { resourceName: `customers/1/conversionActions/${name}`, name, category: "PURCHASE", tagSnippets: snippets },
  });

  it("pulls id and label off the first snippet that has both", () => {
    const actions = mapConversionActions([row("Purchase", [{ eventSnippet: SNIPPET }])]);
    expect(actions).toEqual([
      {
        resourceName: "customers/1/conversionActions/Purchase",
        name: "Purchase",
        category: "PURCHASE",
        conversionId: "AW-123456789",
        conversionLabel: "AbC-D_efGhIjKlMn",
      },
    ]);
  });

  it("skips a labelless snippet in favour of a later complete one", () => {
    // tag_snippets is repeated, and not every entry carries a label.
    // Taking the first entry blindly would drop the label and produce
    // an action that records nothing.
    const actions = mapConversionActions([
      row("Purchase", [{ eventSnippet: `{'send_to': 'AW-123456789'}` }, { eventSnippet: SNIPPET }]),
    ]);
    expect(actions[0].conversionLabel).toBe("AbC-D_efGhIjKlMn");
    expect(actions[0].conversionId).toBe("AW-123456789");
  });

  it("keeps the id when no snippet has a label", () => {
    const actions = mapConversionActions([row("Purchase", [{ eventSnippet: `{'send_to': 'AW-99'}` }])]);
    expect(actions[0]).toMatchObject({ conversionId: "AW-99", conversionLabel: null });
  });

  it("survives rows with no snippets, no name, or no action at all", () => {
    const actions = mapConversionActions([
      row("Bare", []),
      { conversionAction: { resourceName: "customers/1/conversionActions/x" } },
      { conversionAction: {} },
      {},
      null,
    ] as any);
    expect(actions.map((a) => a.name)).toEqual(["Bare", "(unnamed)"]);
    expect(actions.every((a) => a.conversionId === null)).toBe(true);
  });

  it("returns an empty list for empty input", () => {
    expect(mapConversionActions(null)).toEqual([]);
    expect(mapConversionActions(undefined)).toEqual([]);
    expect(mapConversionActions([])).toEqual([]);
  });
});

describe("listConversionActions", () => {
  const OLD = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  beforeEach(() => { process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token"; });
  afterEach(() => {
    if (OLD === undefined) delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    else process.env.GOOGLE_ADS_DEVELOPER_TOKEN = OLD;
  });

  it("says so plainly when the developer token is missing", () => {
    // The actual state of this environment, and the reason nothing
    // below the mock has ever run for real.
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    return listConversionActions("123", "tok", fetchImpl).then((result) => {
      expect(result.ok).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it("does not call Google without a linked customer id", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await listConversionActions("", "tok", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the developer token and the GAQL query", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) }) as unknown as typeof fetch;
    await listConversionActions("123", "tok", fetchImpl);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toContain("/customers/123/googleAds:search");
    expect(init.headers["developer-token"]).toBe("dev-token");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body).query).toContain("FROM conversion_action");
  });

  it("surfaces Google's own nested error message", async () => {
    // Google buries the only useful sentence several levels deep; a
    // generic "request failed" would leave the dealer with nothing.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { details: [{ errors: [{ message: "Developer token is not approved" }] }] } }),
    }) as unknown as typeof fetch;
    const result = await listConversionActions("123", "tok", fetchImpl);
    expect(result).toEqual({ ok: false, reason: "Developer token is not approved" });
  });

  it("treats a 200 carrying an error body as a failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { message: "quota exhausted" } }),
    }) as unknown as typeof fetch;
    expect(await listConversionActions("123", "tok", fetchImpl)).toEqual({ ok: false, reason: "quota exhausted" });
  });

  it("reports a thrown network error instead of crashing the route", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ETIMEDOUT")) as unknown as typeof fetch;
    expect(await listConversionActions("123", "tok", fetchImpl)).toEqual({ ok: false, reason: "ETIMEDOUT" });
  });
});
