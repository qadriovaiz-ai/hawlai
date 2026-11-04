// FOLLOWING A CALL, INSTEAD OF GREPPING ONE LINE — S6/P0.
//
// THE GAP THIS CLOSES, verified on 4 November 2026.
// tests/approvalCoverage.test.ts greps each chat tool's `case` body for
// the symbols that reach the outside world. Two tools' case bodies are
// two lines long:
//
//     case "activate_meta_campaign":
//       return switchMetaCampaign("activate", ctx, supabase, input);
//
// `switchMetaCampaign` is where the money step lives, and it IS gated —
// it goes through `createPublishAction`. But that grep cannot see it, so
// the test is not what keeps it gated: delete the gate and the test
// stays green while chat spends money unasked.
//
// A ONE-HOP GREP IS DEFEATED BY A ONE-LINE DELEGATION. So this walks.
//
// HOW IT WALKS, AND WHERE IT STOPS. From a starting body it collects
// every identifier that is called, resolves the ones this repo declares,
// and descends — with a visited set and a depth cap, because the graph
// from `masterBrainV2.ts` reaches most of `src/lib` within four hops.
//
// DOORS ARE WALLS. It never descends into a door (an Action), which is
// what makes the result mean something: if a sender is still reachable
// with the doors walled off, there is a path to the outside world that
// does not go through an Action. That is the property, stated as the
// plan states it, rather than "a door is mentioned somewhere nearby".
//
// WHAT IT IS NOT. This is not a type-aware call graph. It resolves by
// NAME, so two functions with one name are conflated, and a call through
// a variable or a dynamic key is invisible. Both failure modes are in
// the direction of finding MORE paths than exist (a conflated name adds
// edges), which is the safe direction for a guard — a false alarm is
// read by a person, a missed sender is not. Where it genuinely cannot
// see, the allowlist carries the reason and the date.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "./source";

/** Every .ts/.tsx file under a directory, comments already stripped. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(path);
        continue;
      }
      if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(path);
    }
  };
  walk(root);
  return out;
}

/** The body of a braced block starting at or after `from`. */
function blockAt(src: string, from: number): string {
  const open = src.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

export type FunctionIndex = Map<string, string[]>;

/**
 * Every function this repo declares, by name, with its body.
 *
 * A NAME CAN HOLD SEVERAL BODIES, and they are all kept. Picking one
 * would be guessing; keeping both means a sender reachable through
 * EITHER is reported, which is the safe direction.
 *
 * Built once and cached: the walk is called 59 times and reading
 * `src/` each time made the first version of this take 40 seconds.
 */
let cached: FunctionIndex | null = null;

export function functionIndex(root = "src"): FunctionIndex {
  if (cached) return cached;
  const index: FunctionIndex = new Map();
  const add = (name: string, body: string) => {
    if (!name || !body) return;
    const list = index.get(name) ?? [];
    list.push(body);
    index.set(name, list);
  };

  for (const file of sourceFiles(root)) {
    const src = code(file);
    // function f(…) {…}  /  export async function f(…) {…}
    for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g)) {
      add(m[1], blockAt(src, m.index! + m[0].length));
    }
    // const f = (…) => {…}  /  const f = async (…) => {…}
    for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?\(/g)) {
      const arrow = src.indexOf("=>", m.index!);
      if (arrow < 0) continue;
      // Only a braced arrow body is a block worth descending into; a
      // one-expression arrow is covered by the call collection below.
      const nextBrace = src.indexOf("{", arrow);
      const nextLine = src.indexOf("\n", arrow);
      if (nextBrace > -1 && (nextLine < 0 || nextBrace < nextLine + 2)) {
        add(m[1], blockAt(src, arrow));
      }
    }
  }
  cached = index;
  return index;
}

/**
 * Identifiers that are CALLED in this body, with renames resolved.
 *
 * ALIASES ARE THE WHOLE REASON THIS IS NOT A ONE-LINE REGEX, and the
 * first version of this file missed them. `masterBrainV2.ts` imports
 * almost everything through a renaming destructure:
 *
 *     const { setCampaignStatus: setStatus } = await import("../ads/campaignStatus");
 *     ...
 *     const result = await setStatus({ ... });
 *
 * A walk that collected `setStatus` and nothing else would report a
 * clean path to the outside world. Any sender could be hidden behind
 * one word, so every `{ A: B }` in the body maps a call to `B` back
 * onto `A` as well.
 */
export function callsIn(body: string): string[] {
  const names = new Set<string>();
  for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  // Property calls — `supabase.from(...)`, `platform.execute(...)` —
  // are collected by their property name too, so a door or a sender
  // reached as a method is still seen.
  for (const m of body.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);

  // `{ realName: localName }` inside a destructure, in either a
  // `const { … } =` or an import. The value side is what the body
  // calls; the key side is what this walk is looking for.
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/g)) {
    if (names.has(m[2])) names.add(m[1]);
  }
  return [...names];
}

export type WalkResult = {
  /** Target names reached without passing a wall. */
  found: string[];
  /** Wall names encountered, so a caller can say which door was used. */
  walls: string[];
  /** True when the cap stopped the walk before it ran out of graph. */
  truncated: boolean;
};

/**
 * Walk out from a body looking for `targets`, treating `walls` as the
 * end of the road.
 *
 * `walls` are the doors. The walk does not enter them, so a target is
 * only `found` when there is a path to it that never goes through one.
 */
export function reachable(
  start: string,
  targets: string[],
  walls: string[],
  opts: { index?: FunctionIndex; maxDepth?: number; maxBodies?: number } = {}
): WalkResult {
  const index = opts.index ?? functionIndex();
  const maxDepth = opts.maxDepth ?? 6;
  const maxBodies = opts.maxBodies ?? 4000;

  const wanted = new Set(targets);
  const wall = new Set(walls);
  const found = new Set<string>();
  const hitWalls = new Set<string>();
  const seen = new Set<string>();
  let bodies = 0;
  let truncated = false;

  let frontier: { body: string; depth: number }[] = [{ body: start, depth: 0 }];
  while (frontier.length) {
    const next: { body: string; depth: number }[] = [];
    for (const { body, depth } of frontier) {
      for (const name of callsIn(body)) {
        if (wanted.has(name)) found.add(name);
        if (wall.has(name)) {
          hitWalls.add(name);
          // A WALL IS NOT DESCENDED INTO. That is the whole mechanism.
          continue;
        }
        if (depth >= maxDepth) {
          truncated = true;
          continue;
        }
        for (const [i, declared] of (index.get(name) ?? []).entries()) {
          const key = `${name}#${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          bodies += 1;
          if (bodies > maxBodies) {
            truncated = true;
            continue;
          }
          next.push({ body: declared, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }

  return { found: [...found].sort(), walls: [...hitWalls].sort(), truncated };
}
