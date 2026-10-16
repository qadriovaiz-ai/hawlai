// The sentences of a generated piece, and how to put one back short.
//
// C2 steps 4a and 4b work per SENTENCE: the extractor is given a
// numbered list and returns claims pointing at those numbers, and the
// verifier returns the numbers to drop. So the same flattening has to
// produce the same order twice, which is why it lives in one function
// rather than at each call site.
//
// NO MODEL CALL HERE. Pure string work, which is also why it is not in
// generateCopy.ts: that file is the door and is long enough.

import { pieces } from "@/lib/claims/claimCheck";

export type CopySentence = {
  /** Which output field it came from: "subject", "body", "bullets". */
  field: string;
  /** Index within that field's own list, for an array field. */
  slot: number;
  text: string;
};

/** Every string in a generated output, in a stable order, split into sentences. */
export function copySentences(output: unknown): CopySentence[] {
  const out: CopySentence[] = [];
  for (const [field, value] of Object.entries((output ?? {}) as Record<string, unknown>)) {
    // Underscore keys are Hawlai's own notes to the owner. They are not
    // copy, and running the verifier over _claimsNote would check the
    // guard's words rather than the model's — a mistake this codebase
    // has made twice before, asserting over a note that QUOTES the
    // thing it is reporting.
    if (field.startsWith("_")) continue;
    forEachString(value, 0, (text, slot) => {
      for (const sentence of pieces(text)) {
        const trimmed = sentence.trim();
        if (trimmed) out.push({ field, slot, text: trimmed });
      }
    });
  }
  return out;
}

function forEachString(value: unknown, slot: number, visit: (text: string, slot: number) => void): void {
  if (typeof value === "string") {
    if (value.trim()) visit(value, slot);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => forEachString(v, i, visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!k.startsWith("_")) forEachString(v, slot, visit);
    }
  }
}

/**
 * The same output with the named sentences gone.
 *
 * A FIELD THAT LOSES EVERY SENTENCE BECOMES EMPTY, NOT DELETED. An
 * email whose subject is removed must arrive with an empty subject the
 * caller can see and refuse, not with no subject key at all — a missing
 * key reads downstream as "this surface does not have subjects".
 */
export function withoutSentences(output: any, sentences: CopySentence[], dropIndices: number[]): any {
  const drop = new Set(dropIndices);
  if (!drop.size) return output;
  // Which exact texts to remove, per field and slot. Matching on text
  // rather than re-splitting keeps this independent of how the
  // splitting behaved the first time.
  const removeByKey = new Map<string, Set<string>>();
  sentences.forEach((s, i) => {
    if (!drop.has(i)) return;
    const key = `${s.field}#${s.slot}`;
    const set = removeByKey.get(key) ?? new Set<string>();
    set.add(s.text);
    removeByKey.set(key, set);
  });

  const strip = (text: string, key: string): string => {
    const remove = removeByKey.get(key);
    if (!remove) return text;
    const kept = pieces(text).filter((p) => !remove.has(p.trim()));
    return kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  const walk = (value: unknown, field: string, slot: number): unknown => {
    if (typeof value === "string") return strip(value, `${field}#${slot}`);
    if (Array.isArray(value)) return value.map((v, i) => walk(v, field, i));
    if (value && typeof value === "object") {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        copy[k] = k.startsWith("_") ? v : walk(v, field, slot);
      }
      return copy;
    }
    return value;
  };

  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(output ?? {})) {
    result[field] = field.startsWith("_") ? value : walk(value, field, 0);
  }
  return result;
}
