// What Meta will actually let this account spend — cached, so nobody
// has to go and look it up on Meta's own site.
//
// THE INCIDENT THIS EXISTS FOR: a merchant was sent to Meta to read
// min_daily_budget by hand, because Hawlai did not know it. That is a
// direct breach of the product's core promise. It was also unnecessary
// — Meta returns it on the ad account object, and we already hold a
// token that can ask.
//
// It is worth knowing how wrong a guess would have been. Published
// figures for the INR minimum ranged over ₹40, ₹87.90 and ₹100. The
// real value for this account is ₹94.91, so the most-cited number
// (₹87.90) is BELOW the floor: a campaign set to it is rejected by
// Meta with an error naming neither the limit nor the fix. There is no
// safe way to hardcode this. Ask the account.

import { formatMoney } from "@/lib/publish/money";

/** How long a cached reading is trusted before it is refreshed. */
export const LIMITS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdAccountLimits = {
  /** In the currency's MINOR unit (paise for INR), exactly as Meta returns it. */
  minDailyBudget: number | null;
  currency: string | null;
  accountStatus: number | null;
  checkedAt: string | null;
};

/**
 * Meta's account_status codes.
 *
 * Only the ones that change what a merchant should do are named. The
 * rest fall through to a generic message rather than a number, because
 * "account_status 202" is not something anyone can act on.
 */
const STATUS_MEANING: Record<number, { usable: boolean; reason: string }> = {
  1: { usable: true, reason: "Active." },
  2: { usable: false, reason: "Meta has disabled this ad account. It usually means a policy review or an unpaid balance — Meta will say which in the account's notifications." },
  3: { usable: false, reason: "This ad account has an unsettled balance. Ads stay paused until the outstanding amount is paid." },
  7: { usable: false, reason: "Meta is reviewing this ad account for risk. Nothing can run until that review finishes; it usually takes a day or two." },
  8: { usable: false, reason: "This ad account is pending settlement with Meta." },
  9: { usable: true, reason: "This account is in a grace period — ads still run, but Meta needs the payment method updated soon." },
  100: { usable: false, reason: "This ad account is scheduled for closure." },
  101: { usable: false, reason: "This ad account is closed." },
};

/**
 * Can this account spend right now, and if not, why — in words a
 * business owner can act on.
 *
 * `null` status means never checked, which is NOT the same as broken:
 * refusing to launch because we have not asked yet would turn a
 * missing cache row into a broken product.
 */
export function isAccountUsable(status: number | null | undefined): { usable: boolean; reason: string } {
  if (status == null) return { usable: true, reason: "Not checked yet." };
  const known = STATUS_MEANING[status];
  if (known) return known;
  return {
    usable: false,
    reason: "Meta reports this ad account is not in a state where it can run ads. Check the account's notifications on Meta for the specific reason.",
  };
}

/**
 * The ad account's state, ready to hand to readCampaignState.
 *
 * ONE ANSWER, IN ONE PLACE. Five call sites now have to say whether the
 * account can pay, and five copies of "read the row, call
 * isAccountUsable" would drift — one of them would end up reading the
 * cached column directly and never refreshing it, which is the version
 * of this bug that hides for another seventy days.
 *
 * Goes through getAdAccountLimits, so a reading older than its TTL is
 * refreshed from Meta first. That matters here more than at launch: a
 * payment method removed last week is exactly the case this exists to
 * notice, and a stale cache would report the account healthy.
 *
 * NEVER THROWS, for the reason getAdAccountLimits never does — if Meta
 * cannot be reached the cached reading stands, and a never-checked
 * account reads as usable rather than as broken.
 */
export async function accountHealthFor(
  supabase: any,
  dealershipId: string,
  opts: { row?: Record<string, any>; token?: string | null } = {}
): Promise<{ usable: boolean; reason: string; warning?: string | null }> {
  const limits = await getAdAccountLimits(supabase, dealershipId, opts);

  // THE STATUS FIRST, AND IT SHORT-CIRCUITS. A disabled or unsettled
  // account is already the answer; asking it about funding afterwards
  // would be a second Graph call to reach a conclusion already reached,
  // and could overwrite "Meta has disabled this account" — which the
  // owner must act on — with a note about the balance.
  const status = isAccountUsable(limits.accountStatus);
  if (!status.usable) return status;

  // Funding needs an account id and a token. Without either this is
  // simply not asked, and silence is unknown, never "no".
  const adAccount = opts.row?.fb_ad_account_id ?? (await readAdAccountId(supabase, dealershipId));
  if (!adAccount || !opts.token) return status;

  const verdict = describeFunding(await fetchAccountFunding(adAccount, opts.token), limits);
  if (!verdict.usable && verdict.reason) return { usable: false, reason: verdict.reason };
  return { ...status, warning: verdict.warning };
}

