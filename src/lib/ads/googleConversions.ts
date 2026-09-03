// A4 — the dealer never types a Google Ads conversion ID or label.
//
// Both were text boxes with instructions reading "Google Ads → Goals →
// Conversions → your purchase action", where you open the tag setup,
// find the event snippet, and copy two different fragments out of a
// block of JavaScript. Google Ads already knows both, so they are read
// over the API and offered as a list of conversion actions to click.
//
// UNVERIFIED AGAINST A LIVE ACCOUNT, like everything else in this file
// family: GOOGLE_ADS_DEVELOPER_TOKEN is not available in this
// environment, so no call here has ever reached Google. The GAQL and
// the snippet shapes are from Google's v19 documentation.

const API_VERSION = "v19";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

export type ConversionAction = {
  resourceName: string;
  name: string;
  category: string | null;
  /** e.g. "AW-123456789" — the account-wide conversion tracking id. */
  conversionId: string | null;
  /** e.g. "AbC-D_efGhIjKlMn" — per-action, parsed out of the event snippet. */
  conversionLabel: string | null;
};

export type ConversionListResult =
  | { ok: true; actions: ConversionAction[] }
  | { ok: false; reason: string };

/**
 * The `send_to` value inside a Google Ads event snippet, split into its
 * two halves.
 *
 * The snippet is a block of JavaScript, and the only part that matters
 * looks like `'send_to': 'AW-123456789/AbC-D_efG'`. Parsed rather than
 * asked for because these two fragments are the exact thing dealers
 * were being told to go and find by hand.
 */
export function parseSendTo(eventSnippet: string | null | undefined): { conversionId: string | null; conversionLabel: string | null } {
  if (!eventSnippet) return { conversionId: null, conversionLabel: null };

  // Quotes may be single or double, and Google has shipped both
  // 'send_to' and send_to over the years.
  const match = eventSnippet.match(/['"]?send_to['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (!match) return { conversionId: null, conversionLabel: null };

  const [id, label] = match[1].split("/");
  return {
    conversionId: id?.trim() || null,
    // A snippet with no slash is a GA4-style send_to with no label.
    // Returning "" here would save an empty label over a working one.
    conversionLabel: label?.trim() || null,
  };
}

/** Rows from a googleAds:search response, mapped to what the picker needs. */
export function mapConversionActions(rows: any[] | null | undefined): ConversionAction[] {
  return (rows ?? [])
    // Annotated rather than inferred: `as string ?? null` reads as a
    // nullable field but the cast makes the fallback dead, so TS
    // inferred plain string and the filter predicate below stopped
    // type-checking. Let the declared type drive it.
    .map((row): ConversionAction | null => {
      const action = row?.conversionAction;
      if (!action?.resourceName) return null;

      // tag_snippets is repeated — one entry per page-load/event-type
      // pairing. They all carry the same send_to, so the first one
      // that parses is enough.
      const snippets: any[] = action.tagSnippets ?? [];
      let conversionId: string | null = null;
      let conversionLabel: string | null = null;
      for (const snippet of snippets) {
        const parsed = parseSendTo(snippet?.eventSnippet);
        if (parsed.conversionLabel) {
          conversionId = parsed.conversionId;
          conversionLabel = parsed.conversionLabel;
          break;
        }
        if (parsed.conversionId && !conversionId) conversionId = parsed.conversionId;
      }

      return {
        resourceName: String(action.resourceName),
        name: typeof action.name === "string" && action.name ? action.name : "(unnamed)",
        category: typeof action.category === "string" ? action.category : null,
        conversionId,
        conversionLabel,
      };
    })
    .filter((a): a is ConversionAction => a !== null);
}

const CONVERSION_QUERY = `
  SELECT
    conversion_action.resource_name,
    conversion_action.name,
    conversion_action.category,
    conversion_action.status,
    conversion_action.tag_snippets
  FROM conversion_action
  WHERE conversion_action.status = 'ENABLED'
`;

/**
 * The ENABLED conversion actions on this customer, each with its id and
 * label already parsed. Returns a reason rather than throwing, because
 * every failure here is something the dealer needs told plainly.
 */
export async function listConversionActions(
  customerId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<ConversionListResult> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) {
    return { ok: false, reason: "Google Ads isn't fully set up on this server yet — conversion tracking can't be read automatically." };
  }
  if (!customerId) {
    return { ok: false, reason: "No Google Ads account is linked yet. Reconnect Google Ads in Integrations." };
  }

  try {
    const res = await fetchImpl(`${API_BASE}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: CONVERSION_QUERY }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) {
      // Same deep-nesting unwrap as googleAdsMutate — Google buries
      // the only useful sentence several levels down.
      const detail = data?.error?.details?.[0]?.errors?.[0]?.message ?? data?.error?.message ?? `Google Ads API error (${res.status})`;
      return { ok: false, reason: detail };
    }

    return { ok: true, actions: mapConversionActions(data?.results) };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Couldn't reach Google Ads." };
  }
}
