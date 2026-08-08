-- Migration 081: Persist Master Chat artifacts, not just tools_used.
--
-- chat_messages already saved which tools ran (tools_used), but never
-- saved what those tools actually produced (artifacts) — so the inline
-- result cards only showed on a message right after sending it, and
-- disappeared the moment the conversation was reopened or the page
-- reloaded, since there was nothing in the DB to restore them from.

alter table chat_messages add column if not exists artifacts jsonb default '[]'::jsonb;
