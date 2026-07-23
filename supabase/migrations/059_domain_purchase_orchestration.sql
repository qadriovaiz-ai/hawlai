-- Records the registrar's own order id once a domain purchase actually
-- succeeds (POST /api/domains/[id]/purchase), for support/audit lookups.
alter table domain_orders add column if not exists registrar_order_id text;
