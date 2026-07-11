-- ============================================================
-- Business Category — makes the whole platform industry-agnostic
-- ============================================================
-- Every agent's Claude prompt had "Indian car dealership" hardcoded
-- in the prompt text itself. The architecture (Master Brain, agents,
-- approval layer, brand voice) was never car-specific — only the
-- prompt wording was. This makes the business type a real, editable
-- field that every prompt reads dynamically instead.
--
-- Defaults to 'car dealership' so existing dealerships (built and
-- tested against that context) keep behaving exactly as before —
-- nothing changes for them unless they edit this field.

alter table dealerships add column if not exists business_category text default 'car dealership';
