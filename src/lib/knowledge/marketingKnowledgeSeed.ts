export interface KnowledgeSeedEntry {
  category: "framework" | "case_study" | "channel_playbook" | "psychology" | "metrics";
  title: string;
  content: string;
}

// Deep format, per entry:
// Situation → when this actually applies
// Strategy → concrete, actionable steps
// Why it works (India) → the actual mechanism, grounded in Indian market reality where relevant
// How to apply → practical implementation for a small/mid Indian business
// Expected Metrics → honest ranges where genuinely known, explicitly flagged as directional/uncertain where not
// Common Mistakes → real, specific failure patterns, not generic warnings

export const MARKETING_KNOWLEDGE_SEED: KnowledgeSeedEntry[] = [
  {
    category: "framework",
    title: "AIDA (Attention, Interest, Desire, Action)",
    content: `Situation: Use when writing any single piece of persuasive content — an ad, a landing page, a sales message — that needs to move a cold or lukewarm reader toward action in one sitting.
Strategy: Structure the piece in four deliberate moves. Attention — a hook in the first line (a bold claim, a striking visual, a sharp question) that stops the scroll. Interest — make it personally relevant to THIS reader, not generic features. Desire — help them picture owning/using it (social proof, before/after, emotional payoff). Action — one clear, low-friction next step, not three competing CTAs.
Why it works (India): Indian consumers scrolling WhatsApp Status, Instagram, and Facebook are bombarded with content — without a real Attention hook, nothing else in the sequence gets read at all. And because trust is a bigger purchase barrier here than in many markets, the Desire stage needs real social proof (reviews, "X log already khareed chuke hain"), not just aspirational imagery.
How to apply: Before writing, literally label each sentence you draft with which AIDA stage it belongs to. If a piece jumps straight to Action ("Buy Now — 20% off") without earning Attention and Desire first, it reads as a hard sell and underperforms.
Expected Metrics: No universal number exists — but content following AIDA structure consistently outperforms unstructured copy in A/B tests across categories; treat this as a structural improvement, not a guaranteed lift percentage.
Common Mistakes: Writing a weak, generic hook ("Check out our new collection") that fails to earn Attention; skipping Desire entirely and jumping from features to a hard CTA; using more than one competing call-to-action in the same piece.`,
  },
  {
    category: "framework",
    title: "Jobs-to-be-Done (JTBD)",
    content: `Situation: Use when product/service messaging feels flat despite good quality — usually a sign the copy describes the PRODUCT instead of the JOB the customer is hiring it for.
Strategy: For any product, ask three layers of "job": the functional job (what it literally does), the emotional job (how it makes them feel), and the social job (how it makes them look to others). Write copy that names the job, not just the spec sheet.
Why it works (India): Indian buying decisions are often heavily social/relational (family opinion, festival occasion, gifting context) — the social job frequently matters as much as the functional one, something purely feature-led copy misses entirely.
How to apply: Interview 5-10 real customers with one question — "what were you actually trying to accomplish when you bought this?" — and write down their literal words. Use those words in marketing copy instead of internally-generated feature language.
Expected Metrics: Not directly measurable as a single number — evaluate qualitatively by whether customer language in reviews/testimonials starts echoing back the job-framed messaging, a sign it resonated.
Common Mistakes: Describing specs ("40-hour burn time, soy wax") instead of the job ("a 10-minute ritual to unwind after work"); assuming the functional job is the whole story and ignoring the emotional/social layers.`,
  },
  {
    category: "framework",
    title: "StoryBrand — customer as the hero",
    content: `Situation: Use when reviewing "About Us" pages, brand messaging, or any content that centers the BUSINESS's story instead of the customer's.
Strategy: In narrative terms, the customer is the hero (like Luke Skywalker), the business is the guide (like Yoda) — the guide has a plan and helps the hero overcome an obstacle. Rewrite "we are the best, award-winning, 10 years of experience" framing into "you deserve [outcome] — here's exactly how to get there."
Why it works (India): Trust-building matters enormously for Indian small-business buyers who are often more price/risk-sensitive — a guide-framed message ("we'll help you get X") builds more trust than a hero-framed one ("we are the best"), which reads as self-congratulation rather than an offer of help.
How to apply: Audit existing website/social copy for sentences starting with "We" and rewrite the majority to start with "You" — the ratio shift alone often reveals how hero-centric the current messaging is.
Expected Metrics: No standard benchmark exists for this structural change alone; track qualitatively via engagement/time-on-page changes after a rewrite, not as an isolated guaranteed lift.
Common Mistakes: Founder-story-heavy homepages that never address what the visitor gets; testimonials framed around praising the business rather than the specific transformation the customer experienced.`,
  },
  {
    category: "framework",
    title: "Funnel-stage awareness (TOFU/MOFU/BOFU)",
    content: `Situation: Use when a content calendar or ad strategy is producing content but conversions feel flat — often a sign every piece is written for the wrong funnel stage.
Strategy: Match content intensity to audience readiness. Top-of-funnel (cold audience, doesn't know the business) — educational, entertaining, low-pressure. Middle-of-funnel (knows the business, undecided) — comparisons, testimonials, deeper product info. Bottom-of-funnel (ready to decide) — discount codes, urgency, direct CTAs, retargeting.
Why it works (India): A large share of small-business social reach in India is genuinely cold (first-time viewers via Reels/Explore) — hitting them with BOFU hard-sell content ("50% off, buy now") before any trust is built reads as spam and gets scrolled past or actively distrusted.
How to apply: Tag every planned content piece with its intended funnel stage before creating it. A content calendar that's 90%+ BOFU-style offers with almost no TOFU educational/entertainment content is a real warning sign.
Expected Metrics: Directional only — TOFU content is typically judged on reach/engagement/follows, MOFU on saves/profile visits/DMs, BOFU on direct conversions; treating all three with the same metric (e.g. judging a TOFU Reel purely by immediate sales) misreads its actual job.
Common Mistakes: Running only BOFU-style promotional content and wondering why cold reach doesn't convert; never retargeting warm audiences (MOFU/BOFU-ready people) with anything more direct than repeated TOFU content.`,
  },
  {
    category: "framework",
    title: "4Ps of Marketing (Product, Price, Place, Promotion)",
    content: `Situation: Use as a diagnostic when sales are weak and the instinct is to "do more marketing" — often the real problem is in one of the other three Ps, not Promotion.
Strategy: Systematically check all four before assuming an awareness problem. Product — is what's offered actually right (features, quality, variants)? Price — is it framed right (one-time vs. subscription, bundled vs. itemized), not just the number? Place — is it actually easy to buy from (right channel, right availability)? Promotion — is anyone hearing about it at all?
Why it works (India): Indian small businesses very commonly diagnose every sales problem as a Promotion problem ("we need more ads") when the real block is Place (hard-to-navigate checkout, no COD option, inconsistent stock) or Price (positioned wrong for the target segment's price sensitivity).
How to apply: Before increasing ad spend, walk through the actual customer buying journey end-to-end as if a stranger — note every friction point in Product, Price, and Place before assuming Promotion is the gap.
Expected Metrics: Not a single measurable number — this is a diagnostic exercise; success is measured by whether the actual root-cause friction gets identified and fixed, not by a marketing metric alone.
Common Mistakes: Increasing ad spend to fix a checkout/Place problem; assuming price sensitivity means "must be cheapest" rather than checking if the price is simply framed/justified poorly.`,
  },
  {
    category: "framework",
    title: "Value Proposition Canvas",
    content: `Situation: Use when a homepage headline or ad copy feels generic and could describe almost any competitor's product equally well.
Strategy: Map two sides against each other explicitly — the Customer Profile (their jobs, pains, gains) and the Value Map (your product's pain relievers and gain creators). For every claimed benefit, name the SPECIFIC customer pain or gain it maps to.
Why it works (India): Price-sensitive, trust-conscious Indian buyers respond to specificity over generic "quality" claims — a value proposition that names a precise pain ("tired of candles that lose scent within a week?") lands harder than "premium quality candles."
How to apply: Read the current headline and ask "which specific pain or gain does this map to?" If the answer is unclear, the copy is talking about the product's features, not the customer's actual situation.
Expected Metrics: No universal benchmark; evaluate via qualitative message-testing (which headline variant gets more engagement/click-through in A/B tests) rather than an absolute target number.
Common Mistakes: Listing product features without ever naming which customer pain each one solves; writing value props broad enough to apply to any competitor equally.`,
  },
  {
    category: "framework",
    title: "Positioning statement framework",
    content: `Situation: Use when brand messaging feels vague ("good quality, affordable") and doesn't clearly differentiate from competitors.
Strategy: Fill the template — "For [target customer] who [need/pain], [product] is a [category] that [key benefit], unlike [main alternative], because [reason to believe]." The critical, often-skipped part is naming a real alternative — even "unlike doing nothing" is a valid, honest comparison.
Why it works (India): Many Indian small-business categories are genuinely crowded (near-identical competitors on price/quality claims) — naming a specific comparison forces real differentiation instead of interchangeable "we're the best" messaging that every competitor also claims.
How to apply: Fill in the template literally, including a named alternative, even if it feels slightly uncomfortable to name a competitor or "no purchase" as the comparison — that discomfort is usually a sign the positioning is finally becoming specific.
Expected Metrics: Not directly measurable; evaluate by whether a stranger reading only the positioning statement could distinguish this business from its top 2-3 competitors.
Common Mistakes: Writing positioning that avoids naming any alternative, resulting in vague "for everyone who wants quality" statements that don't differentiate.`,
  },
  {
    category: "framework",
    title: "RACE framework (Reach, Act, Convert, Engage)",
    content: `Situation: Use when auditing whether a marketing plan is actually complete, not just heavy on one or two stages.
Strategy: Plan explicitly across all four stages — Reach (SEO, ads, social, PR to get found), Act (engagement — clicks, sign-ups, content interaction), Convert (the actual sale/lead capture), Engage (retention, repeat purchase, referral — the stage most small businesses skip entirely).
Why it works (India): Repeat-purchase and word-of-mouth (via WhatsApp forwarding, family/friend recommendation) are unusually powerful growth levers in Indian markets — a plan with zero Engage-stage activity misses one of the cheapest, highest-trust growth channels available.
How to apply: List current marketing activities and tag each with Reach/Act/Convert/Engage. If Engage has zero listed activities, that's the single highest-leverage gap to close next, often cheaper to fix than adding more Reach spend.
Expected Metrics: Track each stage with its own metric — Reach (impressions/followers), Act (engagement rate/CTR), Convert (conversion rate), Engage (repeat purchase rate/referral rate) — don't judge all four with one blended number.
Common Mistakes: Heavy investment in Reach and Convert with literally no formal retention/referral activity; treating "we'll deal with retention later" as an acceptable long-term plan.`,
  },
  {
    category: "framework",
    title: "Growth loops vs. funnels",
    content: `Situation: Use when deciding where to invest marketing effort for compounding, not just linear, growth.
Strategy: A funnel resets to zero each cycle — traffic in, some % converts, repeat from scratch. A loop compounds — one cycle's output becomes the next cycle's input (referral programs, user-generated content, affiliate networks where affiliates' audiences become new affiliates).
Why it works (India): Referral-driven growth is disproportionately effective in India because of high WhatsApp-forwarding behavior and strong trust-in-personal-recommendation culture — a loop mechanism (referral discount, affiliate program) leverages this cultural pattern directly, unlike pure paid-ad funnels which fight against ad fatigue and rising CPMs.
How to apply: Ask of every marketing activity: "does this have to be repeated from scratch every time, or does it compound?" Activities that compound (referral programs, affiliate networks, shareable content formats) deserve disproportionate investment relative to pure one-off funnel spend.
Expected Metrics: Loop health is measured by a "viral coefficient" or referral rate (how many new customers each existing customer brings) — even a modest rate compounds meaningfully over many cycles, unlike a funnel which never compounds regardless of efficiency.
Common Mistakes: 100% funnel-based growth strategy with zero loop mechanisms, meaning growth requires constantly increasing ad spend rather than ever getting cheaper over time.`,
  },
  {
    category: "framework",
    title: "Jobs-to-be-Done: the 'hire and fire' lens",
    content: `Situation: Use when trying to win customers who are currently using a competitor or "doing nothing" (the most common competitor for small businesses).
Strategy: Understand not just what gets "hired" (the new product) but what gets "fired" (whatever they were using before). Identify the specific triggering moment that made the old option or inaction finally unacceptable.
Why it works (India): For many Indian small-business categories, the real competitor isn't another brand — it's inertia/inaction (people not yet convinced they need to change anything). Messaging that names the firing moment ("tired of your current supplier's inconsistent quality?") speaks directly to someone already primed to switch, unlike generic new-product messaging.
How to apply: In customer interviews, ask specifically "what finally made you look for an alternative?" — the answer reveals the firing trigger, which should become a headline or hook, not buried in body copy.
Expected Metrics: Not directly measurable as one number; qualitatively evaluate whether new messaging generates more "yes, exactly, that's my problem" responses in customer conversations/comments.
Common Mistakes: Marketing that only describes the new product's features and never addresses why someone would abandon their current option or habit.`,
  },
  {
    category: "framework",
    title: "The 3 Horizons of content strategy",
    content: `Situation: Use when planning a content calendar to ensure it's not 100% reactive/trend-chasing or 100% evergreen with no cultural relevance.
Strategy: Plan across three horizons — Horizon 1 (evergreen, answers year-round searched questions, compounds via SEO), Horizon 2 (seasonal/cyclical — festivals, recurring calendar moments), Horizon 3 (reactive/trending — current events, viral formats).
Why it works (India): The Indian festival calendar (Diwali, Eid, regional festivals, wedding season) creates real, recurring, high-intent commercial moments that a content plan should deliberately capture (Horizon 2) — missing this is a common gap for businesses that only think in Horizon 1 (generic evergreen) or Horizon 3 (chasing trends).
How to apply: Build a majority-Horizon-1 base (the compounding SEO/content asset), layer in Horizon 2 around real business-relevant festivals/seasons planned 4-6 weeks ahead, and use Horizon 3 sparingly, only when a trend genuinely fits the brand voice.
Expected Metrics: Horizon 1 content should be judged on long-term organic traffic growth (weeks/months), Horizon 2 on festival-period conversion spikes, Horizon 3 on short-term reach/virality — using the same short-term metric for all three misjudges Horizon 1's real payoff timeline.
Common Mistakes: A content calendar that's 100% Horizon 3 (always chasing trends, never building a durable asset); planning festival content the week of the festival instead of 4-6 weeks ahead, missing the pre-festival planning/shopping window.`,
  },
  {
    category: "framework",
    title: "Blue Ocean vs. Red Ocean strategy",
    content: `Situation: Use when a business is stuck competing purely on price in a crowded category with many near-identical competitors.
Strategy: Instead of competing better on the same one or two axes everyone competes on (usually price and generic "quality"), pick a genuinely different axis to compete on — even a small, specific one most competitors ignore.
Why it works (India): Many Indian small-business categories (candles, snacks, clothing, services) are intensely price-competitive Red Oceans — a business that instead leads with a specific, ownable axis ("fastest delivery in the city," "the only one offering custom sizing," "handmade in small batches") creates a small Blue Ocean within the crowded category, avoiding a comparison customers can't easily make against price-focused competitors.
How to apply: List every axis competitors advertise on (usually price, quality, speed). Identify one genuine, sustainable axis the business can own that competitors either can't or don't emphasize, and lead marketing with that instead of joining the price race.
Expected Metrics: Not a standalone metric; evaluate success via whether the business can maintain pricing/margins better than pure price-competitors in the same category, a sign the differentiation is real, not just messaging.
Common Mistakes: Claiming a "unique" differentiator that's actually generic ("best quality") rather than a genuinely specific, ownable axis; competing on price while claiming differentiation elsewhere in messaging — an inconsistent position.`,
  },
  {
    category: "channel_playbook",
    title: "WhatsApp Business marketing playbook (India)",
    content: `Situation: Use for any Indian small business — WhatsApp is close to a default channel here, not an optional add-on.
Strategy: (1) Never send pure sales broadcasts — mix value (tips, updates) with offers so the channel doesn't get muted. (2) Use WhatsApp for what email/ads can't do — order confirmations, real-time question-answering, personal follow-ups. (3) Segment broadcasts by lead temperature (hot/warm/cold) rather than blasting everyone identically. (4) Keep messages short and conversational, like a message from a real person. (5) Always give an easy opt-out and honor it immediately.
Why it works (India): WhatsApp commonly sees 70-90%+ open rates in Indian small-business use versus single-digit email open rates — it is the highest-trust, highest-attention channel available, precisely because it's normally reserved for personal relationships, which is also why misuse (spammy broadcasts) burns trust unusually fast.
How to apply: Set up segmented broadcast lists by lead temperature in the CRM before sending anything; draft messages in a conversational, first-person voice rather than a formal "Dear Customer" template.
Expected Metrics: Real, commonly-observed range: 70-90%+ open rates for well-managed lists (vs. single-digit email); response/click rates vary far more by message relevance and segment quality, no single reliable benchmark — treat as directional.
Common Mistakes: Sending the same broadcast to the entire list regardless of lead temperature; only ever sending promotional content, causing recipients to mute or block the number; ignoring opt-out requests, which risks both trust damage and platform policy issues.`,
  },
  {
    category: "channel_playbook",
    title: "Instagram Reels strategy for small businesses",
    content: `Situation: Use when trying to grow discovery/reach for a small account without a large existing following — Reels rewards watch-time and shareability over follower count.
Strategy: Hook in the first 1-2 seconds matters more than production quality. Formats that reliably work: behind-the-scenes/process videos, before/after transformations, quick niche-relevant tips, relatable humor tied to the customer's pain point. Post consistently (3-5x/week) rather than occasionally with high polish.
Why it works (India): The algorithm favors accounts posting regularly and rewards genuine watch-time/shares over follower count — a small Indian business account with a strong, culturally relevant hook can outperform a much larger account's polished-but-generic content, which levels the playing field for small businesses without big production budgets.
How to apply: Script only the first 1-2 seconds carefully (the hook); the rest can be simpler. Extend the hook's idea in the caption rather than repeating the video, adding context or a CTA the video didn't have room for.
Expected Metrics: Judge Reels primarily by watch-time/completion rate and shares/saves, not likes alone — a Reel with modest likes but high completion and shares is doing more algorithmic work than one with many likes and low completion. No universal "good" view-count benchmark exists across account sizes.
Common Mistakes: Weak or slow-building openings that lose viewers before the actual content starts; posting inconsistently (a burst of Reels then silence for weeks); judging success purely by immediate sales rather than reach/follow growth, which is Reels' more realistic primary job.`,
  },
  {
    category: "channel_playbook",
    title: "Paid ads targeting for budget-conscious Indian SMBs",
    content: `Situation: Use when running Meta/Google ads on a small daily budget (roughly ₹500-5,000/day range) where narrow targeting often underperforms.
Strategy: Start broad (city + a couple of relevant interests) rather than narrow interest-stacking — the platform's optimization needs volume to work well, and audiences under roughly 50,000 people often can't spend budget efficiently. Prioritize retargeting warm audiences (past visitors, engaged followers) over cold targeting when budget must be cut. Test 2-3 creative variations simultaneously, not one, since creative fatigue happens fast on small budgets.
Why it works (India): With genuinely small daily budgets, the algorithm needs enough signal/volume to optimize — over-narrow targeting starves it of data, often resulting in higher cost-per-result than a broader audience with more spend-through-optimization room.
How to apply: Begin campaigns with a broad city + 1-2 interest audience rather than combining five narrow interests; set aside a portion of budget specifically for retargeting past website visitors/engaged followers, since this audience typically converts more efficiently than cold traffic.
Expected Metrics: Highly category-dependent — cost-per-lead and CPM vary enormously by industry and season (festival periods raise costs); track the TREND for your own account over time as the most reliable signal, rather than comparing to an external "industry average" number that may not reflect your specific category/city.
Common Mistakes: Manually stacking multiple narrow interests, starving the algorithm of optimization data; cutting retargeting budget before cold-audience budget when trimming spend, when the reverse is usually more cost-efficient; running only one ad creative until it fatigues instead of rotating 2-3 from the start.`,
  },
  {
    category: "channel_playbook",
    title: "Local SEO fundamentals for small businesses",
    content: `Situation: Use for any business with a physical location or defined local service area — local search behavior (Google Maps, "near me" searches) is a major, often under-invested channel.
Strategy: Prioritize an accurate, actively-updated Google Business Profile (GBP) — regular posts, quick review responses, correct hours/category — over pure website SEO for local visibility. Keep NAP (Name, Address, Phone) identical across website, GBP, and any directories. Actively ask every satisfied customer for a review rather than passively hoping for one. Build city + service-specific content pages ("[service] in [city]") matching how people actually search locally.
Why it works (India): Local map-pack rankings are heavily influenced by GBP completeness/activity and review volume/recency — for a local Indian business, this is often a faster, cheaper lever than competing on broad organic search rankings against much larger sites.
How to apply: Audit GBP completeness (hours, category, photos, posts) monthly; build a simple habit of asking for a review at the point of a positive interaction (delivery, in-store purchase) rather than only via a passive follow-up email.
Expected Metrics: Review count and average rating are the most visible/trackable local SEO signals; local map-pack ranking itself has no single universal benchmark — track relative improvement over time via Google Business Profile's own insights (views, calls, direction requests) rather than an external number.
Common Mistakes: An inactive, incomplete GBP profile (missing hours/category/photos); inconsistent NAP information across platforms, which actively hurts local ranking signals; never proactively asking customers for reviews, resulting in a low review count that undermines trust signals.`,
  },
];
