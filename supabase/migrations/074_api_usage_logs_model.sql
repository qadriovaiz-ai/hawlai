-- Records which Claude model tier actually ran for each logged call
-- (Opus/Sonnet/Haiku) — nullable so existing rows before this
-- migration stay valid; new rows from logClaudeUsage populate it
-- going forward. This is what makes a future "cost by model" view in
-- /dashboard/admin/spend possible — the cost_inr total was already
-- computed correctly per-model once pricing.ts learned per-model
-- rates, this just keeps the model itself queryable, not just baked
-- into the already-computed total.
alter table api_usage_logs add column if not exists model text;
