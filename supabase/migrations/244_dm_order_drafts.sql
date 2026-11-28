-- 244: an Instagram order being put together over several messages — O1
-- of docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28
-- November 2026.
--
-- WHY A TABLE, against the plan's "new on F1". The plan expected the
-- order to be rebuilt from the conversation log (auto_reply_log), and
-- that log holds only the words sent. An order needs STRUCTURE between
-- messages — which product ids, how many, the name, phone and address,
-- and above all THE EXACT QUOTE THE CUSTOMER SAID YES TO. Re-reading that
-- out of prose would be a guess, and the yes is what turns into a money
-- request. So it is kept here.
--
-- ONE ROW PER CONVERSATION (business, channel, sender). A later order
-- from the same customer reuses the row: status goes back to 'open' and
-- the items are cleared; the name, phone and address are kept, and are
-- read back to them before anything is placed.
--
--   draft             what has been gathered so far (items by name as the
--                     customer said them, name, phone, address)
--   readback          the quote that was SHOWN — product ids, prices,
--                     delivery fee, total, name, phone, address. A "yes"
--                     places exactly this, or a fresh read-back if the
--                     price changed in between; never something else.
--   readback_sent_at  when it was shown. Cleared the moment a yes claims
--                     it (a conditional update), so two deliveries of
--                     the same "yes" cannot place two orders.
--   order_id          the order the last yes placed.
--
-- RLS: the owner may read their own rows; ONLY the service client
-- writes (the webhook). No INSERT or UPDATE policy — the same shape as
-- integration_health (239).
--
-- ---- BEFORE RUNNING, against the LIVE database -------------------------
--
--   select to_regclass('public.dm_order_drafts');
--
-- Expected: NULL. Anything else means the table already exists — stop
-- and paste it.
--
-- RUN BY HAND, as every migration here is.

create table if not exists dm_order_drafts (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  channel text not null,
  sender_id text not null,
  draft jsonb not null default '{}'::jsonb,
  readback jsonb,
  readback_sent_at timestamptz,
  order_id uuid references orders(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_order_drafts_channel_check check (channel in ('instagram')),
  constraint dm_order_drafts_status_check check (status in ('open', 'ordered', 'cancelled')),
  constraint dm_order_drafts_conversation_key unique (dealership_id, channel, sender_id)
);

alter table dm_order_drafts enable row level security;

drop policy if exists "dm_order_drafts_owner_select" on dm_order_drafts;
create policy "dm_order_drafts_owner_select" on dm_order_drafts
  for select using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );

comment on table dm_order_drafts is
  'Seller Mode O1: one Instagram conversation''s order in progress, and the exact quote the customer was shown. Written by the webhook (service role) only.';

-- ---- VERIFY, after running ------------------------------------------------
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.dm_order_drafts'::regclass order by conname;
--   -- Expected: channel_check (instagram), conversation_key UNIQUE
--   -- (dealership_id, channel, sender_id), the two foreign keys, the
--   -- primary key, status_check (open, ordered, cancelled).
--
--   select relrowsecurity from pg_class where relname = 'dm_order_drafts';
--   -- Expected: true
--
--   select policyname, cmd from pg_policies where tablename = 'dm_order_drafts';
--   -- Expected: one row — dm_order_drafts_owner_select, SELECT. No INSERT.
