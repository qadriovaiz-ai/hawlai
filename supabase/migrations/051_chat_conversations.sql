-- Persistent Master Chat conversations, so the primary interface can
-- have a real ChatGPT/Claude-style conversation history sidebar
-- instead of losing the thread on every page refresh.

create table if not exists chat_conversations (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  title text default 'New chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references chat_conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tools_used jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_chat_conversations_dealership_id on chat_conversations(dealership_id);
create index if not exists idx_chat_conversations_updated_at on chat_conversations(updated_at desc);
create index if not exists idx_chat_messages_conversation_id on chat_messages(conversation_id);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

drop policy if exists "chat_conversations_dealership_all" on chat_conversations;
create policy "chat_conversations_dealership_all" on chat_conversations
  for all using (dealership_id in (select id from dealerships where owner_id = auth.uid()));

drop policy if exists "chat_messages_dealership_all" on chat_messages;
create policy "chat_messages_dealership_all" on chat_messages
  for all using (conversation_id in (select id from chat_conversations where dealership_id in (select id from dealerships where owner_id = auth.uid())));

create or replace function public.set_chat_conversations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_chat_conversations_update on chat_conversations;
create trigger on_chat_conversations_update
  before update on chat_conversations
  for each row execute procedure public.set_chat_conversations_updated_at();
