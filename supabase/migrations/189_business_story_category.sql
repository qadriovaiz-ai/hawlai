-- ============================================================
-- The owner's Business Story, as a Business Knowledge category.
--
-- THE BUG (2026-09-18): the Business Story intake saved nothing. Every
-- answer was written with category 'Business story', and
-- business_knowledge.category has carried a CHECK constraint since
-- migration 118 allowing only hours / pricing_note / policy / faq /
-- general. Each insert was rejected by the database; the chat reported a
-- "technical hiccup", promised a later batch save that does not exist,
-- and carried on to the next question.
--
-- 'business_story' is added to the allowed list. Nothing else changes:
-- existing rows keep their categories.
-- ============================================================

alter table business_knowledge drop constraint if exists business_knowledge_category_check;
alter table business_knowledge add constraint business_knowledge_category_check
  check (category in ('hours', 'pricing_note', 'policy', 'faq', 'general', 'business_story'));
