// No handler reads a parameter its own tool never declared.
//
// THE LIVE FAILURE THIS COMES FROM, 21 November 2026. The Shopify half
// of `edit_page_text` read `input.text`. That tool has no `text`
// parameter — its properties are `surface`, `page`, `edits`,
// `edit_id`. So the model had nowhere to put the new wording, the
// handler saw an empty string, and replied "Tell me what the page
// should say."
//
// WHY THAT WAS WORSE THAN A TYPO. The refusal was UNANSWERABLE: the
// tool asked for a field it never offered, so the model supplied what
// it had, got the same refusal, and tried again. The owner saw the
// same error twice with no reason — and then the chat improvised,
// telling him to paste the text into Shopify admin himself, which is
// the one thing this product's tools must never suggest.
//
// Twenty-one tests covered that branch and all of them passed. Every
// one read source strings; not one asked whether the schema offers
// what the handler reads.
//
// THREE EARLIER VERSIONS OF THIS FILE WERE WRONG, each discovered by
// re-running the original bug as a mutation. They are recorded because
// each is a trap a reader could walk back into:
//
//  1. It folded an array parameter's ITEM fields into the allowed
//     top-level names "defensively". `edits[].text` exists, so
//     `input.text` read as declared and the bug survived.
//  2. It keyed bodies by tool name in a Map. This file has TWO
//     switches over tool names — `executeTool` and the artifact-card
//     builder — so the second overwrote the first and the test was
//     reading the wrong code entirely.
//  3. It checked reads against the union of ALL tools' parameters,
//     which cannot work: `edit_collection_text` and `publish_blog_post`
//     both declare a top-level `text`, so the union contains it.
//
// And a fourth, in the regex: `/\binput\.(\w+)/` does not match
// `input?.kind`, which is how the card switch reads its input. Both
// forms are collected now.

import { describe, it, expect } from "vitest";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";
import { code } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** Top-level parameter names a tool declares. NOT its items' fields — see trap 1. */
function declaredParams(tool: any): Set<string> {
  return new Set(Object.keys(tool?.input_schema?.properties ?? {}));
}

/** Fields of an array parameter's items, read off a loop variable rather than off `input`. */
function nestedItemFields(tool: any): Set<string> {
  const names = new Set<string>();
  for (const spec of Object.values<any>(tool?.input_schema?.properties ?? {})) {
    for (const nested of Object.keys(spec?.items?.properties ?? {})) names.add(nested);
  }
  return names;
}

/** Every `input.X` AND `input?.X` — see trap 4. */
function inputReads(body: string): Set<string> {
  const read = new Set<string>();
  for (const m of body.matchAll(/\binput\s*\??\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) read.add(m[1]);
  return read;
}

/**
 * Each `case` label's body, BOUNDED AT BOTH ENDS.
 *
 * A body ends at the next case label OR at the end of its switch,
 * whichever comes first. The second bound is what trap 2 needed: with
 * only "next label", the slice for `get_report_links` ran 17,670
 * characters past the end of its switch, swallowed module-level helper
 * functions, and reported a helper's `input?.campaign_id` as that
 * tool's bug.
 *
 * The switch end is a closing brace at two-space indentation — the
 * cases themselves are at four. Verified against this file: the
 * largest body becomes `edit_page_text` at ~21k, which is genuinely
 * the largest case, and `get_report_links` drops to 580 characters.
 */
function labelBodies(): { name: string; body: string }[] {
  const src = code(BRAIN);
  const labels: [string, number][] = [];
  for (const m of src.matchAll(/case "([a-z0-9_]+)":/g)) labels.push([m[1], m.index!]);

  const out: { name: string; body: string }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const start = labels[i][1];
    const nextLabel = i + 1 < labels.length ? labels[i + 1][1] : src.length;
    const switchEnd = (() => {
      const re = /\n {2}\}/g;
      re.lastIndex = start;
      const m = re.exec(src);
      return m ? m.index : src.length;
    })();
    out.push({ name: labels[i][0], body: src.slice(start, Math.min(nextLabel, switchEnd)) });
  }
  // A label with nothing of its own shares the next one's body.
  for (let i = 0; i < out.length; i++) {
    const own = out[i].body.replace(/case "[a-z0-9_]+":/g, "").trim();
    if (own.length < 5 && i + 1 < out.length) out[i] = { name: out[i].name, body: out[i + 1].body };
  }
  return out;
}

