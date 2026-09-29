-- 206: who wrote what is on a page.
--
-- THE LOOP THIS BREAKS. The claims guard checks copy against knownText()
-- — everything the business says about itself — and knownText() includes
-- the business's own website. The website is written by
-- websiteBuilderAgent. So a claim the machine wrote became the evidence
-- that approved the same claim everywhere else: "No paraffin. No
-- synthetic shortcuts." went onto a homepage unchecked and from then on
-- backed every future mention of paraffin. The claim backed itself.
--
-- Nothing in website_pages could tell those apart. `is_fallback` means
-- generation FAILED and a placeholder was used; `updated_at` moves on
-- every save including the builder's own. There was no author anywhere.
--
-- Two levels, because they answer different questions:
--   content_source (here)  — did the owner ever touch this page at all
--   props._source (in the blocks, no migration needed) — which lines
--
-- 'generated' is the honest default for rows that already exist: every
-- page in the product today was machine-written, and any the owner has
-- since edited will flip the first time they save from Website Builder.
--
-- Stage 2 is what uses it: the owner walks a review list of unbacked
-- claims and keeps, edits or removes each one, and only then does
-- machine-written text stop counting as evidence for that business.
-- Nothing is deleted from a live site by this migration or by any code.

alter table website_pages
  add column if not exists content_source text not null default 'generated'
  check (content_source in ('generated', 'edited'));

comment on column website_pages.content_source is
  'Who last wrote this page: generated (websiteBuilderAgent) or edited (the owner saved it from Website Builder). Used to decide whether its text may count as evidence for a claims check.';
