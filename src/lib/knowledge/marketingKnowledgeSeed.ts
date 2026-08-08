export interface KnowledgeSeedEntry {
  category: "framework" | "case_study" | "channel_playbook" | "psychology" | "metrics";
  title: string;
  content: string;
}

export const MARKETING_KNOWLEDGE_SEED: KnowledgeSeedEntry[] = [
  // ---- Frameworks ----
  {
    category: "framework",
    title: "AIDA (Attention, Interest, Desire, Action)",
    content: "AIDA maps the stages a customer moves through before buying: Attention (a scroll-stopping hook — a striking visual, a bold claim, a question), Interest (why this matters to THEM specifically, not generic features), Desire (make them picture owning/using it — social proof, before/after, emotional payoff), Action (one clear, low-friction next step — a single CTA, not three competing ones). The most common mistake is writing content that jumps straight to Action (a hard sell) without first earning Attention and Desire — this is why cold ads with 'Buy Now' as the first line underperform content that opens with a hook.",
  },
  {
    category: "framework",
    title: "Jobs-to-be-Done (JTBD)",
    content: "Customers don't buy products, they 'hire' them to do a job. A person buying a home fragrance candle isn't buying wax and scent — they're hiring it to make their home feel calmer, or to feel like they've done something nice for themselves. The job is functional (what it does), emotional (how it makes them feel), and social (how it makes them look to others). Good marketing copy names the job, not just the product features — 'a 10-minute ritual to unwind after work' sells the job; 'soy wax, 40-hour burn time' sells the spec sheet. Ask: what job is this customer hiring us to do, and does our messaging speak to that job?",
  },
  {
    category: "framework",
    title: "StoryBrand — customer as the hero",
    content: "In StoryBrand narrative structure, the CUSTOMER is the hero of the story, not the business. The business is the guide (like Yoda, not Luke) who has a plan and helps the hero overcome an obstacle to get what they want. Common mistake: brand messaging that makes the business the hero ('we are the best, award-winning...') — customers tune this out because they're looking for someone to help THEM succeed, not to admire the business. Reframe: instead of 'We've been serving customers for 10 years with the finest quality,' try 'You deserve [outcome] — here's exactly how to get there with us.'",
  },
  {
    category: "framework",
    title: "Funnel-stage awareness (TOFU/MOFU/BOFU)",
    content: "Top-of-funnel (TOFU) content should build awareness and trust with people who don't know the business yet — educational, entertaining, low-pressure (a Reel, a blog post, a helpful tip). Middle-of-funnel (MOFU) content nurtures people who know the business but haven't decided — comparisons, testimonials, deeper product info. Bottom-of-funnel (BOFU) content should close — discount codes, urgency, direct CTAs, retargeting ads. A common mistake is writing BOFU-style hard-sell copy ('50% off, buy now') as the very first thing a cold audience sees — it reads as pushy because they haven't built any trust or interest yet. Match the content's intensity to how far along the audience actually is.",
  },
  // ---- Channel playbooks ----
  {
    category: "channel_playbook",
    title: "WhatsApp Business marketing playbook (India)",
    content: "WhatsApp is the highest-trust, highest-open-rate channel for Indian small businesses — often 70-90%+ open rates versus single-digit email open rates. Best practices: (1) never send pure sales messages as broadcasts — mix value (tips, updates) with offers so the channel doesn't get muted; (2) use WhatsApp for the moments email/ads can't — order confirmations, personal follow-ups, answering questions in real time; (3) segment broadcasts by lead temperature (hot leads get direct offers, cold leads get value-first content) rather than blasting everyone the same message; (4) keep messages short and conversational, like a message from a real person, not a corporate newsletter; (5) always give an easy opt-out and respect it immediately — trust on this channel is fragile and hard to rebuild once broken.",
  },
  {
    category: "channel_playbook",
    title: "Instagram Reels strategy for small businesses",
    content: "Reels reward watch-time and shareability, not follower count — a small account's Reel can outperform a big account's if it's genuinely engaging. Hooks in the first 1-2 seconds matter more than production quality — a shaky phone video with a strong hook beats a polished video with a slow opening. Formats that consistently work for small businesses: behind-the-scenes/process videos (how it's made), before/after transformations, quick tips relevant to the niche, and relatable humor tied to the customer's pain point. Post consistency (3-5x/week) beats occasional perfection — the algorithm favors accounts that post regularly. Captions should extend the hook, not repeat the video — use the caption to add context or a CTA the video didn't have room for.",
  },
  {
    category: "channel_playbook",
    title: "Paid ads targeting for budget-conscious Indian SMBs",
    content: "With small budgets (₹500-5000/day range), broad interest-based targeting on Meta usually outperforms narrow targeting — the algorithm needs volume to optimize, and overly narrow audiences (under ~50k people) often can't spend the budget efficiently. Start with a broad audience (city + a couple of relevant interests) and let the platform's optimization find the right people, rather than manually guessing niche interest combinations. Retargeting warm audiences (past visitors, engaged followers) is almost always more cost-efficient than pure cold targeting — if any budget has to be cut, cut cold-audience spend before retargeting spend. Test 2-3 creative variations simultaneously rather than one — creative fatigue happens fast on small budgets, and having backups ready avoids a dead campaign while a new creative is made.",
  },
  {
    category: "channel_playbook",
    title: "Local SEO fundamentals for small businesses",
    content: "For a local business, Google Business Profile (GBP) accuracy and activity often matters more than website SEO — a complete, actively-updated GBP (regular posts, quick review responses, accurate hours/category) directly affects local map-pack rankings. NAP consistency (Name, Address, Phone identical everywhere — website, GBP, directories) is a real ranking signal; mismatched info across listings actively hurts rankings. Reviews matter for both ranking and conversion — asking every satisfied customer for a review (not just hoping they leave one) compounds over time. For content, city + service-specific pages ('[service] in [city]') consistently outperform generic pages for local search intent, since they match how people actually search.",
  },
  // ---- Case studies ----
  {
    category: "case_study",
    title: "Nykaa — content and trust before hard selling",
    content: "Nykaa built its early beauty e-commerce trust through content (tutorials, product education, influencer partnerships) well before leaning on paid ads or discounts — the strategic pattern was to become a trusted source of BEAUTY ADVICE first, which made the eventual product recommendation feel earned rather than pushy. The lesson for small businesses: especially in categories where trust/expertise matters (beauty, health, home fragrance, anything 'considered'), leading with genuinely useful content earns permission to sell later, and converts better than leading with a discount.",
  },
  {
    category: "case_study",
    title: "Meesho — social commerce and reseller-driven distribution (Tier 2/3 India)",
    content: "Meesho's growth pattern leaned heavily on empowering everyday people (often homemakers) to become resellers via WhatsApp/social sharing, rather than relying purely on direct-to-consumer paid acquisition — turning customers into a distribution channel. The transferable lesson for a small business: a referral or reseller/affiliate structure (even an informal one — 'share this with 3 friends and get X') can be dramatically cheaper than paid ads in price-sensitive markets, because it borrows trust from a personal relationship instead of buying attention from strangers.",
  },
  {
    category: "case_study",
    title: "Lenskart — hybrid online-offline trust building for a considered purchase",
    content: "Eyewear is a considered, try-before-you-buy category — Lenskart's pattern combined an online catalog/ordering with physical touchpoints (home try-on, stores) specifically to solve the trust gap of buying something so personal sight-unseen. The transferable lesson: for products where trust or fit is a real buying barrier, a purely digital funnel may need a trust-building bridge — a video call consultation, a sample/trial offer, a local pickup option — rather than expecting a cold online audience to buy blind.",
  },
  // ---- Psychology ----
  {
    category: "psychology",
    title: "Social proof and scarcity",
    content: "Social proof (reviews, testimonials, 'X people bought this', visible customer counts) works because people use others' behavior as a shortcut for their own decision, especially when uncertain — it's most powerful early in a customer's journey when trust hasn't been established yet. Scarcity (limited stock, limited time) works by making inaction feel costly, but overuse or fake scarcity ('only 2 left!' shown to everyone, every day) destroys trust once noticed — genuine scarcity (a real limited batch, a real deadline) is far more durable than manufactured urgency. Best practice: lead with social proof to build trust, use scarcity sparingly and honestly to prompt action once trust already exists.",
  },
  {
    category: "psychology",
    title: "Price anchoring and trust signals for price-sensitive buyers",
    content: "In price-sensitive markets, showing a higher reference price alongside the actual price (an anchor) makes the real price feel like a deal even without an active discount — but this only works if the anchor is credible (a real MRP, a real 'was' price the product actually sold at). For genuinely price-sensitive Indian buyers, trust signals (COD availability, easy returns, real reviews with photos, a real phone number visible, secure payment badges) often move conversion more than price itself — many buyers aren't looking for the cheapest option, they're looking for the least risky option. Reducing perceived risk is frequently a higher-leverage lever than cutting price.",
  },
  // ---- Metrics ----
  {
    category: "metrics",
    title: "CAC, LTV, and ROAS — how they relate",
    content: "CAC (Customer Acquisition Cost) = total spend to acquire customers ÷ number of customers acquired. LTV (Lifetime Value) = average revenue a customer generates over their whole relationship with the business, not just their first purchase. A healthy business generally wants LTV to be at least 3x CAC — spending ₹500 to acquire a customer only makes sense if that customer is worth meaingfully more than ₹500 over time, accounting for repeat purchases. ROAS (Return on Ad Spend) = revenue generated ÷ ad spend, and is a narrower, campaign-level metric — a campaign can have a great ROAS on a single sale while still being a bad long-term bet if those customers never come back (low LTV). The real question isn't just 'was this ad profitable today' but 'is this customer worth more than what it cost to get them, over time.'",
  },
  {
    category: "metrics",
    title: "Reading a conversion funnel (views → leads → customers)",
    content: "A funnel has multiple conversion rates stacked — views-to-leads, leads-to-customers — and the fix for a weak overall number depends entirely on WHICH stage is actually broken, not just the final number. Low views-to-leads with decent leads-to-customers usually means the offer/content isn't compelling enough to get people to act (a messaging/hook problem). Good views-to-leads with poor leads-to-customers usually means the follow-up, pricing, or trust-closing process is broken (a sales/closing problem), not a marketing problem — more traffic won't fix it. Diagnosing which stage is actually the bottleneck, using real numbers rather than guessing, should always come before deciding what to fix.",
  },
];