/** Labels that share one body, so each may read any of the group's parameters. */
function sharedGroups(): string[][] {
  const src = code(BRAIN);
  const groups: string[][] = [];
  for (const m of src.matchAll(/((?:case "[a-z0-9_]+":\s*)+)\{/g)) {
    const names = [...m[1].matchAll(/case "([a-z0-9_]+)":/g)].map((x) => x[1]);
    if (names.length > 1) groups.push(names);
  }
  return groups;
}

describe("a handler cannot read a parameter the model was never offered", () => {
  it("THE LOAD-BEARING ONE: every input.X is declared by the tool that reads it", () => {
    const bodies = labelBodies();
    const groups = sharedGroups();
    const schemaOf = new Map((TOOLS as any[]).map((t) => [t.name, t]));

    const problems: string[] = [];
    for (const { name, body } of bodies) {
      if (!schemaOf.has(name)) continue; // a label that is not a tool

      // A shared body may read any of its group's parameters: either
      // tool could have been the one called.
      const group = groups.find((g) => g.includes(name)) ?? [name];
      const allowed = new Set<string>();
      for (const member of group) {
        const schema = schemaOf.get(member);
        if (schema) for (const p of declaredParams(schema)) allowed.add(p);
      }

      for (const key of inputReads(body)) {
        if (!allowed.has(key)) {
          problems.push(`${name} reads input.${key}, which it does not declare (allowed: ${[...allowed].sort().join(", ")})`);
        }
      }
    }

    expect(
      [...new Set(problems)],
      `A handler reads a parameter the model cannot send. The refusal that follows is UNANSWERABLE — the tool asks for a field it never offered, so the model retries and then improvises:\n  ${problems.join(
        "\n  "
      )}`
    ).toEqual([]);
  });

  it("A NESTED FIELD NAME IS NOT A TOP-LEVEL PARAMETER", () => {
    // Trap 1, stated as an assertion. `text` is a real field of an
    // `edits` ENTRY — read as `edit.text` off a loop variable — and is
    // NOT a top-level parameter of edit_page_text. So `input.text`
    // must still be reported.
    const editTool = (TOOLS as any[]).find((t) => t.name === "edit_page_text")!;
    expect(nestedItemFields(editTool).has("text"), "edits[].text should exist").toBe(true);
    expect(declaredParams(editTool).has("text"), "edit_page_text has a top-level `text` again").toBe(false);
  });

  it("BOTH SWITCHES ARE READ, and bodies stop at the end of their own switch", () => {
    // Traps 2 and 3. Several names appear twice, and a body that ran
    // past its switch picked up module-level helpers.
    const bodies = labelBodies();
    const names = bodies.map((b) => b.name);
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    expect(twice.length, "only one switch is being read").toBeGreaterThan(5);

    // The specific false positive that bound removed.
    const reportLinks = bodies.filter((b) => b.name === "get_report_links");
    expect(reportLinks.length).toBeGreaterThan(0);
    for (const b of reportLinks) {
      expect(b.body.length, "a body is running past the end of its switch").toBeLessThan(8000);
    }
  });

  it("does not pass vacuously — real vocabularies on both sides", () => {
    const bodies = labelBodies();
    const schemaOf = new Map((TOOLS as any[]).map((t) => [t.name, t]));
    const dispatched = bodies.filter((b) => schemaOf.has(b.name));
    expect(dispatched.length).toBeGreaterThanOrEqual(40);
    // Reads really are being collected, including the optional chain.
    expect([...inputReads("const k = input?.kind; const j = input.page;")].sort()).toEqual(["kind", "page"]);
    // And the biggest body is the one that should be. `read_page`
    // SHARES it, so both labels carry the same 21k body and either
    // may sort first — asserting one name specifically was wrong.
    const biggest = bodies.slice().sort((a, b) => b.body.length - a.body.length)[0];
    expect(["read_page", "edit_page_text"]).toContain(biggest.name);
    expect(biggest.body).toContain("textWantsShopify");
  });
});
