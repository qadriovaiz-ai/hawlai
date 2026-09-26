// Which channels suit this business, decided from its own facts
// (Brain, Phase 3).
//
// The vision says: don't ask the owner "which channel?" — work it out.
// The danger in doing that is the category cliché: "candle shop, so
// Instagram", which is a guess wearing a recommendation's clothes and is
// wrong often enough to cost real money.
//
// So every line of reasoning here points at something countable: how the
// business makes money, whether its catalogue has photographs, whether
// people are already searching and finding it, which sources have
// actually converted leads, and what is already connected. A channel
// with nothing behind it is "worth testing" and says what to measure —
// never "recommended", which implies evidence that isn't there.
//
// The strongest input is the business's OWN history: a source that has
// really converted outranks every rule below, because it already worked
// here.

import type { Diagnosis } from "./diagnosis";
import type { QueryRow } from "@/lib/seo/searchConsole";
import { intentOf } from "@/lib/opportunities/marketOpportunities";

export type ChannelKey =
  | "google_search"
  | "local_seo"
  | "aeo"
  | "meta_ads"
  | "instagram"
  | "whatsapp"
  | "email"
  | "calling";

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  google_search: "Google Search ads",
  local_seo: "Local SEO",
  aeo: "Being named in AI answers",
  meta_ads: "Facebook / Instagram ads",
  instagram: "Instagram (organic)",
  whatsapp: "WhatsApp",
  email: "Email",
  calling: "Phone follow-up",
};

/** proven = it has converted here. fits = the facts point at it. test = worth trying, nothing behind it yet. */
export type Standing = "proven" | "fits" | "test";

export type ChannelFit = {
  channel: ChannelKey;
  label: string;
  standing: Standing;
  /** Each reason names the fact it rests on. */
  reasons: string[];
  /** What the owner needs before this can start, if anything. */
  needs: string[];
  /** What to measure to find out whether it worked — always present for "test". */
  measure: string | null;
};

export type FitInput = {
  diagnosis: Diagnosis | null;
  queries: QueryRow[];
  catalogue: { name: string; images?: string[]; price?: number; kind?: string | null }[];
  city: string | null;
  /** What is already wired up, so "needs" is honest. */
  connected: { meta?: boolean; email?: boolean; whatsapp?: boolean; searchConsole?: boolean };
  /** People on record who could be emailed or messaged at all. */
  contacts: { leads: number; customers: number };
};

/** Searches for this business that read as someone ready to buy. */
export function buyingSearches(queries: QueryRow[]): QueryRow[] {
  return (queries ?? []).filter((q) => intentOf(q.query) === "transactional" && q.impressions > 0);
}

/** A source that really converted leads here, from the diagnosis's own counts. */
function provenSources(d: Diagnosis | null): string[] {
  return (d?.sources ?? []).filter((s) => s.ranked && (s.conversion ?? 0) > 0).map((s) => s.source.toLowerCase());
}

const SOURCE_TO_CHANNEL: { match: RegExp; channel: ChannelKey }[] = [
  { match: /google|search|seo/, channel: "google_search" },
  { match: /facebook|meta|fb/, channel: "meta_ads" },
  { match: /instagram|insta|ig/, channel: "instagram" },
  { match: /whatsapp|wa/, channel: "whatsapp" },
  { match: /email|newsletter/, channel: "email" },
  { match: /call|phone/, channel: "calling" },
];

