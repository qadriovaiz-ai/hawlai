// TEXT THE SAME COLOUR AS THE THING IT SITS ON.
//
// THE INCIDENT, 6 November 2026. S7/P6's card rendered with its body
// text, its badges and its numbers all visible — and the action's NAME
// nowhere, because I wrote the card as `bg-slate-900` with a
// `text-slate-900` title. The founder opened the page and reported "sirf
// generic shield-box dikh raha hai".
//
// WHY THAT IS NOT AN OBVIOUS MISTAKE TO MAKE AND THEN SEE.
// tailwind.config.ts INVERTS the slate scale for this app's dark theme:
//
//     slate-50:  #0b0b0f   (near-black — a BACKGROUND)
//     slate-900: #f2f2f4   (near-white — a TEXT colour)
//
// So `bg-slate-900` is a near-WHITE surface, and every habit from every
// other Tailwind codebase says it is near-black. Put the two together
// on one element and the text is the colour of its own background. No
// type error, no failing test, no console warning: it renders, and the
// words are simply not there.
//
// WHAT THIS CHECKS, and it is deliberately narrow: ONE element's own
// class list claiming both a background and a foreground from the ends
// of the scale that now collide. Not "is this contrast good" — that
// needs a renderer and a judgement — just the mechanical case of
// `bg-X` and `text-X` naming the same shade, which is always a mistake
// and never a style choice.
//
// IT IS NOT A LINT RULE because this repo has none, and a test is the
// thing that runs on every commit here.
//
// READING THROUGH code(), AND sourceGrepDiscipline.test.ts CAUGHT THAT
// IT WAS NOT. Stripping comments is not a formality here: this file's
// own header names `bg-slate-900` and `text-slate-900` while explaining
// the bug, and so does the comment above the card that caused it. A
// guard that read raw source would report the explanation as an
// offence — rule 8's exact shape, pointing at itself.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { code } from "./helpers/source";

/** Every .tsx under src/, which is where className strings live. */
function componentFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...componentFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * The class lists in one file, as written.
 *
 * MATCHED ON `className="…"` AND ON TEMPLATE LITERALS, because a
 * conditional class list is where a colour pair hides most easily. A
 * className built by a helper function is not caught, and that is a
 * stated limit rather than an oversight: resolving those needs the
 * program, not the text.
 */
function classLists(src: string): string[] {
  // The caller hands this `code(file)`, so comments are already gone —
  // see the note on READING THROUGH code() below.
  const out: string[] = [];
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  // A ternary inside a template literal produces two alternatives; both
  // halves are already inside the captured text, which is what matters
  // — a pair that collides in either branch collides.
  return out;
}

/**
 * The shades that are backgrounds and the ones that are text, in THIS
 * repo's inverted scale.
 *
 * Read from the config rather than hardcoded, so a future re-theme
 * fails this test instead of silently making it wrong.
 */
function invertedScale(): Record<string, string> {
  const config = code("tailwind.config.ts");
  const block = config.slice(config.indexOf("slate: {"), config.indexOf("}", config.indexOf("slate: {")));
  const scale: Record<string, string> = {};
  for (const m of block.matchAll(/(\d+):\s*"(#[0-9a-fA-F]{6})"/g)) scale[m[1]] = m[2];
  return scale;
}

/** How light a hex colour is, 0 (black) to 255 (white). */
function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

describe("the inverted slate scale cannot make text invisible", () => {
  const scale = invertedScale();

  it("THE SCALE REALLY IS INVERTED, which is the premise of everything below", () => {
    // If somebody un-inverts it one day, every assertion here is about
    // a hazard that no longer exists — and this test should say so
    // rather than keep passing for the wrong reason.
    expect(Object.keys(scale).length, "the slate scale was not found in tailwind.config.ts").toBeGreaterThan(8);
    expect(lightness(scale["900"]), "slate-900 is no longer the light end").toBeGreaterThan(200);
    expect(lightness(scale["50"]), "slate-50 is no longer the dark end").toBeLessThan(60);
  });

  it("NO ELEMENT GIVES ITSELF A BACKGROUND AND A FOREGROUND OF THE SAME SHADE", () => {
    // The exact fault: `bg-slate-900` with `text-slate-900` renders
    // white on white. It is never a style choice.
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      for (const list of classLists(code(file))) {
        for (const m of list.matchAll(/\bbg-slate-(\d+)\b/g)) {
          const shade = m[1];
          if (new RegExp(`\\btext-slate-${shade}\\b`).test(list)) {
            offenders.push(`${file}: bg-slate-${shade} with text-slate-${shade}`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("AND NOTHING PUTS WHITE TEXT ON THE LIGHT END OF THE SCALE", () => {
    // `bg-slate-900 text-white` reads as dark-with-white-text in every
    // other Tailwind codebase and is white-on-white in this one. The
    // light end is 800 and 900: #dcdce1 and #f2f2f4.
    const light = Object.entries(scale)
      .filter(([, hex]) => lightness(hex) > 200)
      .map(([shade]) => shade);
    expect(light.length, "no shade is at the light end any more").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of componentFiles()) {
      for (const list of classLists(code(file))) {
        for (const shade of light) {
          if (new RegExp(`\\bbg-slate-${shade}\\b`).test(list) && /\btext-white\b/.test(list)) {
            offenders.push(`${file}: bg-slate-${shade} with text-white`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("and the card chrome has a shared class, so it does not have to be remembered", () => {
    // The deeper fix. The bug happened because the card's background
    // was written by hand; `.card` is the near-black surface every
    // other card on that page uses, and a component that uses it cannot
    // get this wrong.
    // `code()` strips /* */ blocks, which is what a .css file uses.
    const css = code("src/app/globals.css");
    const card = css.slice(css.indexOf(".card {"), css.indexOf("}", css.indexOf(".card {")));
    expect(card).toMatch(/bg-slate-100/);
    expect(lightness(scale["100"]), ".card is no longer a dark surface").toBeLessThan(60);
  });
});
