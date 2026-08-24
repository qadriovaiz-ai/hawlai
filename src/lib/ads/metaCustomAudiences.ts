// ------------------------------------------------------------------
// Meta Custom Audiences — retargeting piece 5/7.
// ------------------------------------------------------------------
// Turns the events piece 3 now sends into actual retargeting lists:
//   abandoned cart      — fired AddToCart, never fired Purchase
//   viewed, didn't buy  — fired ViewContent, never fired Purchase
//   buyers (list)       — real orders, hashed
//   lookalike           — people who behave like those buyers
//
// The "but didn't buy" half is an EXCLUSION rule Meta evaluates on its
// own side. That matters: we can't compute it locally, because Meta
// knows which of its users fired which pixel event and we only see our
// own first-party subset.
//
// UNVERIFIED AGAINST A LIVE AD ACCOUNT: built against Meta's
// documented Marketing API. No Meta ad account or pixel exists in this
// environment, so first real sync needs checking in Ads Manager.
// Custom Audience Terms of Service acceptance is also mandatory and
// fails with a distinct error — surfaced specifically below rather
// than as a generic failure, because it's the single most likely
// first-run problem and it has an exact fix.
// ------------------------------------------------------------------

import { GRAPH_VERSION } from "@/lib/adEngine";

const RETENTION_DAYS = 30;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

export interface AudienceResult {
  success: boolean;
  audienceId?: string;
  approximateCount?: number | null;
  error?: string;
  /** True when the failure is specifically un-accepted Custom Audience terms — the dealer must fix this in Ads Manager, we can't. */
  needsTermsAcceptance?: boolean;
}

function interpretError(data: any, httpStatus: number): AudienceResult {
  const err = data?.error ?? {};
  const message: string = err.error_user_msg ?? err.message ?? `Meta API error (${httpStatus})`;

  // Meta reports this as a normal API error, so without matching on it
  // a dealer sees "something went wrong" for a problem that has one
  // precise, self-serve fix.
  if (/terms/i.test(message) && /accept/i.test(message)) {
    return {
      success: false,
      needsTermsAcceptance: true,
      error:
        "Meta needs you to accept the Custom Audience terms first. In Meta Ads Manager go to Audiences, start creating any Custom Audience, and accept the terms shown — then sync again.",
    };
  }

  return { success: false, error: String(message).slice(0, 400) };
}

async function metaAudiencePost(path: string, body: Record<string, any>, token: string): Promise<AudienceResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, access_token: token }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) return interpretError(data, res.status);
    return { success: true, audienceId: data.id ? String(data.id) : undefined };
  } catch (err: any) {
    return { success: false, error: err?.message?.slice(0, 300) ?? "Request failed" };
  }
}

// ---- Website audiences (pixel-event based) --------------------------

/**
 * Builds the inclusion/exclusion rule for "did X, but never did Y".
 *
 * retention_seconds is on BOTH sides deliberately: a 30-day inclusion
 * paired with an unbounded exclusion would drop anyone who ever bought
 * at any point in the past, which isn't the intent — the intent is
 * "hasn't bought during this same window".
 */
function buildEventRule(pixelId: string, includeEvent: string, excludeEvent?: string) {
  const source = [{ id: pixelId, type: "pixel" }];
  const rule: Record<string, any> = {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: source,
          retention_seconds: RETENTION_SECONDS,
          filter: {
            operator: "and",
            filters: [{ field: "event", operator: "eq", value: includeEvent }],
          },
        },
      ],
    },
  };

  if (excludeEvent) {
    rule.exclusions = {
      operator: "or",
      rules: [
        {
          event_sources: source,
          retention_seconds: RETENTION_SECONDS,
          filter: {
            operator: "and",
            filters: [{ field: "event", operator: "eq", value: excludeEvent }],
          },
        },
      ],
    };
  }

  return rule;
}

