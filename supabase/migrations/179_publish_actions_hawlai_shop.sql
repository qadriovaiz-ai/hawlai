-- 179: let publish_actions record the platforms that actually use it.
--
-- Migration 170 created the table with
--   check (platform in ('shopify', 'wordpress', 'woocommerce'))
-- and nothing since widened it — but the code has been inserting
-- platform = 'meta' for ad launches and activations ever since. Either
-- production's constraint was widened by hand, or those inserts have
-- been failing; the repo's own history cannot say which, so this states
-- the full set explicitly and makes repo and production agree.
--
-- 'hawlai_shop' is the new one: price changes on the business's OWN
-- storefront (the products table), proposed in chat and applied only
-- after approval, exactly like the Shopify path.
--
-- wordpress and woocommerce stay listed: both are declared in
-- PlatformId and may get modules later. Nothing inserts them today.

alter table publish_actions drop constraint if exists publish_actions_platform_check;

alter table publish_actions
  add constraint publish_actions_platform_check
  check (platform in ('shopify', 'wordpress', 'woocommerce', 'meta', 'hawlai_shop'));

comment on column publish_actions.platform is
  'Which platform executes this action: shopify | wordpress | woocommerce | meta | hawlai_shop (the business''s own storefront, products table).';