/** Only when the caller did not already have the row. */
async function readAdAccountId(supabase: any, dealershipId: string): Promise<string | null> {
  const { data } = await supabase.from("dealerships").select("fb_ad_account_id").eq("id", dealershipId).maybeSingle();
  return data?.fb_ad_account_id ?? null;
}

/** Minor units → a human amount. 9491 + INR → "₹94.91". */
export function formatMinorAmount(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (minor == null || !Number.isFinite(minor)) return null;
  // Currencies differ in how many minor digits they use — INR and USD
  // have 2, JPY has 0. Asking Intl rather than assuming 100 keeps this
  // right outside India, which the product already needs (the price
  // path shipped a hardcoded ₹ and it was wrong on a USD store).
  let digits = 2;
  if (currency) {
    try {
      digits = new Intl.NumberFormat("en-IN", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
  }
  const major = minor / Math.pow(10, digits);
  return formatMoney(major.toFixed(digits), currency ?? null);
}

/** "₹94.91/day" — or null when the minimum is unknown. */
export function describeMinimum(limits: AdAccountLimits): string | null {
  const amount = formatMinorAmount(limits.minDailyBudget, limits.currency);
  return amount ? `${amount}/day` : null;
}

export function isStale(checkedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!checkedAt) return true;
  const t = Date.parse(checkedAt);
  return !Number.isFinite(t) || now - t > LIMITS_TTL_MS;
}

/**
 * Raise a requested budget to the account minimum.
 *
 * RAISES, never lowers. The AI plan proposes a number and Meta rejects
 * anything under the floor with an error that names neither the floor
 * nor the fix — so the choice is between a launch that fails opaquely
 * and one that spends slightly more than proposed. The second is
 * recoverable and gets reported; the first wastes the whole flow
 * (image generation, creative upload, campaign creation) before
 * failing at the ad set.
 *
 * Both figures are in MINOR units.
 */
export function clampBudgetToMinimum(
  requestedMinor: number,
  minimumMinor: number | null | undefined
): { minor: number; raised: boolean; from: number } {
  if (minimumMinor == null || !Number.isFinite(minimumMinor) || minimumMinor <= 0) {
    return { minor: requestedMinor, raised: false, from: requestedMinor };
  }
  if (requestedMinor >= minimumMinor) {
    return { minor: requestedMinor, raised: false, from: requestedMinor };
  }
  return { minor: minimumMinor, raised: true, from: requestedMinor };
}

/** Ask Meta. Read-only; never called without a token that already works. */
export async function fetchAdAccountLimits(
  adAccountId: string,
  token: string,
  graphVersion = "v23.0"
): Promise<{ ok: true; limits: AdAccountLimits } | { ok: false; reason: string }> {
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const url = `https://graph.facebook.com/${graphVersion}/${acct}?fields=min_daily_budget,currency,account_status&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, reason: data?.error?.message ?? `Graph returned ${res.status}` };
    }
    const limits: AdAccountLimits = {
      minDailyBudget: typeof data.min_daily_budget === "number" ? data.min_daily_budget : Number(data.min_daily_budget) || null,
      currency: data.currency ?? null,
      accountStatus: typeof data.account_status === "number" ? data.account_status : Number(data.account_status) || null,
      checkedAt: new Date().toISOString(),
    };

    // A 200 CARRYING NONE OF THE THREE FIELDS IS NOT AN ANSWER.
    //
    // Found 19 November 2026. Without this, such a response became
    // `ok: true` with three nulls, and getAdAccountLimits PERSISTS what
    // it fetches — so a good cached reading was overwritten with nulls
    // and stamped with a fresh `checkedAt`, which makes it look current
    // for another seven days.
    //
    // A null account_status reads as "never checked", and never checked
    // reads as usable. So the failure mode is precisely the one this
    // whole change exists to end: an account that cannot pay, reported
    // as fine, for a week at a time. An empty answer has to leave the
    // last real one alone.
    if (limits.minDailyBudget === null && limits.currency === null && limits.accountStatus === null) {
      return { ok: false, reason: "Meta answered without any of the account's limits." };
    }

    return { ok: true, limits };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Could not reach Meta." };
  }
}

// ─────────────────────────────────────────────────────────────────────
// CAN IT PAY — funding, balance, spend cap
// ─────────────────────────────────────────────────────────────────────
//
// WHAT HAPPENED (19 November 2026). The account had ₹250 of prepaid
// funds on it and Meta would not publish. Adding UPI as a PAYMENT
// METHOD is what unblocked it. Funds and a payment method are two
// different things, and an account can have the first without the
// second while every other field reads perfectly healthy.
//
// NONE OF THIS IS CACHED, and that is deliberate. The seven-day cache
// is right for the account's minimum daily budget, which barely moves;
// a balance changes hourly, and a week-old one is worse than no answer
// because it looks like an answer. So this is read at the moment a
// decision is made and thrown away, and `limitsToRow` never learns
// about it — which is also why commit 3 needs no migration.

export type AccountFunding = {
  /**
   * Whether the account has a payment method attached at all.
   * NULL means the field could not be read — never "no".
   */
  hasPaymentMethod: boolean | null;
  /** Minor units, as Meta returns them. */
  balanceMinor: number | null;
  spendCapMinor: number | null;
  amountSpentMinor: number | null;
};

/** How many days of the account's own minimum counts as "running low". */
export const LOW_BALANCE_DAYS = 3;

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Ask Meta what this account can actually pay with. Read-only.
 *
 * Returns null when the answer cannot be had, which every caller treats
 * as "unknown" — never as "no payment method". A permission-scoped
 * token that cannot see funding would otherwise block every launch.
 */
export async function fetchAccountFunding(
  adAccountId: string,
  token: string,
  graphVersion = "v23.0"
): Promise<AccountFunding | null> {
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const fields = "funding_source_details,balance,spend_cap,amount_spent";
  const url = `https://graph.facebook.com/${graphVersion}/${acct}?fields=${fields}&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) return null;

    // PRESENT-BUT-EMPTY AND ABSENT ARE DIFFERENT. Meta omits
    // `funding_source_details` entirely when there is no payment
    // method; a token that cannot read it also omits it. The two are
    // indistinguishable here, so the absence is only treated as "no
    // payment method" when Meta answered with the OTHER funding fields
    // — which proves it was willing and able to talk about funding.
    const details = data.funding_source_details;
    const answeredAboutFunding =
      data.balance !== undefined || data.spend_cap !== undefined || data.amount_spent !== undefined;
    const hasPaymentMethod =
      details && typeof details === "object" && (details.id || details.type !== undefined || details.display_string)
        ? true
        : answeredAboutFunding
          ? false
          : null;

    return {
      hasPaymentMethod,
      balanceMinor: num(data.balance),
      spendCapMinor: num(data.spend_cap),
      amountSpentMinor: num(data.amount_spent),
    };
  } catch {
    return null;
  }
}

