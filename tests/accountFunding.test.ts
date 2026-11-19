// Funds are not a payment method — 19 November 2026.
//
// THE LIVE CASE. The ad account had ₹250 of prepaid funds on it and
// Meta would not publish. Adding UPI as a PAYMENT METHOD is what
// released it. Two different things, and an account can have the first
// without the second while every other field reads perfectly healthy —
// `account_status` included, which is why commit 1 alone would not have
// caught this one.
//
// NONE OF IT IS CACHED. The seven-day cache is right for the account's
// minimum daily budget; a balance changes hourly, and a week-old one is
// worse than no answer because it looks like an answer. Read at the
// moment of the decision, thrown away after. That is also why this
// needs no migration.
//
// TWO RULES PULLING OPPOSITE WAYS. A false refusal costs a retry; a
// false "it's running" costs seventy days. So what DEFINITELY stops
// delivery blocks, what is merely uncertain warns, and a field that
// could not be read does neither.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  describeFunding,
  fetchAccountFunding,
  LOW_BALANCE_DAYS,
  type AccountFunding,
} from "@/lib/ads/adAccountLimits";
import { code } from "./helpers/source";

const INR = { currency: "INR", minDailyBudget: 4000 }; // ₹40.00/day minimum

const funding = (over: Partial<AccountFunding> = {}): AccountFunding => ({
  hasPaymentMethod: true,
  balanceMinor: null,
  spendCapMinor: null,
  amountSpentMinor: null,
  ...over,
});

/** Meta answering a funding read with exactly this body. */
function metaReturns(body: Record<string, any>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as any);
}

afterEach(() => vi.restoreAllMocks());

describe("1. FUNDS WITHOUT A PAYMENT METHOD", () => {
  it("THE LOAD-BEARING ONE: money on the account and no payment method still blocks", () => {
    // The live case, and the whole reason this file exists. Every other
    // field is healthy; Meta will not publish.
    const v = describeFunding(funding({ hasPaymentMethod: false, balanceMinor: 25000 }), INR);
    expect(v.usable).toBe(false);
    expect(v.reason).toMatch(/no payment method/i);
  });

  it("AND IT SAYS THE MONEY IS STILL THERE", () => {
    // "Add a payment method" reads as nonsense to someone who has
    // already paid. The amount is named, and so is the fact that it is
    // not lost — otherwise the sentence sounds like the ₹250 vanished.
    const v = describeFunding(funding({ hasPaymentMethod: false, balanceMinor: 25000 }), INR);
    expect(v.reason).toMatch(/₹250/);
    expect(v.reason).toMatch(/not lost/i);
  });

  it("NO MONEY AND NO PAYMENT METHOD IS A DIFFERENT SENTENCE", () => {
    // Two different situations must not collapse into one instruction.
    const broke = describeFunding(funding({ hasPaymentMethod: false, balanceMinor: 0 }), INR);
    const funded = describeFunding(funding({ hasPaymentMethod: false, balanceMinor: 25000 }), INR);
    expect(broke.usable).toBe(false);
    expect(broke.reason).not.toBe(funded.reason);
    expect(broke.reason).not.toMatch(/not lost/i);
  });

  it("A PAYMENT METHOD WE COULD NOT READ IS NOT A MISSING ONE", () => {
    // null is "could not read". Treating it as "no" would block every
    // launch on a token whose scope cannot see funding.
    expect(describeFunding(funding({ hasPaymentMethod: null }), INR).usable).toBe(true);
  });

  it("and no funding answer at all changes nothing", () => {
    expect(describeFunding(null, INR)).toEqual({ usable: true, reason: null, warning: null });
  });
});

