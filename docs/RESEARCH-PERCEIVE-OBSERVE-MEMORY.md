# Perceive, Observe, Memory — an audit and a proposal

Written 22 November 2026, after a testing round in which almost every
genuine bug came from one of three places. Research and proposal only:
**nothing here has been built.**

The founder's framing, which this report adopts:

- **Perceive** — does the model see the right context?
- **Observe** — does it hear and honour what the owner just said?
- **Memory** — does it remember what it already did?

---

## 0. Method, and what this report does not know

**Read:** nine areas of published work, listed in section 2 with links.
Where a search found no direct evidence for something, this report says
so rather than filling the gap.

**Verified in the code, not assumed.** Every claim in section 1 was
checked against this repository. The specific commands and findings are
in the margin notes. Two of them changed what this report says.

**What it does not know.** No measurement of how often each failure
happens in real use — there is one test business and the session's bugs
are the sample. The proposal is therefore ordered by *cost and
reversibility*, not by measured frequency, and section 4 says what to
measure before the expensive parts.

---

## 1. Where Hawlai is weak

### 1.1 Perceive — the context is one eager string, and what is not in it does not exist

The system prompt is assembled per turn from **eight sections**:
`brandVoiceSection`, `businessFactsSection`, `channelPolicySection`,
`knowledgeSection`, `memorySection`, `recentImagesSection`,
`soundSection`, `storeFactsSection`. All eight are built up front, every
turn, whether the turn needs them or not.

This is a real architecture and it mostly works. Its failure mode is
sharp: **anything outside those eight sections is invisible to the
model, and the model cannot tell the difference between "this does not
exist" and "nobody showed me".**

> **Evidence, 21 November.** The owner had an image generated, saw it in
> chat, and asked to upload "isi image" to Shopify. The chat offered to
> generate a new one and charge again. It was not being obtuse: the URL
> lived in `graphic_designs`, **no context section read that table**, and
> `generate_graphic` returns a quote that never contains a URL. The
> instruction it had been given — "pass the exact URL from an earlier
> generate_graphic result" — was unsatisfiable by construction.
>
> The fix was a ninth section. That is the right fix and also the
> symptom: every new thing the model needs to know costs a bespoke
> section, and nobody notices a missing one until a request fails.

> **Counter-evidence worth recording.** The Calendly booking link was
> *not* a perceive failure. `products.booking_url` genuinely holds
> `https://calendly.com/candlebyqaaf/workshop`; the model read the
> catalogue correctly and the claims guard allowed it because it is the
> recorded link. Perceive worked. The **data** was wrong. Three of the
> session's "bugs" were of this kind, and a proposal that treats every
> complaint as a code gap would have made the product worse.

**The second perceive gap is at the tool boundary.** A handler read
`input.text` on a tool whose schema has no `text` parameter. The model
had nowhere to put the answer, so it retried the same call and then
improvised. Anthropic's framing is the right one: a tool is *a contract
between a deterministic system and a non-deterministic agent*. This
contract was unsatisfiable and nothing checked that it was satisfiable.
`tests/toolParamContract.test.ts` now does.

### 1.2 Observe — there is no conversational state at all

This is the weakest of the three, and the finding is concrete.

The model's entire view of the conversation is:

```ts
const messages = [...history.slice(-10), { role: "user", content: message }];
```

…where `history` arrives **from the browser** in the request body. There
is no belief state, no slot store, no per-conversation record of what has
been settled. A decision the owner made two turns ago exists only as
prose in a transcript, to be re-read and re-interpreted every turn.

> **Evidence, 21 November.** Asked to edit a collection without naming
> one, the tool returned "which collection?" **with all three real
> collections attached**. The chat relayed the question and dropped the
> list. The owner answered "Home page" — a real collection, Shopify's own
> default. The model then **did not call the tool again**: it replied
> that "Home page is not a collection, it's a regular website page",
> contradicting a result it already held.
>
> Nothing had recorded *the owner chose `frontpage`*. The answer was
> advisory prose competing with the model's own prior about what a name
> sounds like, and the prior won.

