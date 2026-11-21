// The chat may not hand the job back when a tool fails.
//
// THE INCIDENT (21 November 2026), and the exact reply, which is the
// first test below. A Shopify page edit refused for a reason the model
// could not satisfy. It tried twice, then printed the new page copy in
// the chat and said: "copy the text below and paste it directly into
// your Shopify admin under Pages → Contact", with an apology for the
// extra step.
//
// WHY THAT IS THE WORST POSSIBLE FALLBACK. Everything this product
// does to a live surface goes through one path: resolve the target,
// show a preview, take an approval, re-read, write, record. A sentence
// telling the owner to do it himself walks around all of it — no
// preview, no approval row, no staleness check, no claims check on the
// words, nothing to undo. The work still happens and only the safety
// is missing.
//
// THE FOUNDER'S RULE, generalised from Shopify to everything: say the
// failure plainly, then ask whether to retry or stop.
//
// THE HARD HALF IS THE EXCEPTION, and most of this file is about it. A
// door only the owner can open is NOT a workaround. "This store has no
// blog yet — create one in Shopify, then ask again" is correct and
// must survive. The difference is whether content is being handed over
// or a prerequisite named, and a guard that cannot tell them apart
// would make the product mute about things it genuinely cannot do.

import { describe, it, expect } from "vitest";
import { checkReplyWorkarounds } from "@/lib/chat/replyWorkarounds";
import { code, sourceWithComments } from "./helpers/source";

describe("1. THE INCIDENT ITSELF", () => {
  const REAL_REPLY =
    "The tool is refusing both attempts — it's returning the same error both times and not explaining further beyond that. " +
    "Here's what I'd suggest: copy the text below and paste it directly into your Shopify admin under Pages, Contact, Description. " +
    "And while you're in there, you can add your WhatsApp number too. " +
    "Sorry for the extra step — the tool isn't accepting the write right now.";

  it("THE LOAD-BEARING ONE: the handover sentence is withheld", () => {
    const out = checkReplyWorkarounds(REAL_REPLY);
    expect(out.withheld.length).toBeGreaterThan(0);
    expect(out.reply).not.toContain("paste it directly into your Shopify admin");
    expect(out.withheld.join(" ")).toContain("paste it directly");
  });

  it("AND THE EXPLANATION SURVIVES — it is the useful half", () => {
    // Deleting the whole reply would leave the owner with nothing and
    // read as a bug. Same decision replyClaims.ts made.
    const out = checkReplyWorkarounds(REAL_REPLY);
    expect(out.reply).toContain("The tool is refusing both attempts");
    expect(out.reply).toContain("isn't accepting the write right now");
  });

  it("the note says what happened and ASKS, rather than just apologising", () => {
    // The founder's words: failure plainly, then retry or stop.
    const out = checkReplyWorkarounds(REAL_REPLY);
    expect(out.note).toBeTruthy();
    expect(out.note!).toMatch(/nothing was saved/i);
    expect(out.note!).toMatch(/try again, or leave it\?/i);
    // And it names the cost, so the owner knows what he was nearly
    // talked out of.
    expect(out.note!).toMatch(/approval/i);
  });

  it("THE NOTE DOES NOT REPRINT THE COPY", () => {
    // Explaining that the text must not be handed over, and then
    // printing it underneath, would hand it over.
    const out = checkReplyWorkarounds(
      "Paste this into your admin: We'd love to hear from you, just reach out on WhatsApp."
    );
    expect(out.note!).not.toContain("We'd love to hear from you");
  });
});

describe("2. the shapes it catches, in both languages", () => {
  const CAUGHT = [
    "Copy the text below and paste it into Shopify admin.",
    "You can paste this into your website's page editor.",
    "Just add it manually in the Shopify dashboard for now.",
    "You'll have to do it yourself this time.",
    "Please manually paste the copy into the page.",
    "Aap khud paste kar lo Shopify mein.",
    "Isko manually daal do admin panel mein.",
    "Jaake daal do apne Shopify page pe.",
    "Copy karke paste kar lijiye.",
  ];

  it.each(CAUGHT)("withholds: %s", (sentence) => {
    const out = checkReplyWorkarounds(`The write failed. ${sentence}`);
    expect(out.withheld.length, sentence).toBeGreaterThan(0);
    expect(out.reply, sentence).toContain("The write failed.");
  });

  it("GENERAL, NOT SHOPIFY — the surface named makes no difference", () => {
    // The incident was Shopify; the rule is not.
    for (const where of ["Shopify admin", "WordPress dashboard", "your email client", "the Website Builder screen"]) {
      const out = checkReplyWorkarounds(`It failed. Copy the text and paste it into ${where}.`);
      expect(out.withheld.length, where).toBeGreaterThan(0);
    }
  });
});

