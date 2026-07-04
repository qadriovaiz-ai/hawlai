-- ============================================
-- Ad creatives: AI-generated / template ad images
-- ============================================
create table if not exists ad_creatives (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  mode text not null check (mode in ('template', 'ai_generate')),
  prompt text,
  background_style text,
  headline text,
  body_copy text,
  generated_image_url text,
  status text default 'draft' check (status in ('draft', 'ready', 'launched', 'failed')),
  meta_ad_id text,
  error_message text,
  created_at timestamptz default now()
);

alter table ad_creatives enable row level security;

create policy "Users view own dealership ad creatives"
  on ad_creatives for select
  using (dealership_id in (select dealership_id from profiles where id = auth.uid()));

create policy "Users insert own dealership ad creatives"
  on ad_creatives for insert
  with check (dealership_id in (select dealership_id from profiles where id = auth.uid()));

create policy "Users update own dealership ad creatives"
  on ad_creatives for update
  using (dealership_id in (select dealership_id from profiles where id = auth.uid()));

-- Storage bucket for the generated/uploaded creative images
insert into storage.buckets (id, name, public)
values ('ad-creatives', 'ad-creatives', true)
on conflict (id) do nothing;

create policy "Public read access to ad creatives"
  on storage.objects for select
  using (bucket_id = 'ad-creatives');

create policy "Authenticated users can upload ad creatives"
  on storage.objects for insert
  with check (bucket_id = 'ad-creatives' and auth.role() = 'authenticated');

create policy "Authenticated users can update ad creatives"
  on storage.objects for update
  using (bucket_id = 'ad-creatives' and auth.role() = 'authenticated');

-- ============================================
-- Calls: allow an in-progress state for AI-triggered calls
-- (previously only supported final states like 'completed')
-- ============================================
alter table calls drop constraint if exists calls_status_check;
alter table calls add constraint calls_status_check
  check (status in ('completed', 'no_answer', 'busy', 'failed', 'voicemail', 'initiated', 'in_progress'));

alter table calls alter column status set default 'initiated';
