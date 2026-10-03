// The pattern that threw ₹27 of paid work away, kept out for good.
//
// Every agent read its model replies the same three ways, and all three
// are variants of one mistake:
//
//   const jsonMatch = text.match(/\{[\s\S]*\}/);
//   const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "");
//   const parsed = JSON.parse(clean);
//
// The match is GREEDY — first "{" in the whole reply to the last "}" —
// so a web-search reply, which is many text blocks with prose and search
// results between them, can have two JSON fragments spliced into one
// invalid span. JSON.parse then throws inside a catch that returns a
// generic fallback, and a completed, paid-for call disappears behind a
// sentence that names nothing. That is the Karessa Candles failure of
// 3 Oct 2026, and it was reachable from thirty-eight call sites.
//
// A pattern removed thirty-eight times comes back the thirty-ninth, by
// someone copying the agent next to theirs. So it is a test.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/** Source files as git knows them — the same approach metaTokenEncryption uses. */
function sourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => fs.existsSync(path.join(process.cwd(), f)));
}

/**
 * The module that documents the pattern in order to forbid it.
 *
 * Excluded by path rather than by a comment check: its header quotes all
 * three variants verbatim, which is the clearest way to explain what not
 * to do and would otherwise be the only thing this test ever caught.
 */
const HOME_OF_THE_PARSER = "src/lib/ai/modelJson.ts";

const GREEDY = "match(/\\{[\\s\\S]*\\}/)";

function codeLines(source: string): { line: string; number: number }[] {
  return source.split("\n").map((line, i) => ({ line, number: i + 1 })).filter(({ line }) => {
    const t = line.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });
}

describe("the greedy JSON match is gone and stays gone", () => {
  it("appears in no source file outside the parser that replaced it", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file === HOME_OF_THE_PARSER) continue;
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      if (!source.includes(GREEDY)) continue;
      for (const { line, number } of codeLines(source)) {
        if (line.includes(GREEDY)) offenders.push(`${file}:${number}  ${line.trim().slice(0, 100)}`);
      }
    }
    expect(offenders, `Use parseModelJson from @/lib/ai/modelJson instead:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("and neither does a JSON.parse of a variable called clean", () => {
    // The second half of the pattern, caught separately: a file could
    // drop the greedy match and keep the bare parse.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file === HOME_OF_THE_PARSER) continue;
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      if (!source.includes("JSON.parse(clean)")) continue;
      for (const { line, number } of codeLines(source)) {
        if (line.includes("JSON.parse(clean)")) offenders.push(`${file}:${number}  ${line.trim().slice(0, 100)}`);
      }
    }
    expect(offenders, `Use parseModelJson from @/lib/ai/modelJson instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("the agents read their replies through the one parser", () => {
  it("every agent that reads JSON from a model imports it", () => {
    // Not a count — a count goes stale the moment an agent is added.
    // The question is whether anything parses a model reply WITHOUT the
    // parser, which is what the two tests above ask. This one checks the
    // parser is genuinely in use rather than written and ignored, the
    // way isPerplexityConfigured was for months.
    const users = sourceFiles().filter((file) => {
      if (file === HOME_OF_THE_PARSER) return false;
      return fs.readFileSync(path.join(process.cwd(), file), "utf8").includes('from "@/lib/ai/modelJson"');
    });
    expect(users.length).toBeGreaterThanOrEqual(25);
  });

  it("surfaces the cause when a reply can't be read", () => {
    // Each converted site keeps its own fallback, so the shared promise
    // is narrower than "shows the owner an error": it is that the real
    // cause reaches the log instead of being swallowed by the catch.
    const silent: string[] = [];
    for (const file of sourceFiles()) {
      if (file === HOME_OF_THE_PARSER) continue;
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      if (!source.includes("parseModelJson(")) continue;
      if (!source.includes("parsedReply.cause") && !source.includes("read.cause") && !source.includes("viaPerplexity.ok")) {
        silent.push(file);
      }
    }
    expect(silent, `these parse a reply but never report why it failed:\n${silent.join("\n")}`).toEqual([]);
  });
});