A 2026 SIGDIAL survey names this exactly: LLM agents "can give confident
answers built on incomplete information when they fail to ground."

**The same shape appears in the tool results themselves.** Several
clarification paths returned `candidates` in a field *beside* the
question. A field beside the question is advisory. The fix — putting the
names inside the question text and attaching a note saying the list is
not open to argument — worked, and it is a workaround for a missing state
layer rather than a replacement for one.

### 1.3 Memory — an episodic store exists and is write-only

Hawlai has one durable memory: `ctx.memories`, dealership-wide
observations rendered into `memorySection`. In CoALA's terms that is
**semantic** memory — durable facts about the business. It is good, and
it is the only one.

There is no **episodic** memory: no record the model can read of what it
did, what came back, or what failed.

> **The finding that matters most in this audit.**
> `chat_messages.artifacts` has existed since migration **081**. Every
> assistant turn writes its artifacts there — including, for a generated
> image, the card carrying its URL. **Nothing in `src/lib/agents/` or
> `src/lib/businessBrain/` ever reads that column back.**
>
> A per-message episodic store of the agent's own outputs has been
> accumulating for months, unread. The "isi image" bug was a question the
> database could already answer.

Three further memory gaps, all verified:

1. **Approval outcomes do not return to the model.** Until 21 November
   the generated image URL was computed, saved, and discarded. It now
   reaches the *browser*. It still does not reach the model.
2. **`history.slice(-10)` is a hard truncation.** No compaction, no
   summary. Turn 11 is gone, silently.
3. **Prior turns carry prose only.** Tool results from earlier turns are
   not in `history` — only what the assistant said about them. So the
   model's record of its own actions is its own narration of them.

### 1.4 A fourth class: knowledge written in prose instead of in code

The founder named the `CLAIM_TERMS` case, and it is not one of the three
layers. It is worse.

`CLAIM_TERMS` opens with a comment describing the incident that created
it: a generated homepage said *"No paraffin. No synthetic shortcuts."*
for a business whose records said nothing of the kind. **"no paraffin"
was added to the list. "no synthetic shortcuts" never was.** The phrase
that caused the rule sat in a comment *describing* the rule, publishable,
for seven weeks — until it published itself into a blog post bound for a
live storefront.

This is the same failure as the eight occasions this autumn when a
recorded description differed from the code, and as `PlatformId` listing
four platforms while the registry held one. **Prose that is load-bearing
is prose that drifts.** The codebase already knows this — it is why
`tests/sourceGrepDiscipline.test.ts` and the registry test exist — but
the knowledge is applied case by case.

---

## 2. What the industry does, and what transfers

Nine areas, each mapped to a specific gap above. Relevance noted
honestly, including where a pattern should **not** be adopted.

