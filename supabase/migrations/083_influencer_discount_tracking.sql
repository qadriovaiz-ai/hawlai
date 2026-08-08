-- Migration 083: Link a discount code to an influencer for automatic
-- ROI tracking, instead of only manually-typed leads/revenue numbers.
--
-- The dealer assigns each influencer their own code (e.g. PRIYA20).
-- Real orders that used that code are then counted and summed
-- automatically from the actual orders table — genuine attribution,
-- not another manually-entered guess.

alter table influencers add column if not exists discount_code text;

create index if not exists idx_influencers_discount_code on influencers(dealership_id, discount_code);
