// Which channels suit this business, and what a budget could be split
// into (Brain, Phase 3).
//
// Two dangers, and the tests are mostly here to hold the line on both.
//
// The channel cliché: "candle shop, therefore Instagram" is a guess
// wearing a recommendation's clothes. Every reason here has to point at
// something countable — photographs in the catalogue, searches actually
// reaching the site, a source that really converted.
//
// The believable lie: "₹30,000 on Google → 120 leads → ₹2,40,000". Those
// numbers need a cost per lead, and a business with 5 leads has none. A
// projection exists ONLY where the figure was measured here; everywhere
// else the scenario says what it would need and stops.

import { describe, it, expect } from "vitest";

import { channelFit, spendable, buyingSearches, CHANNEL_LABEL, type ChannelFit } from "@/lib/strategy/channelFit";
import { simulate, measuredCostPerLead, MIN_BUDGET, MIN_PER_CHANNEL, DISCLAIMER } from "@/lib/strategy/simulator";
import type { Diagnosis } from "@/lib/strategy/diagnosis";

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    window: { days: 90, from: "2026-06-28", to: "2026-09-26", label: "the last 90 days" },
    models: ["products", "services"],
    funnels: [{ name: "Store", steps: [{ key: "views", label: "Visits", count: 28, fromPrevious: null }], weakest: null, thin: "Too few visits." }],
    sources: [],
    atRisk: { count: 0, total: 0, days: 60 },
    paid: [],
    gaps: [],
    ...over,
  } as unknown as Diagnosis;
}

const q = (query: string, impressions: number) => ({ query, impressions, clicks: 0, ctr: 0, position: 10 });
const PHOTO_CATALOGUE = [{ name: "Lavender Candle", images: ["x.jpg"], price: 450, kind: "product" }];
const BARE_CATALOGUE = [{ name: "Lavender Candle", images: [], price: 450, kind: "product" }];

const base = {
  diagnosis: diagnosis(),
  queries: [],
  catalogue: PHOTO_CATALOGUE,
  city: "Shahjahanpur",
  connected: { meta: true, email: true, whatsapp: true, searchConsole: true },
  contacts: { leads: 5, customers: 3 },
};

const find = (fits: ChannelFit[], channel: string) => fits.find((f) => f.channel === channel)!;

