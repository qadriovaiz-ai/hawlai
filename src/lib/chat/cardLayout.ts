// Which of the two card layouts an artifact gets.
//
// THE BUG THIS ENCODES. MasterChatPage had an inline early return —
// `if (artifact.kind === "record" && artifact.summary)` — that renders
// a checkmark and a sentence, with no fields and no image. Every record
// card carrying a summary took it, including the Meta ad approval card,
// so the image block further down never ran. Five rounds of diagnosis
// went past it, because every test read source text and the source
// plainly DID contain an <img> for imageUrl. It just wasn't reachable
// from that card.
//
// So the decision lives here, as a function that can be CALLED. A test
// that runs it can answer "does the ad card get the image layout?",
// which no amount of grepping could.

export type CardLayoutInput = {
  kind?: string;
  summary?: string | null;
  imageUrl?: string | null;
  approval?: unknown;
  fields?: unknown[] | null;
  groups?: unknown[] | null;
};

/**
 * True for a card that is just telling you something happened.
 *
 * "Added to your Products tab" reads better as one sentence than as an
 * icon box with a label and a fields list — that is what the compact
 * layout is for and it stays.
 *
 * False for anything carrying a DECISION: a picture to inspect, values
 * to check, an approval to give. A compact card cannot show those, and
 * showing an approval button above a summary sentence — with the thing
 * being approved invisible — is the worst of both.
 */
export function isSimpleConfirmation(artifact: CardLayoutInput): boolean {
  if (artifact.kind !== "record") return false;
  if (!artifact.summary) return false;
  if (artifact.imageUrl) return false;
  if (artifact.approval) return false;
  if (artifact.fields && artifact.fields.length > 0) return false;
  if (artifact.groups && artifact.groups.length > 0) return false;
  return true;
}