describe("3. A DOOR ONLY THE OWNER CAN OPEN IS NOT A WORKAROUND", () => {
  const KEPT = [
    "This store has no blog yet — create one in Shopify under Online Store, then ask me again.",
    "Connect Shopify from Settings first and I'll be able to edit the page.",
    "This business has no usable Shopify connection — it may need reconnecting from Settings.",
    "I can't add a whole section to the page; that one is Website Builder's job.",
    "There are no collections yet on this store.",
  ];

  it.each(KEPT)("keeps: %s", (sentence) => {
    const out = checkReplyWorkarounds(sentence);
    expect(out.withheld, sentence).toEqual([]);
    expect(out.reply, sentence).toBe(sentence);
    expect(out.note, sentence).toBeNull();
  });

  it("THE LOAD-BEARING EXCEPTION: a prerequisite WINS over a handover match", () => {
    // Checked before the handover patterns on the same sentence, so a
    // legitimate prerequisite that happens to name an admin screen is
    // not eaten. A guard that could not tell these apart would make
    // the product mute about what it genuinely cannot do.
    const out = checkReplyWorkarounds(
      "This store has no blog yet — create one in Shopify and then ask me again."
    );
    expect(out.withheld).toEqual([]);
  });
});

describe("4. it does not eat the conversation", () => {
  it("a quoted refusal survives, because the product explains itself", () => {
    // replyClaims.ts masks quotes for the same reason: the product
    // deliberately quotes the rule it is enforcing, and a detector
    // that reads inside the quotes deletes the explanation.
    const out = checkReplyWorkarounds(
      'I will never say "paste it into your Shopify admin" — that would skip the approval.'
    );
    expect(out.withheld).toEqual([]);
  });

  it("an empty or whitespace reply is returned untouched", () => {
    for (const empty of ["", "   ", null, undefined]) {
      const out = checkReplyWorkarounds(empty as any);
      expect(out.withheld).toEqual([]);
      expect(out.note).toBeNull();
    }
  });

  it("ordinary talk about copy is left alone", () => {
    const fine = [
      "I've written the copy and it's on the card below for your approval.",
      "Want me to copy the tone from your last post?",
      "I'll paste the summary into the report for you.",
      "Your About page already says that, so I left it.",
    ];
    for (const sentence of fine) {
      expect(checkReplyWorkarounds(sentence).withheld, sentence).toEqual([]);
    }
  });

  it("NOTHING IS WITHHELD FROM A REPLY THAT NEVER OFFERED A WORKAROUND", () => {
    // The whole reply comes back identical, note included, so a
    // successful turn is untouched by this guard.
    const ordinary =
      "Done — the card below has the before and after. Nothing changes on your storefront until you approve it.";
    const out = checkReplyWorkarounds(ordinary);
    expect(out.reply).toBe(ordinary);
    expect(out.note).toBeNull();
  });
});

describe("5. IT IS ACTUALLY WIRED IN", () => {
  // A guard that exists and never runs is the failure
  // publish/registry.ts records: PlatformId listed four platforms, the
  // registry held one, and nothing connected the two until a human had
  // already clicked approve. A module nobody calls is the same shape.
  const BRAIN = "src/lib/agents/masterBrainV2.ts";

  /** The checkedReply helper, sliced at both ends. */
  function checkedReply(): string {
    const src = code(BRAIN);
    const start = src.indexOf("const checkedReply = (text: string): string =>");
    expect(start, "checkedReply is gone").toBeGreaterThan(-1);
    const end = src.indexOf("\n  };", start);
    expect(end, "cannot find the end of checkedReply").toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("THE LOAD-BEARING ONE: checkedReply calls it", () => {
    const body = checkedReply();
    expect(body).toMatch(/checkReplyWorkarounds\(/);
    // And its output is what gets returned, not discarded.
    expect(body).toMatch(/work\.reply/);
    expect(body).toMatch(/work\.note/);
  });

  it("IT RUNS LAST, on the prose the owner actually reads", () => {
    // A link repair or a claim strip can turn one sentence into
    // another, and it is the finished sentence that must not hand the
    // job back. Asserted by position, which is the only way to say it.
    const body = checkedReply();
    const links = body.indexOf("fixReplyLinks");
    const claims = body.indexOf("checkReplyClaims");
    const work = body.indexOf("checkReplyWorkarounds");
    expect(links).toBeGreaterThan(-1);
    expect(claims).toBeGreaterThan(links);
    expect(work, "the workaround guard must run after the claims check").toBeGreaterThan(claims);
  });

  it("and it reads what the claims check produced, not the raw text", () => {
    // Passing `text` here would check a sentence the owner never sees.
    expect(checkedReply()).toMatch(/checkReplyWorkarounds\(claims\.reply\)/);
  });

  it("THE RULE IS IN THE PROMPT TOO, because a guard catches, it does not teach", () => {
    // The guard withholds a sentence after the fact. The prompt is
    // what stops it being written — and the two together are the
    // pattern replyClaims.ts set: "That is a prompt, not code", so
    // have both.
    const prompt = sourceWithComments(BRAIN);
    expect(prompt).toMatch(/WHEN A TOOL FAILS, NEVER OFFER THE MANUAL WORKAROUND/);
    // It must say what to do instead, not only what not to do.
    const at = prompt.indexOf("WHEN A TOOL FAILS, NEVER OFFER THE MANUAL WORKAROUND");
    const rule = prompt.slice(at, at + 2000);
    expect(rule).toMatch(/ask whether to try again or leave it/i);
    // And it must preserve the exception, or the product goes mute
    // about what it genuinely cannot do.
    expect(rule).toMatch(/door only they can open/i);
  });
});