describe("channels are decided from facts, not from the category", () => {
  it("NO PHOTOGRAPHS, NO VISUAL CHANNEL — however well a candle shop 'should' do on Instagram", () => {
    const fits = channelFit({ ...base, catalogue: BARE_CATALOGUE });
    const ig = find(fits, "instagram");
    expect(ig.standing).toBe("test");
    expect(ig.reasons[0]).toContain("Nothing in the catalogue has a photograph");
    expect(ig.needs).toContain("Add photographs to the catalogue");
    // And an untested channel always says what would settle the question.
    expect(ig.measure).toBeTruthy();
  });

  it("photographs make it fit, and the reason counts them", () => {
    const ig = find(channelFit(base), "instagram");
    expect(ig.standing).toBe("fits");
    expect(ig.reasons[0]).toContain("1 of 1 catalogue items have photographs");
  });

  it("search is decided by whether anyone is actually searching", () => {
    const none = find(channelFit(base), "google_search");
    expect(none.standing).toBe("test");
    expect(none.reasons[0]).toContain("No buying-intent search demand");

    const some = find(channelFit({ ...base, queries: [q("buy soy candles online", 62), q("how to make candles", 90)] }), "google_search");
    expect(some.standing).toBe("fits");
    // Only the buying search counts; the how-to one is not demand to sell into.
    expect(some.reasons[0]).toContain("1 buying-intent searches");
    expect(some.reasons[0]).toContain("62 impressions");
  });

  it("WHAT ALREADY WORKED HERE OUTRANKS EVERY RULE", () => {
    const fits = channelFit({
      ...base,
      catalogue: BARE_CATALOGUE, // the rule would say no to paid social
      diagnosis: diagnosis({ sources: [{ source: "Facebook", leads: 12, won: 3, conversion: 25, ranked: true }] as any }),
    });
    const meta = find(fits, "meta_ads");
    expect(meta.standing).toBe("proven");
    expect(meta.reasons[0]).toContain("12 leads from Facebook converted at 25%");
    // Proven channels are listed first.
    expect(fits[0].standing).toBe("proven");
  });

  it("a source with too few leads to rank is not called proven", () => {
    const fits = channelFit({
      ...base,
      diagnosis: diagnosis({ sources: [{ source: "Facebook", leads: 2, won: 1, conversion: null, ranked: false }] as any }),
    });
    expect(find(fits, "meta_ads").standing).not.toBe("proven");
  });

  it("no city means local search has nowhere to aim", () => {
    const local = find(channelFit({ ...base, city: null }), "local_seo");
    expect(local.standing).toBe("test");
    expect(local.needs).toContain("Add the city in Settings");
  });

  it("nobody on record means nobody to email or message", () => {
    const fits = channelFit({ ...base, contacts: { leads: 0, customers: 0 } });
    expect(find(fits, "email").standing).toBe("test");
    expect(find(fits, "whatsapp").reasons[0]).toContain("Nobody is on record");
    expect(find(fits, "calling").reasons[0]).toContain("No leads on record");
  });

  it("WhatsApp always says Hawlai cannot send it", () => {
    expect(find(channelFit(base), "whatsapp").needs.join(" ")).toContain("cannot send them");
  });

  it("an unconnected channel says what to connect instead of silently fitting", () => {
    const meta = find(channelFit({ ...base, connected: { ...base.connected, meta: false } }), "meta_ads");
    expect(meta.standing).toBe("test");
    expect(meta.needs).toContain("Connect the Facebook Page in Settings");
  });

  it("buyingSearches keeps only searches that read as ready to buy", () => {
    expect(buyingSearches([q("book candle workshop near me", 10), q("why do candles tunnel", 99)]).map((r) => r.query)).toEqual(["book candle workshop near me"]);
  });
});

// ---- the simulator ---------------------------------------------------------
const PROVEN_PAID = diagnosis({
  sources: [{ source: "Facebook", leads: 12, won: 3, conversion: 25, ranked: true }] as any,
  paid: [{ campaign: "Diwali gifting", spend: 4000, leads: 16, costPerLead: 250 }] as any,
});

