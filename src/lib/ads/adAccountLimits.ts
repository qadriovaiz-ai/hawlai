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
    return {
      ok: true,
      limits: {
        minDailyBudget: typeof data.min_daily_budget === "number" ? data.min_daily_budget : Number(data.min_daily_budget) || null,
        currency: data.currency ?? null,
        accountStatus: typeof data.account_status === "number" ? data.account_status : Number(data.account_status) || null,
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Could not reach Meta." };
  }
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
