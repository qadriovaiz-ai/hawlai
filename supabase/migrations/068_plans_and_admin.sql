-- Usage-based plans + a restricted platform-admin view.
--
-- dealerships.plan: which tier a business is on (free/growth/pro,
-- matching the pricing tiers discussed) — for now this is a manual
-- label (settable by the platform owner), not yet enforced by a real
-- payment/subscription flow. It exists so the usage dashboard can show
-- "X of Y used this month" against real limits rather than raw counts
-- with nothing to compare against.
--
-- profiles.is_platform_admin: gates a completely separate "Spend"
-- view that shows cost/usage totals ACROSS every business on the
-- platform — this is Hawlai's own operating-cost visibility, not
-- something any individual business owner should see about other
-- businesses. False by default; the platform owner (and anyone they
-- explicitly promote, e.g. a finance team member) sets this manually.
alter table dealerships add column if not exists plan text default 'free'; -- 'free' | 'growth' | 'pro'
alter table profiles add column if not exists is_platform_admin boolean default false;
