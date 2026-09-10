-- ============================================================
-- Delivery status on each daily campaign performance snapshot
-- ============================================================
-- The Campaign Performance History table outlives campaigns: it keeps
-- a campaign's numbers after it is paused, deleted on Meta, or the
-- Facebook connection changes. Its new Status column reads Meta live,
-- but when Meta can't be reached — or no longer has the campaign — it
-- needs the LAST KNOWN status, and when that was. Each daily snapshot
-- now records it.
--
-- Numbered 176, not 172: migrations 172-175 were issued in chat and
-- never saved to this folder, so the next free number is taken as 176
-- to avoid a collision.
--
-- Safe to run late. The snapshot job writes these columns in a
-- separate, best-effort step after the snapshot itself, so history
-- keeps recording whether or not this has run (migration 140 was run
-- late once, and the column it added broke a save that depended on it).

alter table campaign_performance_history add column if not exists delivery_status text
  check (delivery_status is null or delivery_status in (
    'active', 'paused', 'not_delivering', 'deleted', 'archived', 'not_found', 'mismatch', 'not_on_meta', 'unknown'
  ));

-- Meta's reason, in words, when there is one: "Meta is still reviewing
-- the ad", "Meta: An unexpected error has occurred", and so on.
alter table campaign_performance_history add column if not exists delivery_detail text;