describe("2. THE SPEND CAP", () => {
  it("REACHED MEANS STOPPED", () => {
    const v = describeFunding(funding({ spendCapMinor: 100000, amountSpentMinor: 100000 }), INR);
    expect(v.usable).toBe(false);
    expect(v.reason).toMatch(/spend limit/i);
    expect(v.reason).toMatch(/₹1,000/);
  });

  it("A CAP OF 0 MEANS NO CAP, not a cap of nothing", () => {
    // THE ONE THAT WOULD PAUSE EVERY ACCOUNT. Most accounts never set a
    // cap, and Meta reports that as 0. Reading it as "cap reached"
    // would stop all of them.
    const v = describeFunding(funding({ spendCapMinor: 0, amountSpentMinor: 500000 }), INR);
    expect(v.usable).toBe(true);
  });

  it("under the cap is fine", () => {
    expect(describeFunding(funding({ spendCapMinor: 100000, amountSpentMinor: 99999 }), INR).usable).toBe(true);
  });

  it("a cap with no spend figure does not block", () => {
    // Half an answer is not an answer.
    expect(describeFunding(funding({ spendCapMinor: 100000, amountSpentMinor: null }), INR).usable).toBe(true);
  });
});

describe("3. A LOW BALANCE WARNS AND NEVER BLOCKS", () => {
  it("BALANCE NEVER BLOCKS, because its meaning is not confirmed", () => {
    // Meta's own meaning for `balance` differs between prepaid and
    // credit accounts and could not be confirmed for an Indian prepaid
    // account. Guessing it would risk pausing an account that is fine,
    // so it only ever warns. The blocks rest on the payment method,
    // which is unambiguous, and the cap, which is arithmetic.
    const v = describeFunding(funding({ balanceMinor: 1 }), INR);
    expect(v.usable).toBe(true);
    expect(v.warning).not.toBeNull();
  });

  it("LOW IS MEASURED AGAINST THE ACCOUNT'S OWN MINIMUM, not a number in the code", () => {
    // A rupee figure written in here would be wrong for every currency
    // but one. Under three days at this account's own floor is low.
    const justUnder = INR.minDailyBudget * LOW_BALANCE_DAYS - 1;
    const justOver = INR.minDailyBudget * LOW_BALANCE_DAYS + 1;
    expect(describeFunding(funding({ balanceMinor: justUnder }), INR).warning).not.toBeNull();
    expect(describeFunding(funding({ balanceMinor: justOver }), INR).warning).toBeNull();
  });

  it("WITH NO MINIMUM KNOWN, THERE IS NO WARNING", () => {
    // Nothing to measure against, so nothing is claimed.
    expect(describeFunding(funding({ balanceMinor: 1 }), { currency: "INR", minDailyBudget: null }).warning).toBeNull();
  });

  it("a zero balance does not produce a low-balance warning", () => {
    // Zero is either "nothing owed" or "nothing left" depending on the
    // account type — exactly the ambiguity this refuses to guess at.
    expect(describeFunding(funding({ balanceMinor: 0 }), INR).warning).toBeNull();
  });
});

