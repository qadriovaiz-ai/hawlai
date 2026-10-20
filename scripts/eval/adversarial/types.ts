// AN ADVERSARIAL CASE, AND WHAT MAKES IT DIFFERENT FROM A CASE.
//
// docs/PLAN-S2-ADVERSARIAL.md §3. The existing eval cases in
// ../cases.ts produce copy and a human decides whether each sentence is
// true. That is the right instrument for grading and the wrong one for
// regression: it cannot run on a commit, it costs Rs 12-17, and it only
// ever tests the sentences a model happened to write that day.
//
// AN ADVERSARIAL CASE CARRIES ITS OWN ANSWER. It is a sentence a writer
// plausibly would produce, against a fixture whose records make the
// trap real, with the correct outcome stated: this must survive, or
// this must be removed. That one field is what makes two hundred and
// eighty cases affordable, because most of them can then be scored by
// machine.
//
// THE HONESTY CONSTRAINT I HAVE TO HOLD MYSELF TO. These are written
// from the SHAPES, never from a run's output. A case written from
// copy I have already seen tests my memory of that run rather than the
// pipeline, and B18 — six wrong instruments — is what that mistake
// looks like. Where a case does come from a real run (the handful the
// founder graded) it says so, because that provenance is evidence
// rather than a shortcut.

import type { ShapeId } from "../shapes";
import type { Fixture } from "../fixtures";

export type Surface = "whatsapp" | "lead_message" | "social" | "product_description";

/**
 * What the right answer is.
 *
 * BOTH DIRECTIONS MATTER EQUALLY, and that is the lesson of twenty-six
 * runs: not one of their faults was the model inventing a fact. Every
 * one was a guard refusing something true, or a gap where nothing
 * looked. A case set with only `must_be_removed` cases would have
 * measured none of them.
 */
export type Direction = "must_survive" | "must_be_removed";

/**
 * Which code check settles a tier-1 case.
 *
 * Named per case rather than inferred from the shape, because one shape
 * can be caught in two places and a test that does not know which one
 * it is asserting is not much of a test.
 */
export type CodeCheck = "introducedWords" | "notCopy";

export type AdversarialCase = {
  /** Stable, and it appears in failures: surface-fixture-number. */
  id: string;
  shape: ShapeId;
  fixture: Fixture;
  surface: Surface;
  /** What the owner asked for, so a reader can see why a writer wrote this. */
  topic: string;
  /** The sentence under test, as copy. */
  sentence: string;
  direction: Direction;
  /** Why that is the right answer. Reaches a human reading a red test. */
  because: string;
  /**
   * The free check that settles it, or absent when only a model can.
   *
   * A case with no `check` is a tier-2 case: it waits for the one
   * batched paid run rather than running on every commit.
   */
  check?: CodeCheck;
  /**
   * Set when the sentence is quoted from a real run rather than written
   * from the shape. Provenance, not a shortcut — these are the ones a
   * human has already graded.
   */
  graded?: string;
};

/** Every case whose answer a free test can settle. */
export const tier1 = (cases: AdversarialCase[]): AdversarialCase[] => cases.filter((c) => Boolean(c.check));

/** Every case that needs a model, for the one batched paid run. */
export const tier2 = (cases: AdversarialCase[]): AdversarialCase[] => cases.filter((c) => !c.check);
