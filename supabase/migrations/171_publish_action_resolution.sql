-- How a publish action's target was identified. Audit trail.
--
-- FOR REVIEW. Not yet run.
--
-- WHY: a merchant says "change the price of the blue kurta". Something
-- turns that phrase into a specific variant id, and if the wrong
-- product ends up repriced, the first question is "how did it pick
-- that one?" — a question the row currently cannot answer.
--
-- The preview shows the resolved product, so an approver COULD have
-- caught a wrong pick. That is not the same as knowing afterwards
-- whether they were shown a single confident match or chose from a
-- list, and the difference decides whether the fix is in the resolver
-- or in how the choice was presented.

alter table publish_actions
  add column if not exists resolution_path text
    check (resolution_path is null or resolution_path in ('exact', 'user_clarified', 'direct')),
  add column if not exists resolution_detail jsonb;

comment on column publish_actions.resolution_path is
  'How target_ref was arrived at. exact = one unambiguous title match, resolved without asking. user_clarified = the person picked from candidates the assistant showed them. direct = a platform id was supplied outright, nothing was searched. Null on rows created before this migration.';

comment on column publish_actions.resolution_detail is
  'Evidence behind resolution_path: the phrase searched, how many candidates were found, and which was chosen. Enough to reconstruct the decision without re-querying a store whose catalogue has since moved on.';

-- Deliberately NOT an enum type. resolution_path will gain values as
-- resolution gets cleverer, and a check constraint is a one-line
-- migration where an enum is an ALTER TYPE plus a deploy ordering
-- problem for a column nothing indexes.

insert into schema_migrations (version, filename)
values ('171', '171_publish_action_resolution.sql')
on conflict (version) do nothing;