describe("4. READING IT FROM META", () => {
  it("IT ASKS FOR THE FOUR FUNDING FIELDS", async () => {
    const spy = metaReturns({ balance: "0", spend_cap: "0", amount_spent: "0" });
    await fetchAccountFunding("act_1", "T");
    const url = String(spy.mock.calls[0][0]);
    for (const f of ["funding_source_details", "balance", "spend_cap", "amount_spent"]) {
      expect(url).toContain(f);
    }
  });

  it("A MISSING funding_source_details IS ONLY 'no' WHEN META TALKED ABOUT FUNDING", async () => {
    // THE SUBTLE ONE. Meta omits the field when there is no payment
    // method — and a token that cannot read funding omits it too. The
    // two are indistinguishable, so absence counts as "no" only when
    // the other funding fields came back, which proves Meta was willing
    // to discuss funding at all.
    metaReturns({ balance: "25000", spend_cap: "0", amount_spent: "0" });
    expect((await fetchAccountFunding("act_1", "T"))?.hasPaymentMethod).toBe(false);

    vi.restoreAllMocks();
    metaReturns({ id: "act_1" });
    expect((await fetchAccountFunding("act_1", "T"))?.hasPaymentMethod).toBeNull();
  });

  it("a real payment method reads as true", async () => {
    metaReturns({ funding_source_details: { id: "123", type: 1, display_string: "UPI" }, balance: "0" });
    expect((await fetchAccountFunding("act_1", "T"))?.hasPaymentMethod).toBe(true);
  });

  it("MINOR UNITS ARRIVE AS STRINGS, and are read as numbers", async () => {
    // Meta returns these as strings. `Number("0") || null` would turn a
    // real zero into null, which is why the parser is explicit.
    metaReturns({ balance: "25000", spend_cap: "0", amount_spent: "0" });
    const f = await fetchAccountFunding("act_1", "T");
    expect(f?.balanceMinor).toBe(25000);
    expect(f?.spendCapMinor).toBe(0);
    expect(f?.amountSpentMinor).toBe(0);
  });

  it("AN ERROR IS null, NEVER 'no payment method'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "nope" } }) } as any);
    expect(await fetchAccountFunding("act_1", "T")).toBeNull();
  });

  it("and so is a thrown network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await fetchAccountFunding("act_1", "T")).toBeNull();
  });
});

describe("5. IT IS NEVER STORED, AND THE STATUS STILL COMES FIRST", () => {
  it("NO FUNDING FIELD IS EVER WRITTEN TO A COLUMN", () => {
    // A balance in the seven-day cache is worse than no balance,
    // because it looks like an answer. This is also what keeps commit 3
    // free of a migration.
    const src = code("src/lib/ads/adAccountLimits.ts");
    const at = src.indexOf("export function limitsToRow");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, at + 400);
    for (const f of ["balance", "spend_cap", "amount_spent", "funding"]) {
      expect(fn).not.toContain(f);
    }
    expect(src).not.toMatch(/fb_balance|fb_spend_cap|fb_funding/);
  });

  it("A DISABLED ACCOUNT SHORT-CIRCUITS, so its reason is not replaced by a balance note", () => {
    // "Meta has disabled this ad account" is what the owner must act
    // on. Running the funding check afterwards would spend a Graph call
    // to reach a conclusion already reached, and could overwrite it.
    const src = code("src/lib/ads/adAccountLimits.ts");
    const at = src.indexOf("export async function accountHealthFor");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, at + 1200);
    const statusCheck = fn.indexOf("if (!status.usable) return status;");
    const fundingCall = fn.indexOf("fetchAccountFunding(");
    expect(statusCheck).toBeGreaterThan(-1);
    expect(fundingCall).toBeGreaterThan(statusCheck);
  });

  it("A WARNING DOES NOT CHANGE THE LABEL", () => {
    // An account running low is still delivering. Calling it anything
    // but Active would be the false alarm this work is otherwise about.
    const src = code("src/lib/ads/campaignDelivery.ts");
    expect(src).toMatch(/if \(s\.delivering\) return d\("active", s\.account\?\.warning \?\? null\);/);
  });

  it("AND THE ACTIVATION REPORTS IT ON SUCCESS, not as an error", () => {
    // Sliced to the SUCCESS return before anchoring. `effectiveStatus:
    // outcome.effectiveStatus` occurs twice in this route and the first
    // one is the 500 — an indexOf on it lands on the failure path, which
    // is exactly where this warning must not appear. A low balance is
    // not an error.
    const src = code("src/app/api/ads/[id]/status/route.ts");
    const success = src.indexOf("return NextResponse.json({ ...updated,");
    const failure = src.indexOf("return NextResponse.json({ error: outcome.reason");
    expect(success).toBeGreaterThan(-1);
    expect(failure).toBeGreaterThan(-1);
    expect(src.slice(success, success + 200)).toMatch(/accountWarning: account\?\.warning \?\? null/);
    expect(src.slice(failure, failure + 200)).not.toMatch(/accountWarning/);
  });
});
