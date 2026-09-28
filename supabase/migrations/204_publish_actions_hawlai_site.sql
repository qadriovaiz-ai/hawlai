-- 204: let publish_actions record the business's own WEBSITE.
--
-- THE BUG THIS FIXES, live on 2026-09-29. propose_page_meta inserts
-- platform = 'hawlai_site'. The constraint written in 170 and last
-- widened in 179 allows only:
--   ('shopify', 'wordpress', 'woocommerce', 'meta', 'hawlai_shop')
-- so every attempt failed on the FIRST write of the flow with
--   new row for relation "publish_actions" violates check constraint
--   "publish_actions_platform_check"
-- and the owner saw a raw constraint error in chat. Nothing was
-- written: that insert is the first statement in createPublishAction,
-- so no publish action, no approval row, and website_pages was never
-- reached — execute() only runs after an approval that never existed.
--
-- 'hawlai_site' is the business's own website (the website_pages rows
-- behind /site/{slug}): the search title and meta description, proposed
-- in chat and applied only after approval, exactly like the storefront
-- price path that 179 added.
--
-- This is the second time a new platform module shipped without its
-- value in this list. tests/pageMetaEndToEnd.test.ts now parses this
-- constraint out of the migrations and fails if any platform the
-- registry can execute is missing from it, so there is no third time.

alter table publish_actions drop constraint if exists publish_actions_platform_check;

alter table publish_actions
  add constraint publish_actions_platform_check
  check (platform in ('shopify', 'wordpress', 'woocommerce', 'meta', 'hawlai_shop', 'hawlai_site'));

comment on column publish_actions.platform is
  'Which platform executes this action: shopify | wordpress | woocommerce | meta | hawlai_shop (the business''s own storefront, products table) | hawlai_site (the business''s own website, website_pages).';