export async function createWebsiteAudience(opts: {
  adAccountId: string;
  accessToken: string;
  pixelId: string;
  name: string;
  includeEvent: string;
  excludeEvent?: string;
  description?: string;
}): Promise<AudienceResult> {
  return metaAudiencePost(
    `${opts.adAccountId}/customaudiences`,
    {
      name: opts.name,
      description: opts.description ?? `Created by Hawlai — ${RETENTION_DAYS} day window`,
      rule: buildEventRule(opts.pixelId, opts.includeEvent, opts.excludeEvent),
      prefill: 1, // backfill from existing pixel history rather than starting empty
    },
    opts.accessToken
  );
}

// ---- Customer-list audiences (hashed) ------------------------------

export async function createCustomerListAudience(opts: {
  adAccountId: string;
  accessToken: string;
  name: string;
  description?: string;
}): Promise<AudienceResult> {
  return metaAudiencePost(
    `${opts.adAccountId}/customaudiences`,
    {
      name: opts.name,
      description: opts.description ?? "Created by Hawlai",
      subtype: "CUSTOM",
      // The data is the business's own customers, collected directly
      // by them — not bought or supplied by a partner.
      customer_file_source: "USER_PROVIDED_ONLY",
    },
    opts.accessToken
  );
}

/**
 * Uploads already-hashed contact data to a customer-list audience.
 *
 * Takes hashes, never raw values: hashing happens in
 * audienceHashing.ts (piece 1), which also applies opt-out
 * suppression. Accepting raw PII here would create a second path that
 * could bypass that suppression.
 */
export async function addUsersToAudience(opts: {
  audienceId: string;
  accessToken: string;
  rows: { phoneHash: string | null; emailHash: string | null }[];
}): Promise<AudienceResult> {
  const usable = opts.rows.filter((r) => r.phoneHash || r.emailHash);
  if (usable.length === 0) return { success: true }; // nothing to send is not a failure

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${opts.audienceId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: opts.accessToken,
        payload: {
          schema: ["PHONE", "EMAIL"],
          // Meta expects "" for a missing field, not null — a null
          // here is rejected for the whole batch.
          data: usable.map((r) => [r.phoneHash ?? "", r.emailHash ?? ""]),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) return interpretError(data, res.status);
    return { success: true, audienceId: opts.audienceId };
  } catch (err: any) {
    return { success: false, error: err?.message?.slice(0, 300) ?? "Upload failed" };
  }
}

// ---- Lookalike -----------------------------------------------------

/**
 * A lookalike needs a real SOURCE audience — Meta models behaviour
 * from actual people. The honest source here is the buyers
 * customer-list audience, which is why syncing a lookalike requires
 * that list to exist first rather than being independently creatable.
 *
 * ratio 0.01-0.10 (1%-10% of the country's population). 0.01 is the
 * tightest/most similar; anything larger trades similarity for reach.
 */
export async function createLookalikeAudience(opts: {
  adAccountId: string;
  accessToken: string;
  name: string;
  originAudienceId: string;
  country?: string;
  ratio?: number;
}): Promise<AudienceResult> {
  const ratio = Math.min(0.1, Math.max(0.01, opts.ratio ?? 0.01));
  return metaAudiencePost(
    `${opts.adAccountId}/customaudiences`,
    {
      name: opts.name,
      subtype: "LOOKALIKE",
      origin_audience_id: opts.originAudienceId,
      lookalike_spec: JSON.stringify({ country: opts.country ?? "IN", ratio }),
    },
    opts.accessToken
  );
}

// ---- Read-back -----------------------------------------------------

/** Meta's own size estimate. Deliberately read from Meta rather than computed locally — see migration 155. */
export async function fetchAudienceCount(audienceId: string, accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${audienceId}?fields=approximate_count_lower_bound&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = await res.json();
    if (!res.ok || data?.error) return null;
    const count = data?.approximate_count_lower_bound;
    return typeof count === "number" && count >= 0 ? count : null;
  } catch {
    return null;
  }
}