export type FundingVerdict = {
  /** False only when something definitely stops delivery. */
  usable: boolean;
  /** Why it cannot run, in the owner's words. Null when it can. */
  reason: string | null;
  /** Worth saying, but not a blocker. */
  warning: string | null;
};

/**
 * What the funding state means for an owner.
 *
 * TWO RULES, AND THEY PULL IN OPPOSITE DIRECTIONS. A false refusal
 * costs a retry; a false "it's running" costs an owner seventy days of
 * believing their money is working. So anything that DEFINITELY stops
 * delivery blocks, and anything merely uncertain only warns — and a
 * field that could not be read does neither.
 *
 * `balance` NEVER BLOCKS. Meta's own meaning for it differs between
 * prepaid and credit accounts, and I could not confirm which applies to
 * an Indian prepaid account from the documentation. Guessing it would
 * risk pausing an account that is fine, so it only ever produces a
 * warning. The block rests on `funding_source_details`, which is
 * unambiguous, and on a spend cap that has been reached, which is
 * arithmetic.
 */
export function describeFunding(
  funding: AccountFunding | null,
  limits: { currency: string | null; minDailyBudget: number | null }
): FundingVerdict {
  const ok: FundingVerdict = { usable: true, reason: null, warning: null };
  if (!funding) return ok;

  const money = (minor: number | null) => (minor === null ? null : formatMinorAmount(minor, limits.currency));

  // 1. NO PAYMENT METHOD. The live case, and it blocks: the owner had
  //    funds, Meta would not publish, and attaching a payment method is
  //    what fixed it. Said as two different sentences depending on
  //    whether there is money sitting there, because "add a payment
  //    method" reads as nonsense to someone who has already paid.
  if (funding.hasPaymentMethod === false) {
    const sitting = funding.balanceMinor !== null && funding.balanceMinor > 0 ? money(funding.balanceMinor) : null;
    return {
      usable: false,
      reason: sitting
        ? `This ad account has ${sitting} on it but no payment method attached, and Meta won't publish ads until there is one. Adding one — a card or UPI — is what releases it; the money already there is not lost.`
        : "This ad account has no payment method attached, so Meta won't publish ads from it. Add a card or UPI on the account first.",
      warning: null,
    };
  }

  // 2. SPEND CAP REACHED. Arithmetic, not interpretation: Meta stops
  //    delivery at the cap. A cap of 0 means NO CAP, not a cap of
  //    nothing — getting that backwards would pause every account that
  //    never set one.
  const cap = funding.spendCapMinor;
  const spent = funding.amountSpentMinor;
  if (cap !== null && cap > 0 && spent !== null && spent >= cap) {
    return {
      usable: false,
      reason: `This ad account has reached its spend limit of ${money(cap) ?? "its cap"}, so Meta has stopped delivery. Raise or clear the limit in the account's billing settings.`,
      warning: null,
    };
  }

  // 3. RUNNING LOW — a warning, never a block. Measured against the
  //    account's OWN minimum daily budget rather than a number written
  //    in here, which would be wrong for every currency but one.
  if (
    funding.balanceMinor !== null &&
    limits.minDailyBudget !== null &&
    limits.minDailyBudget > 0 &&
    funding.balanceMinor > 0 &&
    funding.balanceMinor < limits.minDailyBudget * LOW_BALANCE_DAYS
  ) {
    return {
      ...ok,
      warning: `This ad account is down to ${money(funding.balanceMinor)}, which is under ${LOW_BALANCE_DAYS} days at its minimum daily budget. Ads stop when it runs out.`,
    };
  }

  return ok;
}

