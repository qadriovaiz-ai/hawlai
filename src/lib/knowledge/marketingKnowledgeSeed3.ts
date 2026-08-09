import type { KnowledgeSeedEntry } from "./marketingKnowledgeSeed";

export const MARKETING_KNOWLEDGE_SEED_3: KnowledgeSeedEntry[] = [
  {
    category: "channel_playbook",
    title: "WhatsApp broadcast segmentation by recency (Hot/Warm/Cold)",
    content: `Situation: Use when regular WhatsApp broadcasts are getting muted, blocked, or generating very low reply rates.
Strategy: Split the list into three segments by last interaction date — Hot (contacted in the last 15 days), Warm (15-45 days), Cold (45+ days). Send Hot contacts a personal, offer-heavy message. Send Warm contacts value content with a soft offer. Send Cold contacts pure value only (tips, myth-busting, useful info) — no offer at all. Every message should end with one clear but soft next step (reply, click a link), not a hard close.
Why it works (India): WhatsApp is expected to feel like a personal channel — sending the identical sales message to someone who hasn't engaged in months as to someone who messaged yesterday breaks that expectation and is a common reason people mute or block a business number.
How to apply: Build the three lists from the CRM/spreadsheet's last-interaction-date field before the next broadcast; run at least two weeks on pure segmentation (without changing anything else) and compare reply rates by segment before layering in further changes.
Expected Metrics: Reply rates by segment are commonly reported in the 25-40% (Hot), 12-20% (Warm), and 5-10% (Cold, value-only) ranges in general small-business WhatsApp marketing practice — these are directional, not verified for any specific business/category, and should be treated as a rough expectation to compare your own numbers against, not a guarantee.
Common Mistakes: Sending the identical message to all three segments regardless of recency; sending offers to the Cold segment daily, which accelerates opt-outs; writing long paragraphs instead of short, scannable messages.`,
  },
  {
    category: "objection_handling",
    title: `Handling the "mehnga hai" (too expensive) objection`,
    content: `Situation: Use when a customer clearly likes the product/service but stalls specifically on price.
Strategy: Don't jump to a discount immediately. First, stack the value — walk through everything actually included, not just the headline offer. Break the price into a smaller daily/monthly unit ("just ₹X a day") to make it feel more manageable. Name the real cost of the cheaper alternative (what they lose by going with a lower-quality option). If still hesitant, offer a smaller trial size, an EMI option, or a starter tier rather than a blanket discount.
Why it works (India): Price sensitivity is real and rational for many Indian buyers, but the objection is often really "I don't yet see why this is worth it," not "I categorically cannot afford this" — once the value and long-term cost comparison are made concrete, willingness to pay often follows.
How to apply: Prepare a ready "value stack + daily-cost breakdown" script in advance for the top 2-3 products/services, so the response is confident and specific in the moment rather than improvised.
Expected Metrics: Businesses that systematically apply a value-stack-before-discount approach commonly report meaningful conversion improvement on price-objection conversations versus jumping straight to a discount — the exact size of the improvement varies too much by category/price point for a single reliable number; track your own before/after conversion rate on this specific objection as the real benchmark.
Common Mistakes: Dropping the price immediately at the first sign of hesitation; arguing with the customer about whether the price is fair; responding with more features instead of reframing value and cost.`,
  },
  {
    category: "channel_playbook",
    title: "Meta Ads account structure for ₹10,000-30,000/month budgets",
    content: `Situation: Use when running Meta Ads on a modest monthly budget and results feel unstable or inconsistent.
Strategy: Run a single campaign (Advantage+ or ABO) rather than several. Keep it to 3-4 ad sets maximum. Give each ad set 3-4 creatives, including at least 2 videos. Start with broad targeting rather than narrow interest stacking. Reserve roughly 20-25% of budget specifically for retargeting. Let the campaign run 4-5 days in its learning phase without daily changes before evaluating.
Why it works (India): On a small budget, too many ad sets split the limited daily spend into pieces too small for the algorithm to optimize any of them well — a simpler structure concentrates enough signal per ad set for genuine optimization to happen.
How to apply: Before launching a new campaign, deliberately cap it to this structure (1 campaign, ≤4 ad sets, 3-4 creatives each) rather than the instinct to create many narrow ad sets for "more control."
Expected Metrics: A CTR around 1.2% or higher is commonly cited as a healthy general benchmark in Meta Ads practice, though this varies significantly by category, creative quality, and audience — cost-per-lead benchmarks vary too much by industry to state a single number; the more reliable practice is tracking your own account's trend against its own history.
Common Mistakes: Splitting budget across 8-10 ad sets, starving each of enough spend to exit the learning phase properly; changing budgets or targeting daily instead of letting the learning phase complete; running only static image ads with no video creative.`,
  },
  {
    category: "indian_market",
    title: "Trust-building sequence for high-ticket/considered purchases",
    content: `Situation: Use for higher-priced or longer-decision-cycle categories (education, health, furniture, electronics, professional services) where customers don't decide on the first interaction.
Strategy: Spend the first 7-14 days of a campaign/relationship purely on education and social proof — customer stories, process/behind-the-scenes content, no hard offer. Only introduce a soft offer once some trust has visibly built. Keep hard discounting as a last-resort lever, not an opening move.
Why it works (India): For genuinely considered purchases, trust has to be established before money changes hands — leading with hard selling before any trust exists is a common reason high-ticket campaigns underperform despite good targeting.
How to apply: Plan the content calendar with a rough split — majority (around 60%) trust-building content, a smaller share (around 30%) soft promotion, and only a small remainder (around 10%) hard offers — as a starting ratio to adjust based on what the specific audience responds to.
Expected Metrics: The signal to watch is engagement quality (saves, shares, meaningful comments) on trust-building content specifically — rising engagement on this content type before any offer is introduced is a good sign the sequence is working; there's no universal number for "how much trust is enough" before introducing an offer.
Common Mistakes: Starting hard-selling from day one in a category where trust genuinely needs to be earned first; treating the trust-building phase as optional or skippable to save time.`,
  },
  {
    category: "objection_handling",
    title: `Handling "soch ke batata hoon" (let me think about it)`,
    content: `Situation: Use when a customer seems genuinely interested but exits the conversation with a vague "I'll think about it and let you know" rather than a real objection.
Strategy: Don't just accept it and end the conversation. Ask a soft, specific question — "is there something specific I can help you decide on?" — to surface the real hesitation. Proactively address the 2-3 most common doubts for this product before they're even raised. Offer one small, low-commitment next step (a brochure, a short call, a trial) rather than pushing for the full decision immediately. Set a clear, specific follow-up time rather than leaving it open-ended.
Why it works (India): Many people use a soft "let me think about it" as a polite way to avoid an outright "no" rather than a genuine need for more time — often what's actually needed is help resolving a specific unstated doubt, not more time alone.
How to apply: Prepare 3-4 ready responses for this exact moment in advance, so the follow-up question comes across as genuinely helpful rather than pushy or scripted-sounding.
Expected Metrics: Structured, prompt follow-up on a "let me think about it" response is commonly reported to meaningfully improve eventual conversion compared to no follow-up at all — the exact percentage varies too much by category to state reliably; track your own follow-up conversion rate as the real number that matters.
Common Mistakes: Accepting the soft exit and never following up at all; the opposite failure of following up too aggressively/frequently, which can push a genuinely undecided customer further away.`,
  },
  {
    category: "channel_playbook",
    title: "Reels hook formulas for Indian audiences",
    content: `Situation: Use when Reels are getting views but completion rate is low — viewers are dropping off before the actual content lands.
Strategy: Use one of these hook types in the first 1-1.5 seconds specifically: a strong claim ("90% of people get this wrong"), a relatable pain point ("do you deal with this every day?"), a curiosity gap ("I tried this and the result was..."), or a pattern interrupt (an unexpected visual that breaks scrolling autopilot).
Why it works (India): Attention spans in short-form feeds are genuinely short — if the opening 1-1.5 seconds doesn't hook attention, the rest of the video, however good, is never seen by most viewers.
How to apply: Script the first 1-1.5 seconds of every Reel as its own deliberate unit, separate from planning the rest of the video — treat it as the single highest-leverage part of the whole piece.
Expected Metrics: The direct signal to track is average watch time and completion rate for a specific Reel relative to the account's own recent average — there's no universal target number across accounts/niches, but a hook change that measurably raises completion rate relative to your own baseline is working.
Common Mistakes: Starting with a slow build-up or a logo/intro animation before the hook; taking too long to get to the actual point of the video, losing viewers who came for a fast answer.`,
  },
  {
    category: "indian_market",
    title: "Festival marketing without looking discount-desperate",
    content: `Situation: Use when planning promotions around Diwali, Holi, Eid, New Year, or other major Indian festivals, to avoid the common trap of escalating discount after discount.
Strategy: Start value-driven content roughly 3 weeks before the festival, well ahead of the hard offer. During festival week itself, use limited-stock or limited-time framing rather than pure percentage-off messaging. Keep the discount secondary in the messaging — lead with the occasion and emotion (gifting, togetherness, renewal), not the number. Offer a distinct early-bird incentive separate from the main festival offer.
Why it works (India): Festivals are genuinely high-intent purchase moments, but leading purely with escalating discounts trains customers to wait for the biggest number and can make the brand feel cheap rather than festive/premium.
How to apply: Build a dedicated content and offer calendar for each major festival relevant to the business's customer base, planned weeks ahead rather than assembled at the last minute.
Expected Metrics: Festival-period campaigns are commonly expected to show better AOV and conversion rate than non-festival periods for the same business — the size of that lift varies too much by category to generalize; compare year-over-year performance for the SAME festival as the more reliable internal benchmark.
Common Mistakes: Relying purely on "X% off" as the entire festival message with no occasion/emotional framing; only starting festival preparation the week of the festival, missing both the planning window and facing inflated last-minute ad costs.`,
  },
  {
    category: "channel_playbook",
    title: "A retargeting sequence that doesn't feel like harassment",
    content: `Situation: Use when retargeting website visitors or video viewers and frequency/repetition is starting to generate visible irritation (negative comments, ad fatigue) rather than conversions.
Strategy: Stage the sequence over roughly two weeks — days 1-3: value/education-focused ad, days 4-7: social proof plus a soft offer, days 8-14: a stronger offer with genuine urgency. Cap ad frequency at roughly 3-4 impressions per person per week rather than letting it run unrestricted.
Why it works (India): The same ad shown repeatedly with no variation or frequency control tends to turn brand sentiment negative well before it converts a hesitant viewer — staging the message and capping frequency respects the viewer's patience while still using the retargeting window effectively.
How to apply: Build the retargeting campaign as genuinely distinct ad sets/creative for each time window rather than one static ad running the whole retargeting period, and set an explicit frequency cap in the ad platform rather than leaving it unrestricted.
Expected Metrics: Keeping frequency in the roughly 3-4/week range is commonly associated with better conversion outcomes than higher, uncapped frequency in general retargeting practice — exact numbers vary by category/creative fatigue rate; watch for declining click-through as your own signal that a specific creative needs refreshing.
Common Mistakes: Running the identical creative for two weeks or more without variation; leaving frequency completely uncapped, allowing the same person to see the ad far more often than is useful.`,
  },
  {
    category: "indian_market",
    title: "Building authority for a new or low-trust category business",
    content: `Situation: Use when the business is new, or operates in a category where customers are generally wary of unfamiliar brands (health, finance, anything with a real quality/safety concern).
Strategy: Put a real founder or expert face in front of the brand rather than staying anonymous. Show process transparency (how things are actually made/delivered/verified). Feature real customers by name and photo where possible, not just anonymous testimonials. Surface any third-party validation available — reviews, certifications, media mentions.
Why it works (India): People generally extend more trust to a recognizable face and a visible process than to an anonymous brand — in low-trust categories specifically, this is often a bigger lever than product claims alone.
How to apply: Plan for at least 2-3 pieces of authority-building content (founder-facing, process-transparency, or real-customer-featuring content) per week as a standing content category, not a one-off campaign.
Expected Metrics: The signal to track is engagement quality (saves, shares, meaningful comments, not just likes) on authority-building content specifically, as an indicator it's genuinely landing with the audience — there's no universal target number for this across categories.
Common Mistakes: Posting only product photography with no face, process, or third-party validation ever shown; treating authority-building as a single campaign rather than an ongoing content category.`,
  },
  {
    category: "metrics",
    title: "When to scale Meta Ads budget (and when not to)",
    content: `Situation: Use when a campaign is generating leads/sales and there's a decision to make about whether and how much to increase budget.
Strategy: Wait for at least 4-5 days of genuinely stable results before considering a change. Confirm cost-per-result is in an acceptable range for the business's margins before scaling. When scaling, increase budget by roughly 20-30% at a time rather than doubling it outright. Observe for about 3 days after each increase before making the next change.
Why it works (India): A sudden large budget jump (e.g. doubling overnight) commonly resets the ad's delivery optimization, temporarily raising cost-per-result — smaller, staged increases let the algorithm adjust without losing its existing optimization.
How to apply: Write down this scaling rule explicitly (stable results first, 20-30% increments, 3-day observation windows) before results are good, so the decision is a rule followed under pressure/excitement rather than an improvised reaction to one good day.
Expected Metrics: A rough, commonly-used guideline is that cost-per-result shouldn't rise more than about 15-20% after a scaling step if the increase was reasonable — this is a general practice heuristic, not a guaranteed outcome, and the right number varies by account/category; the more reliable approach is comparing each scaling step against your own account's baseline.
Common Mistakes: Doubling (or more) the budget immediately after one good day of results; making another change before the 3-day observation window has passed, making it impossible to tell which change caused which effect.`,
  },
];
