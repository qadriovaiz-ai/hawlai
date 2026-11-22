-- Phase 1 item 2 — what the owner has already settled in a conversation.
--
-- THE FAILURE THIS EXISTS FOR, 21 November 2026. Asked to edit a
-- collection without naming one, the tool returned "which collection?"
-- with all three real collections attached. The owner answered
-- "Home page" — a real collection, Shopify's own default. The model
-- then told him "Home page is not a collection, it's a regular website
-- page", contradicting a tool result it already held.
--
-- Nothing had recorded THE OWNER CHOSE frontpage. The model's entire
-- view of the conversation is `[...history.slice(-10), message]`, and
-- that history arrives from the browser as prose. There was no
-- conversational state of any kind: a decision made two turns ago
-- existed only as a sentence to be re-read and re-interpreted, and the
-- model's prior about what a name "sounds like" competed with it on
-- equal terms.
--
-- Classical task-oriented dialogue has the structure for this: a
-- dialogue state of (slot, value) pairs, where INFORMABLE slots are the
-- ones the user provides. The owner informed one. Nobody wrote it down.
--
-- A COLUMN RATHER THAN A TABLE, decided with the owner on 22 November.
-- These are per-conversation working state, not an audit trail — they
-- live and die with the conversation. The audit trail of what was
-- actually done already exists in publish_actions and
-- pending_approvals, and duplicating it here would create two records
-- of the same decision that could disagree.
--
-- SHAPE: a flat object of slot -> { value, label, at }, e.g.
--   {
--     "surface":    { "value": "shopify",   "label": "your Shopify store", "at": "2026-11-22T…" },
--     "collection": { "value": "frontpage", "label": "Home page",          "at": "2026-11-22T…" }
--   }
-- `value` is what a tool call needs. `label` is what the owner called
-- it, so the chat can refer back in his words. `at` is when it was
-- settled, so a stale slot can be aged out rather than trusted for
-- ever.
--
-- NOT NULLABLE, DEFAULT EMPTY. A null here would make "nothing settled
-- yet" and "I could not read the slots" the same value, and the second
-- must never be treated as the first — that is how a settled answer
-- would silently stop being honoured.

alter table chat_conversations
  add column if not exists settled jsonb not null default '{}'::jsonb;

comment on column chat_conversations.settled is
  'Slots the owner has settled in this conversation: slot -> {value,label,at}. Working state, not an audit trail — publish_actions holds what was actually done. Written when a tool resolves a target or the owner answers a clarification; read into the chat context so the model cannot re-litigate an answered question.';