/** The four columns, for a SELECT. */
export const LIMITS_SELECT = "fb_min_daily_budget, fb_currency, fb_account_status, fb_limits_checked_at";

export function limitsFromRow(row: Record<string, any> | null | undefined): AdAccountLimits {
  return {
    minDailyBudget: row?.fb_min_daily_budget ?? null,
    currency: row?.fb_currency ?? null,
    accountStatus: row?.fb_account_status ?? null,
    checkedAt: row?.fb_limits_checked_at ?? null,
  };
}

export function limitsToRow(limits: AdAccountLimits): Record<string, any> {
  return {
    fb_min_daily_budget: limits.minDailyBudget,
    fb_currency: limits.currency,
    fb_account_status: limits.accountStatus,
    fb_limits_checked_at: limits.checkedAt ?? new Date().toISOString(),
  };
}

/**
 * Cached limits, refreshed when stale.
 *
 * NEVER THROWS AND NEVER BLOCKS ON META. A failed refresh returns the
 * cached reading — possibly old, possibly empty — because the caller is
 * about to launch an ad, and being unable to reach Meta for a
 * *validation* call is not a reason to refuse. Meta will enforce its
 * own minimum regardless; this only exists to say so first.
 */
export async function getAdAccountLimits(
  supabase: any,
  dealershipId: string,
  opts: { row?: Record<string, any>; token?: string | null; now?: number } = {}
): Promise<AdAccountLimits> {
  let row = opts.row;
  if (!row) {
    const { data } = await supabase
      .from("dealerships")
      .select("fb_ad_account_id, fb_min_daily_budget, fb_currency, fb_account_status, fb_limits_checked_at")
      .eq("id", dealershipId)
      .maybeSingle();
    row = data ?? undefined;
  }

  const cached = limitsFromRow(row);
  const adAccount = row?.fb_ad_account_id;
  if (!adAccount || !opts.token) return cached;
  if (!isStale(cached.checkedAt, opts.now ?? Date.now())) return cached;

  const fresh = await fetchAdAccountLimits(adAccount, opts.token);
  if (!fresh.ok) return cached;

  await supabase.from("dealerships").update(limitsToRow(fresh.limits)).eq("id", dealershipId);
  return fresh.limits;
}
