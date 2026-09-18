// The business's own story, in the owner's words — what makes copy about
// THIS business impossible to write about any other one.
//
// WHY (approved 2026-09-18): generated captions read as generic. The copy
// facts carried the catalogue, prices, pillars and a tone word — true, but
// true of every business in the same category. Nothing said how the thing
// is actually made, why it started, what a customer said, or what the
// owner refuses to do. No prompt change produces specific copy from
// unspecific facts.
//
// Answers are stored as Business Knowledge (business_knowledge), the same
// table the claims guard already treats as things the owner stands behind
// — so a story detail used in copy is a verified claim, never an invention.

export type StoryQuestion = {
  key: string;
  /** Saved as the knowledge entry's title. */
  title: string;
  /** What the AI asks the owner. */
  ask: string;
  /** Said after the question when the owner is stuck. */
  nudge: string;
};

/**
 * The category every story answer is filed under — printed in full for
 * copy, and shown as its own section in Settings → Knowledge Base.
 *
 * business_knowledge.category is CHECK-constrained (migration 118, widened
 * by 189). A value outside that list is rejected by the database, which is
 * exactly how the first intake run saved nothing.
 */
export const STORY_CATEGORY = "business_story";

export const STORY_QUESTIONS: StoryQuestion[] = [
  {
    key: "origin",
    title: "How it started",
    ask: "How did this business start — and why this, rather than anything else you could have done?",
    nudge: "The real reason is fine, even if it's unglamorous: a gift you made, a job you left, something you couldn't find to buy.",
  },
  {
    key: "first_customers",
    title: "The first customers",
    ask: "Who were your first customers, and how did they find you?",
    nudge: "Friends, a market stall, one Instagram post — whatever actually happened.",
  },
  {
    key: "how_made",
    title: "How it's made, step by step",
    ask: "Walk me through how one of your products is actually made or one service is actually delivered, start to finish.",
    nudge: "The order of the steps, and roughly how long each takes.",
  },
  {
    key: "slow_part",
    title: "The part that takes longest",
    ask: "Which part takes the longest or goes wrong most often — and why do you still do it that way?",
    nudge: "This is usually the most interesting thing about a small business, and nobody writes about it.",
  },
  {
    key: "materials",
    title: "Materials and suppliers",
    ask: "What are your materials or ingredients, where do they come from, and why those ones?",
    nudge: "Names, places, and what you rejected before settling on these.",
  },
  {
    key: "detail_noticed",
    title: "The detail people notice",
    ask: "What's one small detail in your work that customers notice or ask about?",
    nudge: "Something you can point at, not an adjective.",
  },
  {
    key: "customer_words",
    title: "What a customer actually said",
    ask: "What's something a customer has actually said to you about your work — in their words, as near as you remember?",
    nudge: "One real sentence beats any testimonial you could write for them.",
  },
  {
    key: "refuse",
    title: "What you refuse to do",
    ask: "What do you refuse to do, even though it would be easier or cheaper?",
    nudge: "A shortcut you won't take, an order you turn down, a material you won't use.",
  },
  {
    key: "how_you_talk",
    title: "How you talk about the work",
    ask: "How do you describe your work to someone who isn't a customer — a neighbour, a relative — when you're not selling?",
    nudge: "Your own words, not marketing words.",
  },
  {
    key: "mistaken",
    title: "What people get wrong",
    ask: "What do people usually get wrong or misunderstand about what you sell?",
    nudge: "Price, effort, how it's used, how long it lasts — whatever you find yourself explaining.",
  },
];

export function storyQuestion(key: string): StoryQuestion | undefined {
  return STORY_QUESTIONS.find((q) => q.key === key);
}

export type StoryAnswer = { key: string; title: string; content: string };

/** Which questions this business has answered, and which are still open. */
export function storyProgress(rows: { category?: string | null; title?: string | null; content?: string | null }[]): {
  answered: StoryAnswer[];
  missing: StoryQuestion[];
} {
  const byTitle = new Map<string, string>();
  for (const r of rows ?? []) {
    if (String(r.category ?? "") !== STORY_CATEGORY) continue;
    const content = String(r.content ?? "").trim();
    if (content) byTitle.set(String(r.title ?? "").trim().toLowerCase(), content);
  }
  const answered: StoryAnswer[] = [];
  const missing: StoryQuestion[] = [];
  for (const q of STORY_QUESTIONS) {
    const content = byTitle.get(q.title.toLowerCase());
    if (content) answered.push({ key: q.key, title: q.title, content });
    else missing.push(q);
  }
  return { answered, missing };
}

/**
 * Where the intake stands, from what the database holds — the only thing
 * the chat is allowed to go on.
 *
 * THE BUG (2026-09-19): the chat declared candle_by_qaaf's story complete
 * with 8 of 10 answers saved. A save only ever said "ask the next open
 * question", so which question was next — and whether any were left — lived
 * in the model's memory: it asked a near-duplicate of an answered question,
 * skipped "What people get wrong", and then congratulated the owner. Now
 * every step returns this, read back from the table, with the exact next
 * question and `complete` true only when all ten are actually saved.
 */
export function storyStatus(rows: { category?: string | null; title?: string | null; content?: string | null }[]) {
  const { answered, missing } = storyProgress(rows);
  const next = missing[0] ?? null;
  return {
    complete: missing.length === 0,
    savedCount: answered.length,
    total: STORY_QUESTIONS.length,
    saved: answered.map((a) => a.title),
    stillOpen: missing.map((q) => ({ key: q.key, title: q.title })),
    next: next ? { key: next.key, title: next.title, ask: next.ask, nudge: next.nudge } : null,
  };
}

/** Two answers that are the same words once spacing and case are ignored. */
export function sameAnswer(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

/** An answer worth storing: the owner's own words, long enough to be a fact and short enough to prompt with. */
export function cleanStoryAnswer(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(input ?? "").replace(/\s+/g, " ").trim();
  if (value.length < 15) return { ok: false, error: "That's too short to be useful — ask them for a sentence or two more." };
  return { ok: true, value: value.slice(0, 1200) };
}
