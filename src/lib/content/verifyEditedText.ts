// CHECKING WORDING THE MODEL WROTE FOR A PAGE — S3/P4.
//
// THE FOUNDER'S RULE, 22 October 2026: "owner ke apne exact words
// untouched, model-written/reworded edit fact-check se guzre."
//
// The provenance half of that already existed and is right:
// `edit_page_text`'s `writtenByOwner` flag saves the owner's dictated
// wording verbatim with a warning, and its own description carries the
// subtle part — "approving a draft is approving its publication, not
// vouching for it." This file is the other half.
//
// WHAT WAS MISSING. Model-written edit text went through the OLDER
// claims layer (`stripUnsupported`), not the fact-bound verifier S1 and
// S2 built. The difference is not theoretical: reading this product's
// own live site, the page says its wax "burns cleaner, slower, and
// safer than mass-market paraffin" and "Better for your home, better
// for the air you breathe" — a comparison claim and a benefit claim,
// the two classes the old layer lets through and nothing in the licence
// table can ever support.
//
// WHY THERE IS NO SELECT STEP HERE, and why that turned out not to
// matter. C2's pipeline is Select -> Write -> extract -> verify, and an
// edit has nothing to select: the words already exist and the owner
// asked for this line. So `approved` is empty and every record goes to
// the judge as available evidence. I expected that to refuse everything
// and it does not, because two pieces of the verifier were built for
// exactly this shape:
//
//   figures      the records fallback, whose comment states the rule —
//                "ONLY WHAT IS IN THE RECORD MAY BE WRITTEN, not only
//                what Select happened to pick"
//   everything   rubric rule 9 — "THE SECOND HEADING IS NOT WEAKER THAN
//   else         THE FIRST ... a claim stated by anything under it is
//                ENTAILED exactly as if it had been chosen"
//
// Both were added after real incidents where unchosen records were
// treated as weaker evidence than chosen ones. An edit is the case
// where there are no chosen ones at all.
//
// REFUSED, NOT TRIMMED. For generated copy an unsupported sentence is
// dropped and the piece goes on. An edit is one line the owner asked
// for, and half of it is worse than none: they would approve a card
// showing wording nobody wrote. So the edit is refused with the reason,
// and the model is told to write it again from what the records
// actually support — the shape the edit path already uses when its old
// guard emptied a line.

import { copySentences } from "@/lib/content/copySentences";
import { extractClaims, extractUnlicensable } from "@/lib/facts/extractClaims";
import { verifyClaims } from "@/lib/facts/verifyClaims";
import { contextFromFacts } from "@/lib/facts/getContext";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

export type EditedTextVerdict = {
  /** Nothing was refused and the check actually ran. */
  ok: boolean;
  /** One entry per refused sentence, in the owner's terms. */
  refused: { text: string; why: string }[];
  /**
   * The extractor or the judge could not be reached.
   *
   * NOT THE SAME AS CLEAN, and never reported as it. F-01: silence read
   * as approval is how an unchecked claim reaches a customer. The
   * caller refuses the edit rather than publishing unverified wording
   * to a live page.
   */
  unverified: boolean;
  costInr: number;
};

export async function verifyEditedText(opts: {
  /** The new wording, one entry per edited line. */
  texts: string[];
  facts: BusinessFacts;
  dealershipId: string;
  /** What the owner asked for, so getContext can slice to the right product. */
  topic: string;
  logContext?: { supabase: any; dealershipId: string } | null;
}): Promise<EditedTextVerdict> {
  const texts = opts.texts.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!texts.length) return { ok: true, refused: [], unverified: false, costInr: 0 };

  // THE DOOR'S OWN ENUMERATION, not a second one. copySentences is what
  // splits a generated piece into the numbered sentences the extractor
  // and the verifier both address, and re-deriving that here is the
  // B18 fault this codebase has paid for four times - the grading
  // sheet, the output gate, the records box, the estimator.
  const sentences = copySentences({ text: texts } as any);
  if (!sentences.length) return { ok: true, refused: [], unverified: false, costInr: 0 };

  const ctx = contextFromFacts(opts.dealershipId, opts.facts, { kind: "page_text", topic: opts.topic });

  const log = opts.logContext ?? null;
  const [firstPass, secondNet] = await Promise.all([
    extractClaims(
      sentences.map((s) => s.analysed),
      { logContext: log }
    ),
    extractUnlicensable(
      sentences.map((s) => s.analysed),
      { logContext: log }
    ),
  ]);

  let costInr = (firstPass.ok ? firstPass.costInr : 0) + (secondNet.ok ? secondNet.costInr : 0);
  if (!firstPass.ok) {
    // The net alone reads four classes out of fourteen, so on its own it
    // would mean "nothing else was checked".
    return { ok: false, refused: [], unverified: true, costInr };
  }
  const claims = secondNet.ok ? [...firstPass.claims, ...secondNet.claims] : firstPass.claims;

  // NO CLAIMS IS NOT AUTOMATICALLY CLEAN, but for an edit it can be:
  // "Open Monday to Saturday" rewritten as "Open Mon-Sat" states
  // nothing new. The door's own escalation exists because a SELECTION
  // was made and must have produced something; here there is no
  // selection to compare against, so an empty extraction on ordinary
  // wording is taken at face value.
  if (!claims.length) return { ok: true, refused: [], unverified: false, costInr };

  const verified = await verifyClaims(claims, [], { logContext: log, records: ctx.records });
  costInr += verified.costInr;
  if (verified.degraded) return { ok: false, refused: [], unverified: true, costInr };

  const refused: { text: string; why: string }[] = [];
  for (const index of [...new Set(verified.unsupportedSentences)]) {
    const sentence = sentences[index];
    if (!sentence) continue;
    const why = verified.verdicts
      .filter((v) => v.claim.sentenceIndex === index && v.verdict === "unsupported")
      .map((v) => v.reason)
      .join(" ");
    refused.push({ text: sentence.text, why: why || "nothing on record supports it" });
  }

  return { ok: refused.length === 0, refused, unverified: false, costInr };
}

/** What the owner is told when an edit was refused. */
export function editRefusalNote(verdict: EditedTextVerdict): string {
  if (verdict.unverified) {
    return "I couldn't check that wording against your records just now, so I haven't put it on the page. Try again in a moment.";
  }
  const lines = verdict.refused.map((r) => `"${r.text}" — ${r.why}`);
  return `I didn't put that on the page, because your records don't back it up:\n${lines.join("\n")}`;
}
