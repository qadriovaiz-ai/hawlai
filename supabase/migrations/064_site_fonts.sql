-- Custom fonts — a dealer picks one of a curated set of heading/body
-- font pairings (see src/lib/fontPresets.ts) rather than a free-form
-- combination. Defaults to 'modern' so an existing website with no
-- explicit choice renders exactly as it did before this feature.

alter table websites add column if not exists font_key text default 'modern';