### 2.1 CoALA — a vocabulary for the memory argument
[Cognitive Architectures for Language Agents](https://arxiv.org/abs/2309.02427)
(Sumers, Yao, Narasimhan, Griffiths)

Splits agent memory into **working** (persists across LLM calls, the hub
connecting model, memories and grounding), plus long-term **episodic**
(past decision cycles), **semantic** (world/domain knowledge) and
**procedural** (code and weights). Later work treats it as a design
language rather than a system — which is what Hawlai needs from it.

**Applies:** directly, as the frame for section 1.3. Hawlai has semantic
(`ctx.memories`) and procedural (its own code), no episodic, and a
working memory that is a 10-turn prose window owned by the browser.
Naming the missing box is most of the argument.

**Caution:** CoALA is a taxonomy, not an implementation. Adopting the
vocabulary is free; adopting a full cognitive architecture is not the
proposal.

### 2.2 Generative Agents — retrieval scoring over a memory stream
[Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)
(Park et al.)

A natural-language **memory stream**, retrieved by a weighted sum of
**recency** (exponential decay), **importance** (LLM-rated 1–10 at write
time) and **relevance** (embedding similarity), plus periodic
**reflection** that writes higher-level insights back into the stream.

**Applies, partly:** recency-and-relevance retrieval over a per-business
event log is the shape Hawlai's missing episodic memory should take.

**Do not adopt the whole thing.** LLM-rated importance on every write is
a per-write model call, and this product has a live cost-control
initiative and a prior cost-burn incident. Hawlai's events are also few
and highly structured — "image generated", "page edited", "approval
rejected" — so *recency plus type* gets most of the value for none of the
spend. Reflection is interesting and premature.

### 2.3 MemGPT / Letta — tiers, and self-editing
[MemGPT](https://arxiv.org/abs/2310.08560) ·
[Letta architecture docs](https://docs.letta.com/guides/agents/architectures/memgpt)

In-context **memory blocks** (persona, user info, working state) that are
always visible, plus out-of-context **recall** (past conversation) and
**archival** (long-term) storage. The agent edits its own core memory
through tools (`memory_insert`, `memory_replace`, `memory_rethink`),
within fixed character budgets.

**Applies:** the tier split is the right mental model for "what is always
in the prompt" versus "what is fetched". Hawlai's eight sections are
in-context blocks by another name; it has no recall tier.

**Do not adopt self-editing memory.** In a product where every outward
action is approval-gated and the claims layer governs what may be said
about the business, an agent rewriting its own durable notes is a new
unapproved write path into the thing that grounds every later claim. The
founder's own rule — nothing reaches a customer without a record — points
the other way. Writes to memory should stay explicit and reviewable.

### 2.4 Anthropic on context engineering — just-in-time over eager
[Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

Keep **lightweight references** and load data at execution time through
tools, rather than pre-loading everything. Claude Code is the example:
`CLAUDE.md` up front, `glob`/`grep` just-in-time. **Compaction**
summarises a long conversation and reinitialises from the summary. The
recommended shape is hybrid: pre-load the static, fetch the dynamic,
compact the long.

**Applies, and it is the sharpest fit for section 1.1.** Hawlai pre-loads
everything and fetches nothing. "Which collections exist" is dynamic,
per-request, and currently either absent or bolted on as a ninth eager
section. The hybrid rule says: business facts and brand voice stay
pre-loaded; "what exists on the connected store right now" should be a
cheap read-only lookup the model can make when it needs it.

**Caution:** just-in-time trades latency for freshness, and Hawlai's
turns already run a six-step tool loop.

### 2.5 Anthropic on writing tools — the contract, and evaluating it
[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

Tools are "a contract between deterministic systems and non-deterministic
agents" and should be designed for agents rather than written like APIs.
Namespacing, meaningful return context, token-efficient responses, and
**prompt-engineering the descriptions and specs**. Recommends an
evaluate-and-refine loop, including having the agent read its own
transcripts and propose tool improvements.

**Applies:** the `input.text` bug, the "exact URL from an earlier result"
instruction that could never be satisfied, and the three tools whose
cards claimed completed actions were all contract defects. Two of them
were fixed by changing a *description*, which is the post's point: the
spec is prompt, and it is load-bearing.

### 2.6 Dialogue state tracking — informable slots
[Jacqmin et al., SIGDIAL 2022](https://aclweb.org/anthology/2022.sigdial-1.33.pdf) ·
["Do you follow me?" survey](https://arxiv.org/pdf/2207.14627.pdf)

Classical task-oriented dialogue maintains a state of `(slot, value)`
pairs updated each turn, which then drives the policy. **Informable**
slots are constraints the *user* provides; **requestable** slots are
things the user asks for. Informable slots carry explicit values for "no
preference" and "unspecified".

**Applies, and this is the missing piece in section 1.2.** "Which
collection?" is an informable slot. The owner informed it. Nothing wrote
it down. Hawlai does not need a trained DST model — it needs the data
structure: a small set of named slots per conversation, written when the
owner answers, read before the model is asked to decide again.

**Honest gap:** the search found no paper that directly addresses
"treat a user-supplied value as authoritative over the model's prior".
The closest formal notion is the informable-slot distinction above, and a
2025 accountability-modelling paper reporting that LLM-based DST gets
*values* mostly right while **false-positive and false-negative slot
errors** dominate — which maps onto Hawlai's real failure: not a wrong
value, but a slot that was never recorded as filled.

### 2.7 Grounding and common ground — why the answer must settle something
[Clark & Brennan, Grounding in Communication (1991)](https://web.stanford.edu/~clark/1990s/Clark,%20H.H.%20_%20Brennan,%20S.E.%20_Grounding%20in%20communication_%201991.pdf) ·
[Conversational grounding annotation](https://arxiv.org/html/2403.16609v1) ·
[SIGDIAL 2026 survey](https://aclanthology.org/2026.sigdial-1.11.pdf) ·
[Challenges in Human-Agent Communication](https://arxiv.org/pdf/2412.10380)

Common ground is built jointly and incrementally; **grounding** is the
process of updating it, and it must be coordinated at the level of both
content and process. The 2026 survey argues grounding is *not*
automatically present in human-machine dialogue, and that agents which
fail to ground give confident answers on incomplete information. Reviews
of human-AI grounding note that when misalignment accumulates, **the
human ends up doing the repair work**.

**Applies:** this is the theory behind the observe failure, and it
describes the owner's experience of this session exactly — he did the
repair work, repeatedly. It also gives the acceptance test for any fix:
after the owner answers, the thing he answered is *settled*, and the
system's next move must be consistent with it or must explicitly
re-open it.

### 2.8 Reflexion — remembering failures, not just facts
[Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)

Converts environment feedback into a verbal summary held in an
**episodic buffer**, so the next attempt is informed by the last
failure. Contrasted with ReAct, which uses only the current episode's
trajectory.

**Applies, later.** Several session bugs involved the model retrying an
identical failing call — the unanswerable "tell me what the page should
say" being the clearest. A per-conversation note of "this exact call
failed, with this reason" would stop that loop. This is phase 3: it
needs the episodic store first.

### 2.9 Guardrail coverage — and the cost of over-filtering
[Adversarial prompt evaluation](https://arxiv.org/pdf/2502.15427) ·
[No Free Lunch with Guardrails](https://arxiv.org/pdf/2504.00441) ·
[NeMo Guardrails](https://arxiv.org/pdf/2310.10501)

Small trained classifiers generalise competitively to unseen data, and
LLM-based defences have not been shown to generalise better. Stronger
filtering carries a real **over-filtering** (false-positive) cost. One
robustness study across 1,445 prompts argues benchmark scores are
inflated by contamination and that **generalisation should be the
headline metric**.

**Applies to `CLAIM_TERMS` with a caveat.** The literature supports the
intuition that an enumerated phrase list generalises badly — it caught
"no paraffin" and missed "no synthetic shortcuts" from the same sentence.
But **no source found compares keyword denylists with classifiers
head-to-head**, so this report does not claim a measured advantage. And
the over-filtering finding is the reason not to rush: a looser check that
strips an owner's true statement is a worse product, and this guard
already has the right escape valve — *say it yourself first*.

---

## 3. Proposal

Ordered by cost and reversibility. Phase 1 adds no new concepts and
mostly reads data that already exists.

### Phase 1 — small, high-value, no new architecture

**1a. Read `chat_messages.artifacts` back into context.** (S)
The store exists, is populated, and is unread. Render the last few turns'
artifacts into a context section: what was made, what it was called, and
its URL or id. This fixes the whole "what did I just make" class
generically, rather than one bespoke section per asset type — and it
retires `recentImagesSection` as a special case.
*Risk:* token cost on long conversations; needs a cap and a shape, not a
raw jsonb dump.

**1b. A conversation slot store.** (M)
A small named-slot record per conversation — `surface`, `page`,
`collection`, `blog`, `image` — written when a tool resolves one **or the
owner answers a clarification**, and rendered into context as "already
settled this conversation". The model must be told it may not contradict
a settled slot without saying so explicitly.
*This is the single highest-value item in the report.* It is the fix for
the observe class, and the "Home page is not a collection" failure
becomes structurally impossible rather than discouraged by a note.
*Risk:* a stale slot is worse than none — needs clearing rules
(new topic, explicit change, age) and those rules need their own tests.

**1c. Every approval returns what it produced.** (S)
`decide.ts` now threads `produced` for the graphic branch only. Make it
the contract for all branches, and feed it into 1a so the model sees it
too, not just the browser.

**1d. Make the prose-vs-code class fail loudly.** (S)
The `CLAIM_TERMS` lesson generalises: when a comment names a specific
phrase, pattern or identifier as the reason a guard exists, that string
should be *in* the guard. A test can check the narrow version of this —
quoted phrases in a claim-list's own header must appear in the list.

### Phase 2 — structural, needs your decisions

**2a. Hybrid context: a read-only "what exists" lookup.** (M)
Per Anthropic's guidance, stop adding eager sections for dynamic facts.
Give the model one cheap read-only way to ask what exists on a connected
surface. **This collides with Rule 5** — it is a new tool — so it needs
your written reason, and the alternative (more eager sections) should be
priced honestly: every one costs prompt tokens on every turn forever.

**2b. Owner answers as authoritative, stated as a rule.** (S, but a
decision)
Phase 1b stores the slot. The remaining question is policy: when the
model's prior disagrees with a settled slot, what happens? Recommendation:
it must act on the slot and may raise the disagreement in prose — never
silently substitute its own reading. That is a one-paragraph system-prompt
rule plus a guard, and it is the behaviour that was missing in the
transcript.

**2c. Claims coverage: measurement before expansion.** (M)
Do not swap the term list for a classifier. Instead: a dry-run harness
(the repo already has `scripts/claimTermsDryRun.mjs`) run over real
generated content before any term is added, reporting both new catches
and new false strips. The guardrail literature's over-filtering finding
is the reason this is the gate.

### Phase 3 — only once phases 1–2 are earning

**3a. Episodic memory with retrieval.** Recency-plus-type over a
per-business event log, not LLM-rated importance. Generative Agents'
shape, Hawlai's budget.

**3b. Failure notes (Reflexion-lite).** "This call failed, with this
reason" held for the conversation, so an unanswerable retry stops at one.

**3c. Explicit grounding acts.** A small protocol for confirm / settle /
re-open, so repair is the system's job rather than the owner's.

### What this report recommends against

- **Self-editing memory.** New unapproved write path into the facts that
  ground every claim.
- **LLM-rated importance per write.** Cost, for little gain on a small
  structured event set.
- **Replacing `CLAIM_TERMS` with a model judge.** Not without the
  dry-run harness and a false-strip budget.
- **Treating every complaint as a code gap.** Three of this session's
  reports were data or recollection, not defects. A proposal that
  "fixes" those makes the product worse.

---

## 4. How we would know it worked

Phase 1 is only finished if these are true, and each is testable:

1. The owner can say "upload that image" one turn after it was made, and
   nothing is regenerated. *(1a)*
2. The owner answers a clarification, and the next turn acts on the
   answer without re-deriving it. A test can assert the slot is written
   and read. *(1b)*
3. Every approval that produces something returns it, checked by a sweep
   like `tests/everyApprovalHasAButton.test.ts` — which found four
   unrelated bugs the day it was written. *(1c)*
4. Adding a claim term reports its false-strip rate before it ships.
   *(2c)*

And one measurement worth starting now, because the proposal is ordered
by guesswork without it: **log which of the three layers each future bug
belongs to.** Four data points from one session is a hypothesis, not a
priority list.