describe("the budget split refuses to forecast", () => {
  const fits = () => channelFit({ ...base, queries: [q("buy soy candles online", 62)] });

  it("NO MEASURED COST PER LEAD, NO LEAD NUMBERS — and it says which figure is missing", () => {
    const sim = simulate({ budgetInr: 50000, fits: fits(), diagnosis: diagnosis() });
    expect(sim.scenarios.length).toBeGreaterThan(0);
    for (const s of sim.scenarios) {
      expect(s.projectedLeadsTotal).toBeNull();
      for (const a of s.allocations) {
        expect(a.projectedLeads).toBeNull();
        expect(a.basis).toBeNull();
      }
      expect(s.unknowns.join(" ")).toContain("What a lead costs this business");
    }
    // The money itself still adds up — that part is arithmetic.
    for (const s of sim.scenarios) expect(s.allocations.reduce((n, a) => n + a.amountInr, 0)).toBe(50000);
  });

  it("A PROJECTION APPEARS ONLY ON THE OWNER'S OWN MEASURED FIGURE, and names it", () => {
    const sim = simulate({ budgetInr: 50000, fits: fits(), diagnosis: PROVEN_PAID });
    const first = sim.scenarios[0].allocations[0];
    expect(first.projectedLeads).toBe(Math.floor(first.amountInr / 250));
    expect(first.basis).toContain("₹250 per lead");
    expect(first.basis).toContain('"Diwali gifting" actually cost');
  });

  it("the cheapest real campaign is the basis — never an average of guesses", () => {
    const d = diagnosis({ paid: [{ campaign: "A", spend: 1000, leads: 2, costPerLead: 500 }, { campaign: "B", spend: 1000, leads: 5, costPerLead: 200 }] as any });
    expect(measuredCostPerLead(d)).toEqual({ costPerLead: 200, campaign: "B" });
    // A campaign that produced no leads has no cost per lead to offer.
    expect(measuredCostPerLead(diagnosis({ paid: [{ campaign: "C", spend: 900, leads: 0, costPerLead: null }] as any }))).toBeNull();
    expect(measuredCostPerLead(diagnosis())).toBeNull();
  });

  it("NO INDUSTRY BENCHMARKS ANYWHERE — no revenue, no ROI, no multiples", () => {
    const text = JSON.stringify(simulate({ budgetInr: 50000, fits: fits(), diagnosis: diagnosis() }));
    for (const word of ["benchmark", "industry average", "roi", "revenue", "conversion rate of", "expect"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
    expect(DISCLAIMER).toContain("not forecasts");
  });

  it("only channels with evidence get money; an untested one is never funded", () => {
    const sim = simulate({ budgetInr: 50000, fits: fits(), diagnosis: diagnosis() });
    const funded = new Set(sim.scenarios.flatMap((s) => s.allocations.map((a) => a.channel)));
    for (const channel of funded) {
      expect(find(fits(), channel).standing, channel).not.toBe("test");
    }
  });

  it("nothing worth funding says so, instead of inventing a plan", () => {
    // No photographs, nothing connected, no search demand.
    const weak = channelFit({ ...base, catalogue: BARE_CATALOGUE, connected: {}, queries: [] });
    const sim = simulate({ budgetInr: 50000, fits: weak, diagnosis: diagnosis() });
    expect(sim.scenarios).toEqual([]);
    expect(sim.thin).toContain("None of the paid channels has anything behind it");
    expect(sim.thin).toContain("costs nothing");
  });

  it("a budget too small to divide is told to back one thing and measure it", () => {
    const sim = simulate({ budgetInr: MIN_BUDGET - 500, fits: fits(), diagnosis: diagnosis() });
    expect(sim.scenarios).toEqual([]);
    expect(sim.thin).toContain("too little to divide usefully");
  });

  it("no scenario puts a token amount on a channel and calls it a test", () => {
    const sim = simulate({ budgetInr: MIN_BUDGET, fits: fits(), diagnosis: PROVEN_PAID });
    for (const s of sim.scenarios) for (const a of s.allocations) expect(a.amountInr).toBeGreaterThanOrEqual(MIN_PER_CHANNEL);
  });

  it("every allocation says why that channel is in the split at all", () => {
    const sim = simulate({ budgetInr: 50000, fits: fits(), diagnosis: PROVEN_PAID });
    for (const s of sim.scenarios) for (const a of s.allocations) expect(a.why.length).toBeGreaterThan(10);
  });

  it("the organic scenario says the plain truth about why it's there", () => {
    const sim = simulate({ budgetInr: 50000, fits: fits(), diagnosis: PROVEN_PAID });
    const mixed = sim.scenarios.find((s) => s.allocations.length > 1 && s.allocations.some((a) => a.channel === "instagram" || a.channel === "email"));
    if (mixed) expect(mixed.allocations[1].why).toContain("keeps working after the spending stops");
  });
});

describe("what money can go behind", () => {
  it("only paid channels with evidence", () => {
    const fits = channelFit({ ...base, queries: [q("buy soy candles online", 62)] });
    const keys = spendable(fits).map((f) => f.channel);
    expect(keys).not.toContain("instagram");
    expect(keys).not.toContain("whatsapp");
    for (const k of keys) expect(["google_search", "meta_ads"]).toContain(k);
  });

  it("every channel has a label a person would recognise", () => {
    for (const f of channelFit(base)) expect(CHANNEL_LABEL[f.channel]).toBe(f.label);
  });
});