export function channelFit(input: FitInput): ChannelFit[] {
  const models = input.diagnosis?.models ?? [];
  const catalogue = input.catalogue ?? [];
  const withPhotos = catalogue.filter((p) => (p.images ?? []).length > 0).length;
  const services = catalogue.filter((p) => p.kind === "service").length;
  const buying = buyingSearches(input.queries);
  const buyingImpressions = buying.reduce((n, q) => n + q.impressions, 0);
  const proven = provenSources(input.diagnosis);
  const provenChannels = new Set<ChannelKey>();
  for (const source of proven) {
    const hit = SOURCE_TO_CHANNEL.find((m) => m.match.test(source));
    if (hit) provenChannels.add(hit.channel);
  }

  const out: ChannelFit[] = [];
  const add = (channel: ChannelKey, reasons: string[], needs: string[], measure: string | null, fits: boolean) => {
    // The business's own history wins over any rule here.
    const standing: Standing = provenChannels.has(channel) ? "proven" : fits ? "fits" : "test";
    const own = input.diagnosis?.sources.find((s) => SOURCE_TO_CHANNEL.find((m) => m.match.test(s.source.toLowerCase()))?.channel === channel && s.ranked);
    const withHistory = standing === "proven" && own
      ? [`${own.leads} leads from ${own.source} converted at ${own.conversion}% — this has already worked here`, ...reasons]
      : reasons;
    out.push({
      channel,
      label: CHANNEL_LABEL[channel],
      standing,
      reasons: withHistory,
      needs,
      measure: standing === "test" ? measure : null,
    });
  };

  // Search: decided by whether anyone is actually searching, not by category.
  add(
    "google_search",
    buying.length
      ? [`${buying.length} buying-intent searches already reach this business (${buyingImpressions} impressions in 28 days) — the demand is counted, not assumed`]
      : ["No buying-intent search demand is on record for this business yet"],
    input.connected.searchConsole ? [] : ["Connect Search Console so this is decided from real searches rather than guesswork"],
    "Run a small budget for two weeks and compare cost per lead against your other sources",
    buying.length > 0
  );

  add(
    "local_seo",
    input.city
      ? [`This business is in ${input.city}, so "near me" searches apply to it`, ...(buying.some((q) => /near me|in \w+/i.test(q.query)) ? ["Local wording already appears in searches reaching it"] : [])]
      : ["No city is on record, so local search can't be aimed anywhere"],
    input.city ? [] : ["Add the city in Settings"],
    "Watch whether impressions for local wording rise over the next month",
    Boolean(input.city)
  );

  add(
    "aeo",
    ["AI assistants answer buying questions for every category, and being named costs nothing per query"],
    [],
    "Run the AEO check monthly and watch whether the number of questions naming you moves",
    // Always worth doing, but stated as a test until presence is measured.
    false
  );

  // Visual channels: decided by whether there are photographs, not by taste.
  add(
    "instagram",
    withPhotos > 0
      ? [`${withPhotos} of ${catalogue.length} catalogue items have photographs, which is what this channel runs on`]
      : ["Nothing in the catalogue has a photograph yet, and this channel is photographs"],
    withPhotos > 0 ? [] : ["Add photographs to the catalogue"],
    "Post for a month and check how many enquiries name Instagram as where they found you",
    withPhotos > 0
  );

  add(
    "meta_ads",
    withPhotos > 0
      ? [`${withPhotos} items have photographs to advertise with`, ...(models.includes("products") ? ["Products are bought on impulse more often than services are booked, which suits paid social"] : [])]
      : ["Paid social needs a picture, and none of the catalogue has one yet"],
    input.connected.meta ? [] : ["Connect the Facebook Page in Settings"],
    "Spend a small amount for two weeks and compare cost per lead with search",
    withPhotos > 0 && Boolean(input.connected.meta)
  );

  // Conversation channels: decided by whether there is anyone to talk to.
  const reachable = input.contacts.leads + input.contacts.customers;
  add(
    "whatsapp",
    reachable > 0
      ? [`${reachable} people on record to message`, ...(services > 0 ? ["Services get booked in conversation more often than bought in one click"] : [])]
      : ["Nobody is on record to message yet"],
    ["Hawlai drafts WhatsApp messages but cannot send them — you send these yourself"],
    "Count how many of the people you message reply",
    reachable > 0
  );

  add(
    "email",
    reachable > 0
      ? [`${reachable} people on record, of whom those who consented can be emailed`]
      : ["Nobody is on record to email yet"],
    input.connected.email ? [] : ["Connect email sending in Settings"],
    "Watch the reply rate on the first two sends before writing a third",
    reachable > 0 && Boolean(input.connected.email)
  );

  add(
    "calling",
    input.contacts.leads > 0
      ? [`${input.contacts.leads} leads on record with phone numbers to call`, ...(models.includes("b2b") ? ["B2B decisions are usually made in conversation, not on a page"] : [])]
      : ["No leads on record to call"],
    [],
    "Call ten and count how many turn into something",
    input.contacts.leads > 0
  );

  // Proven first, then what the facts support, then what is untested.
  const order: Record<Standing, number> = { proven: 0, fits: 1, test: 2 };
  return out.sort((a, b) => order[a.standing] - order[b.standing]);
}

/** Channels worth putting money behind, strongest first. */
export function spendable(fits: ChannelFit[]): ChannelFit[] {
  const paid = new Set<ChannelKey>(["google_search", "meta_ads"]);
  return fits.filter((f) => paid.has(f.channel) && f.standing !== "test");
}
