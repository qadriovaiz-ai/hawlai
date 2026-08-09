-- Migration 093: Add two new marketing_knowledge categories —
-- objection_handling and indian_market — to cover content that
-- doesn't fit cleanly into the original 5 categories.

alter table marketing_knowledge drop constraint if exists marketing_knowledge_category_check;
alter table marketing_knowledge add constraint marketing_knowledge_category_check
  check (category in ('framework', 'case_study', 'channel_playbook', 'psychology', 'metrics', 'objection_handling', 'indian_market'));
