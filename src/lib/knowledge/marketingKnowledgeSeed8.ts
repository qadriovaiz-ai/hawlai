import type { KnowledgeSeedEntry } from "./marketingKnowledgeSeed";

// AEO/GEO (Answer Engine Optimization) batch — the RAG knowledge-base
// prerequisite flagged in the master strategic audit's Part A1 and
// confirmed still empty in the follow-up architecture proposal
// (grepped all 7 prior seed files for "answer-first," "FAQPage,"
// "extractability," "citation," "freshness," "structured data,"
// "featured snippet" — zero real hits). These 5 entries ground the
// new AEO check's recommendation output in real practice rather than
// Claude's own generic knowledge dressed up as platform expertise —
// the same standard every other tool here is held to. Deliberately
// distinct from the existing "Local SEO fundamentals for small
// businesses" entry (marketingKnowledgeSeed.ts) — that entry is about
// ranking in traditional search/maps; these are about being cited
// inside a synthesized AI answer, a different mechanism entirely (see
// the framework entry below for the explicit distinction).
export const MARKETING_KNOWLEDGE_SEED_8: KnowledgeSeedEntry[] = [
  {
    category: "framework",
    title: "Answer Engine Optimization (AEO/GEO) — citation, not ranking",
    content: `Situation: Use when a business's traditional SEO is solid (good rankings, decent organic traffic) but the actual question is a different one: when someone asks ChatGPT, Gemini, Perplexity, or Google's AI Overview a buying question in this category, does this business get named at all?
Strategy: Traditional SEO optimizes for a ranked list of blue links a human scans and clicks. An answer engine instead reads many sources, synthesizes ONE answer, and typically names only 2-3 brands inside it — a business not named in that synthesis is invisible to that buyer regardless of how well it ranks on a traditional search results page. The optimization target shifts from "rank #1-3" to "be one of the sources the synthesis pulls from and trusts enough to name." That means writing for extraction (a system pulling out a clear, quotable, standalone fact or recommendation) rather than for a human scanning a results page.
Why it works (India): Buyers increasingly ask these assistants directly instead of searching Google first, especially for considered/comparison-heavy purchases ("best X for Y in India"). The prompt itself is longer and more specific than a search query, which means it's a higher-intent moment — and most brand mentions in these answers come from third-party sources (reviews, comparison articles, forum threads), not the brand's own site, so on-site SEO alone doesn't solve this.
How to apply: Don't treat this as "SEO but harder" — treat it as a genuinely separate check: does representative buyer-intent language for this category currently surface this business when synthesized by an AI system, and is the business's own content written in a form that's easy for a synthesis system to extract and trust. Both need checking; strong SEO rankings don't guarantee either.
Expected Metrics: No standardized industry benchmark yet — this space is new enough that "citation rate" isn't a mature, comparable metric across tools the way SEO ranking position is. Treat any score here as directional and improving-over-time, not as a certified number to quote externally.
Common Mistakes: Assuming good SEO rankings already cover this ("we're already #1 on Google, so we're fine") — the mechanisms are different enough that a top-ranked business can still be un-cited; treating this as a one-time check rather than something that needs periodic re-verification as answer engines' own behavior and indexes shift.`,
  },
  {
    category: "channel_playbook",
    title: "Answer-first content structure for AI citation",
    content: `Situation: Use when writing or auditing any page meant to be found via a question-style search — a product page, a service page, an FAQ, a blog post answering "how does X work" or "what's the best X for Y."
Strategy: Open with the direct answer in the first 1-2 sentences, in plain declarative language, before any scene-setting, brand story, or context. A synthesis system pulling a quotable fact favors a page that states the fact upfront over one that builds up to it after three paragraphs of introduction — the opening sentence is disproportionately what gets extracted and cited. Follow the direct answer with supporting detail, not the reverse.
Why it works (India): Many small-business pages open with founder story or brand positioning before getting to the actual product fact ("Since 2015, we've been passionate about..." before ever stating what the product does or costs) — exactly the structure that's hardest for an extraction system to pull a clean citation from, and it's a very common pattern in Indian small-business web copy specifically because founder-story-first is a familiar, comfortable writing habit.
How to apply: For any page meant to answer a specific buyer question, draft the direct-answer sentence FIRST, then write everything else after it — don't write narratively and hope the answer emerges. A useful test: could someone extract a correct, complete one-sentence answer by reading only the first two sentences of the page? If not, restructure.
Expected Metrics: Not independently measurable as a single number outside of an actual citation check (see the AEO/GEO framework entry) — treat this as a structural precondition for citability, not something to A/B test in isolation.
Common Mistakes: Burying the actual answer/fact three or more paragraphs into the page; writing the opening in marketing language ("revolutionary," "premium experience") instead of a plain, extractable factual statement; assuming a well-designed page (good visuals, good UX) is the same thing as a well-structured one for extraction purposes — they're unrelated qualities.`,
  },
  {
    category: "channel_playbook",
    title: "Content freshness as a citation signal",
    content: `Situation: Use when a page was genuinely useful and accurate when published but hasn't been touched since — a common pattern for evergreen-feeling content (a "best X" list, a pricing page, a service-area page) that owners assume doesn't need revisiting.
Strategy: Pages that are not periodically refreshed become measurably less likely to be cited by AI answer engines over time, independent of whether the underlying information is still accurate — freshness itself appears to function as a trust/relevance signal for these systems, not just a proxy for correctness. Set a real re-optimization cadence rather than a "publish and forget" default: revisit and visibly update (not just re-save with no changes) high-intent pages on a fixed schedule.
Why it works (India): Pricing, availability, and seasonal-relevance content in particular goes stale fast for small businesses (a festival offer, a price that changed, a service area that expanded) — and unlike a human reader who might forgive slightly outdated info they can mentally adjust for, a synthesis system has no way to know a page is stale unless the page itself signals recency, so stale pages get quietly deprioritized rather than flagged.
How to apply: Maintain a short list of the business's highest-intent pages (homepage, top 2-3 product/service pages, pricing) and set a recurring reminder (monthly or quarterly, depending on how fast the category changes) to make a real, visible update to each — not just a timestamp bump with no content change, since some systems can likely distinguish a cosmetic touch from substantive freshness.
Expected Metrics: Directional only — there's no universal "days since update" cliff that's been independently verified; treat "recently and substantively updated" as better than "untouched for 6+ months" as a safe, conservative rule of thumb rather than citing a specific day-count threshold as fact.
Common Mistakes: Treating "evergreen" content as truly permanent and never revisiting it; re-saving a page with no actual content change just to bump a timestamp; only updating content reactively when something is already wrong (a stale price causing a complaint) instead of on a proactive schedule.`,
  },
  {
    category: "channel_playbook",
    title: "Structuring content for extractability: FAQ, schema, and direct-data formatting",
    content: `Situation: Use when a page contains genuinely useful information but in a format that's hard for a system to pull a clean, standalone fact from — long unbroken paragraphs, information buried in images, or answers implied rather than stated.
Strategy: Three concrete structural moves make content easier to extract and cite. First, explicit FAQ-style Q&A sections that state a real buyer question verbatim as a heading, followed immediately by a direct, self-contained answer — this format maps almost directly onto how buyer-intent questions get asked. Second, FAQPage/Product/LocalBusiness schema markup (JSON-LD) so the page's own structured data explicitly labels what the content is, not just what it displays visually. Third, presenting genuinely factual, extractable data (a specific price, a specific spec, a specific number) as plain stated text rather than only inside an image, a PDF, or a chart with no text equivalent — none of those are reliably readable by an extraction system.
Why it works (India): A large share of small-business sites present key facts (menus, price lists, service details) as an image or PDF for design convenience — genuinely reasonable for a human visitor, but functionally invisible to a system trying to extract a citable fact, since there's no underlying text to read.
How to apply: Audit the business's highest-intent pages for three things: is there an FAQ section using real buyer questions as headings; is schema markup present (a technical check, distinct from whether the page LOOKS complete to a visitor); and is any core fact (price, spec, availability) trapped inside an image/PDF with no plain-text equivalent nearby. Fix the plain-text-equivalent gap first — it's usually the highest-leverage, lowest-effort fix of the three.
Expected Metrics: Not independently quotable — these are structural preconditions, most usefully tracked as a simple present/missing checklist per page (see the AEO/GEO framework entry for how this rolls into an overall check) rather than a metric with its own benchmark.
Common Mistakes: Treating a visually polished page as automatically "complete" for this purpose — visual completeness and text-extractability are unrelated; using generic FAQ questions ("What makes us different?") instead of the actual specific questions buyers ask; adding schema markup that doesn't match what's actually on the page (inaccurate structured data is arguably worse than none).`,
  },
  {
    category: "indian_market",
    title: "AEO for Indian SMBs — how buyer-intent questions actually get phrased",
    content: `Situation: Use when generating the representative buyer-intent prompts an AEO check tests against, or when writing content meant to match how an Indian buyer would actually ask an AI assistant a category question — a literal English-textbook phrasing often doesn't match real usage.
Strategy: Indian buyers asking an AI assistant about a purchase decision frequently mix English category/brand terms with Hindi/regional-language framing ("best affordable [category] near me," "[category] India reviews," sometimes literal Hinglish phrasing) and skew toward value/trust-qualified questions rather than pure feature questions — "best budget X" and "is X worth it" are more common framings than a feature-spec comparison a purely English-market playbook might assume. Content and FAQ sections should include natural variations of how the question gets asked locally, not just the single "textbook" phrasing.
Why it works (India): Price-sensitivity and trust-building are bigger purchase barriers here than in many markets (established elsewhere in this knowledge base) — that same dynamic shows up in HOW people ask AI assistants questions, not just in what content converts once they arrive, so a buyer-intent prompt list built only from generic English category terms will likely miss a meaningful share of how the actual target audience phrases the question.
How to apply: When generating representative buyer-intent prompts for a check, include at least one value/trust-framed variant ("is [category] worth it," "affordable [category] India") alongside a pure category-recommendation variant ("best [category] in [city]"), rather than testing only the single most literal phrasing.
Expected Metrics: Not independently measurable — this is a prompt-design consideration that feeds into the AEO check described in the framework entry, not a metric of its own.
Common Mistakes: Testing only formal, English-textbook-style buyer questions and missing the value/trust-framed and mixed-language variants that a real Indian buyer is more likely to actually type; assuming a category's buyer-intent phrasing is uniform across India rather than being sensitive to price tier and locality.`,
  },
];
