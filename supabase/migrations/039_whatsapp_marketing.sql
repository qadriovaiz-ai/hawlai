-- WhatsApp Marketing content generation. All 7 tasks produce
-- WhatsApp-ready message text sent via the existing free click-to-
-- send flow (wa.me links) — Hawlai deliberately doesn't use the paid
-- WhatsApp Business API (see /dashboard/whatsapp), so nothing here is
-- automated/bulk-sent; the dealer taps Send per contact, same as
-- everywhere else WhatsApp already works in the app.

create table if not exists whatsapp_marketing_pieces (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  task_type text not null, -- e.g. 'broadcast', 'chatbot_flow', 'cart_recovery'
  topic text,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_whatsapp_marketing_pieces_dealership_id on whatsapp_marketing_pieces(dealership_id);

alter table whatsapp_marketing_pieces enable row level security;

create policy "whatsapp_marketing_pieces_dealership_all" on whatsapp_marketing_pieces
  for all using (
    dealership_id in (select id from dealerships where owner_id = auth.uid())
  );
