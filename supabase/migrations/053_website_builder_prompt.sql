-- Website Builder becomes prompt-first: the owner writes one free-form
-- description ("Create a premium website for my skincare brand...") and
-- the AI plans the page structure + theme + content from it, instead of
-- picking a fixed site-type template from a dropdown. These columns
-- store that original prompt and the AI's resulting business summary so
-- regenerations and future edits stay grounded in what the owner asked
-- for.

alter table websites add column if not exists prompt text;
alter table websites add column if not exists business_summary text;
