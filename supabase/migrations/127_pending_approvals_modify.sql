-- ============================================================
-- Approve-with-modification — P0 11c
-- ============================================================
-- Right now an approver can only Approve-as-requested or Reject.
-- If a dealer requests a ₹5000/day budget change and the approver
-- wants to authorize ₹3000/day instead, there's no way to do that
-- without rejecting and asking them to resubmit. This adds a single
-- nullable snapshot of what the approver actually changed the
-- request to, if anything — null means approved exactly as
-- requested (the existing behavior, fully backward compatible).
--
-- Scoped to change_campaign_budget only at the app layer (the one
-- action type with a single clean numeric knob); the column itself
-- is generic jsonb so it isn't locked to that one action type.

alter table pending_approvals add column if not exists modified_details jsonb;
